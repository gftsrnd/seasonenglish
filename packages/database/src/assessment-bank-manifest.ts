import type { StoredAssessmentDefinition, StoredAssessmentTask } from "./assessment-blueprints.js";

export interface BankSource {
  versionId: string;
  blueprint: StoredAssessmentDefinition;
  rubricVersionId?: string | null;
}
interface GroupSelection {
  section: number;
  group: number;
  versionId: string;
  taskOrder?: number[];
  /** Original order indices keyed by immutable source task key. */
  optionOrders?: Record<string, number[]>;
}
export interface BankManifest {
  format: 1;
  anchor: string;
  groups: GroupSelection[];
}

export class AssessmentBankError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode = 409,
    readonly issues: string[] = [],
  ) {
    super(code);
  }
}

function reject(): never {
  throw new AssessmentBankError("ASSESSMENT_BANK_INCOMPATIBLE_SOURCES");
}

function compatibility(source: BankSource) {
  const b = source.blueprint;
  return JSON.stringify([
    b.kind,
    b.targetLevel,
    b.totalMinutes,
    b.totalScore,
    source.rubricVersionId ?? null,
    b.sections.map((s) => [
      s.code,
      s.durationMinutes,
      s.instructions,
      s.maxScore,
      s.groups.map((g) => [
        g.key,
        g.stimulus?.type,
        g.maxPlays,
        g.tasks.map((t) => [
          t.key,
          t.responseType,
          t.maxScore,
          t.minWords,
          t.maxWords,
          t.responseType === "single_choice" ? t.options?.length : t.key,
          t.interaction?.mode,
          t.interaction?.durationSeconds,
          t.interaction?.maxLearnerTurns,
          t.interaction?.endConditions,
          t.interaction?.fallback,
        ]),
      ]),
    ]),
  ]);
}

function permutation(n: number, random: () => number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

const positionReference =
  /\b(?:above|below|previous|next question|following (?:question|answer)|(?:option|answer|choice)\s+[a-d]\b|[a-d]\s+(?:and|or)\s+[a-d]\b|question\s*\d|câu\s*\d|đáp án [a-d]|ở trên|ở dưới|trước đó|cố định|fixed order)\b/i;
const relativeChoice = /(?:\b(?:preceding|following|first|second|third|fourth|last|former|latter|above|below)\b|\b(?:all|both|either|neither|none|any)\s+(?:of\s+)?(?:these|those|the\s+(?:choices|options|answers|statements))\b|\b[a-d]\s*(?:[,&/+]|and|or)\s*[a-d]\b|(?:tất cả|cả hai|ở trên|ở dưới|phía trên|phía dưới|đầu tiên|cuối cùng))/iu;
const namedSection: Record<Section["code"], RegExp> = {
  listening: /\blistening\s+(?:task|part|exercise|section|question|passage|item)\b|\bL[A-C]?[_-]?\d+\b|phần nghe/iu,
  reading: /\breading\s+(?:task|part|exercise|section|question|passage|item)\b|\bR[_-]?\d+\b|phần đọc/iu,
  writing: /\bwriting\s+(?:task|part|exercise|section|question|prompt|item)\b|\bW[_-]?\d+\b|phần viết/iu,
  speaking: /\bspeaking\s+(?:task|part|exercise|section|question|prompt|item)\b|\bS[_-]?\d+\b|phần nói/iu,
};
const crossSectionDependency =
  /(?:\b(?:previous|preceding|earlier|next) section|\b(?:using|from|refer to|based on).{0,30}\b(?:listening|reading|writing|speaking) (?:section|part)|phần (?:nghe|đọc|viết|nói) trước)/i;
const groupDependency =
  /\b(?:previous (?:part|group|passage|section)|preceding (?:part|group|passage|section)|(?:in|from|see|refer to) (?:part|group|section|question)\s+[\da-z]\b|phần trước|nhóm trước)\b/i;
type Section = StoredAssessmentDefinition["sections"][number];
type Group = Section["groups"][number];

function unitsFor(sources: BankSource[]) {
  const units: Array<Array<[number, number]>> = [];
  sources[0]!.blueprint.sections.forEach((section, s) => {
    const slots: Array<[number, number]> = section.groups.map((_, g) => [s, g]);
    // A single passage printed in one group may supply later reading groups.
    const coupled = sources.some((source) => {
      const candidate = source.blueprint.sections[s]!;
      return (
        candidate.groups.some(
          (g) =>
            groupDependency.test(JSON.stringify(g)) ||
            g.tasks.some((t) => /(?:\bquestions?\s+\d+|câu\s+(?:số\s+)?\d+)/iu.test(t.prompt)),
        ) ||
        (candidate.code === "reading" && candidate.groups.some((g) => g.stimulus?.type === "passage"))
      );
    });
    if (coupled) units.push(slots);
    else for (const slot of slots) units.push([slot]);
  });
  return units;
}

function shuffledGroup(section: Section, group: Group, selection: GroupSelection, random: () => number) {
  const context = [group.instruction, group.title, ...section.instructions].join(" ");
  if (positionReference.test(context) || groupDependency.test(context)) return;
  const taskRefs = group.tasks.some((t) => positionReference.test(t.prompt) || groupDependency.test(t.prompt));
  if (taskRefs) return;
  if (
    section.code === "reading" &&
    !group.stimulus &&
    group.tasks.every(
      (t) =>
        t.responseType === "single_choice" && t.maxScore === group.tasks[0]!.maxScore && !/^\s*\d+[.)]/.test(t.prompt),
    )
  )
    selection.taskOrder = permutation(group.tasks.length, random);
  for (const task of group.tasks) {
    const options = task.options;
    if (
      !options ||
      options.length < 2 ||
      options.some((o) => positionReference.test(o.label) || relativeChoice.test(o.label)) ||
      !options.some((o) => o.value === task.correctAnswer)
    )
      continue;
    (selection.optionOrders ??= {})[task.key] = permutation(options.length, random);
  }
}

export function buildBankManifest(sources: BankSource[], mode: "single" | "mixed", random = Math.random): BankManifest {
  if (
    !sources.length ||
    sources.some((s) => s.blueprint.kind === "final") ||
    new Set(sources.map((s) => s.versionId)).size !== sources.length ||
    (mode === "single" ? sources.length !== 1 : sources.length < 2)
  )
    reject();
  if (
    mode === "mixed" &&
    sources.some((source) => source.blueprint.sections.some(section => {
      const content = JSON.stringify(section);
      return crossSectionDependency.test(content) ||
        Object.entries(namedSection).some(([code, pattern]) => code !== section.code && pattern.test(content));
    }))
  )
    reject();
  const shape = compatibility(sources[0]!);
  if (sources.some((s) => compatibility(s) !== shape)) reject();
  const groups: GroupSelection[] = [];
  const units = unitsFor(sources);
  if (sources.length > units.length) reject();
  const orderedUnits = mode === "single" ? units : permutation(units.length, random).map((i) => units[i]!);
  const orderedSources = mode === "single" ? sources : permutation(sources.length, random).map((i) => sources[i]!);
  orderedUnits.forEach((unit, i) => {
    const source = orderedSources[i % sources.length]!;
    for (const [s, g] of unit) {
      const selection: GroupSelection = { section: s, group: g, versionId: source.versionId };
      const section = source.blueprint.sections[s]!;
      if (mode === "mixed" && unit.length === 1) shuffledGroup(section, section.groups[g]!, selection, random);
      groups.push(selection);
    }
  });
  const manifest: BankManifest = { format: 1, anchor: sources[0]!.versionId, groups };
  assembleBankBlueprint(sources, manifest);
  return manifest;
}

function ordered<T>(items: T[], order?: number[]): T[] {
  if (!order) return items;
  if (
    order.length !== items.length ||
    new Set(order).size !== items.length ||
    order.some((i) => !Number.isInteger(i) || i < 0 || i >= items.length)
  )
    reject();
  return order.map((i) => items[i]!);
}

function deliveredTask(task: StoredAssessmentTask, order?: number[]): StoredAssessmentTask {
  if (!order) return task;
  if (!task.options) reject();
  const options = ordered(task.options, order);
  const answerIndex = options.findIndex((o) => o.value === task.correctAnswer);
  if (answerIndex < 0) reject();
  return {
    ...task,
    options: options.map((o, i) => ({ ...o, value: task.options![i]!.value })),
    correctAnswer: task.options[answerIndex]!.value,
  };
}

export function assembleBankBlueprint(sources: BankSource[], manifest: BankManifest): StoredAssessmentDefinition {
  const byId = new Map(sources.map((s) => [s.versionId, s.blueprint]));
  const base = byId.get(manifest.anchor);
  if (!base || manifest.format !== 1) reject();
  const slots = new Map(manifest.groups.map((g) => [g.section + "/" + g.group, g]));
  if (slots.size !== manifest.groups.length || slots.size !== base.sections.reduce((n, s) => n + s.groups.length, 0))
    reject();
  const keys = new Set<string>();
  return {
    ...base,
    sections: base.sections.map((s, si) => ({
      ...s,
      groups: s.groups.map((_, gi) => {
        const slot = slots.get(si + "/" + gi);
        if (!slot) reject();
        const group = byId.get(slot.versionId)?.sections[si]?.groups[gi];
        if (!group) reject();
        return {
          ...group,
          tasks: ordered(group.tasks, slot.taskOrder).map((task) => {
            if (keys.has(task.key)) reject();
            keys.add(task.key);
            return deliveredTask(task, slot.optionOrders?.[task.key]);
          }),
        };
      }),
    })),
  };
}

function contentFingerprints(blueprint: StoredAssessmentDefinition) {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const content = new Set<string>();
  for (const section of blueprint.sections)
    for (const group of section.groups) {
      const stimulus = group.stimulus;
      for (const s of [
        stimulus?.text,
        ...(stimulus?.lines ?? []).map((l) => l.text),
        ...(stimulus?.rows ?? []).map((r) => r.join(" ")),
      ]) {
        if (s && normalize(s).length >= 20) {
          content.add("context " + normalize(s));
          for (const sentence of s.split(/(?<=[.!?])\s+|\n/)) {
            if (normalize(sentence).length >= 40) content.add("sentence " + normalize(sentence));
          }
        }
      }
      if (stimulus?.audioSrc) content.add("audio " + stimulus.audioSrc.trim());
      for (const task of group.tasks) if (task.prompt.trim()) content.add("task " + normalize(task.prompt));
    }
  return content;
}

export function retakeCopyIssues(original: StoredAssessmentDefinition, candidate: StoredAssessmentDefinition) {
  const originalContent = contentFingerprints(original);
  return [...contentFingerprints(candidate)].some((key) => originalContent.has(key))
    ? ["Đề thi lại chứa câu hỏi, đoạn văn hoặc âm thanh đã dùng trong bài đầu vào."]
    : [];
}
