import type { MonthlyOperatorOverviewView } from "@e4s/contracts";

type Framework = MonthlyOperatorOverviewView["frameworks"][number];
type Part = { code: string; title: string; content: Record<string, unknown> };

/**
 * Prefills a manual monthly lesson from the approved plan: the day's core terms
 * with their linked expanded terms, grammar step(s) and pronunciation target.
 * Review days use the week's review allocation (all review terms, steps, sounds).
 */
export function monthlyManualSeed(framework: Framework, lessonNumber: number): { title: string; parts: Part[]; kind: "new" | "review"; date: string; vocabularyCount: number } | null {
  let resources = framework.resources;
  let day = resources?.roadmap?.days.find((item) => item.lessonNumber === lessonNumber);
  const carryover = resources?.carryoverReviews?.find(item => item.lessonNumber === lessonNumber);
  if (carryover && resources) { resources = { ...resources, ...carryover }; day = carryover.day; }
  if (!resources || !day) return null;
  const review = day.kind === "review";
  const ordinal = resources.roadmap!.days.filter((item) => item.kind === "new" && item.lessonNumber <= lessonNumber).length;
  const coreIds = review ? day.reviewTermIds : day.coreTermIds;
  const expandedIds = new Set(review ? day.reviewExpandedTermIds : day.expandedTermIds);
  const cores = resources.coreTerms.filter((term) => coreIds.includes(term.id));
  const supports = resources.supportTerms.filter((term) => expandedIds.has(term.id));
  const linked = (coreId: string, relation: string) => supports.filter((term) => term.relatedCoreTermId === coreId && term.relation === relation);
  const items = cores.map((core) => {
    const umbrella = linked(core.id, "umbrella")[0];
    return {
      word: core.word, type: core.type, ...(core.imageUrl ? { imageUrl: core.imageUrl } : {}), pronunciation: core.ipa, ipa: core.ipa, meaning: core.meaning,
      collocations: linked(core.id, "collocation").map((term) => term.word),
      examples: linked(core.id, "collocation").map((term) => term.word),
      synonyms: linked(core.id, "synonym").map((term) => ({ word: term.word, note: term.meaning })),
      antonyms: linked(core.id, "antonym").map((term) => ({ word: term.word, note: term.meaning })),
      family: linked(core.id, "word_family").map((term) => ({ word: term.word, type: term.type, meaning: term.meaning })),
      ...(umbrella ? { umbrella: { word: umbrella.word, meaning: umbrella.meaning } } : {})
    };
  });
  const stepIds = review ? day.reviewGrammarStepIds ?? [] : day.grammarStepIds;
  const steps = resources.grammarTopics.flatMap((topic) => topic.steps).filter((step) => stepIds.includes(step.id));
  const soundIds = review ? day.reviewSoundIds ?? [] : day.pronunciationPlan?.targetIds ?? (day.soundId ? [day.soundId] : []);
  const sounds = resources.sounds.filter((sound) => soundIds.includes(sound.id));
  const exampleIds = new Set(review ? day.reviewPronunciationExampleIds ?? [] : day.pronunciationPlan?.exampleIds ?? day.pronunciationExampleIds);
  const examplesFor = (sound: (typeof sounds)[number]) => {
    const chosen = sound.examples.filter((example) => exampleIds.has(example.id));
    return chosen.length ? chosen : sound.examples.slice(0, 3);
  };
  const first = sounds[0];
  const focusFor = (code: string) => day.skillExercises?.find((exercise) => exercise.exerciseCode === code)?.focus;
  const withFocus = (code: string): Record<string, unknown> => { const focus = focusFor(code); return focus ? { focus } : {}; };
  const words = cores.map((core) => core.word);
  const title = review
    ? `Weekly review: ${words.slice(0, 4).join(", ")}${words.length > 4 ? "…" : ""}`
    : `Lesson ${ordinal}: ${words.join(", ")}`;
  return {
    kind: review ? "review" : "new",
    date: day.date,
    vocabularyCount: Math.max(3, cores.length),
    title,
    parts: [
      { code: "objective", title: "Mục tiêu bài học", content: { items: [] } },
      { code: "instruction", title: "Hướng dẫn làm bài", content: {} },
      { code: "vocabulary", title: "Từ vựng", content: { items } },
      { code: "grammar", title: "Ngữ pháp", content: steps.length ? { formula: steps.map((step) => step.formula).join("\n"), usage: steps.map((step) => step.usage || step.focus).filter(Boolean).join("\n"), examples: day.grammarPlan ? [] : steps.flatMap((step) => step.examples).slice(0, 3), ...(day.grammarPlan ? { dailyCode: day.grammarPlan.code, objective: day.grammarPlan.objective, items: [], milestoneIds: day.grammarPlan.milestoneIds, recallMilestoneIds: day.grammarPlan.recallMilestoneIds } : {}) } : {} },
      { code: "pronunciation", title: "Phát âm", content: first ? {
        focus: first.ipa,
        words: (review ? examplesFor(first).slice(0, 3) : first.examples.filter(example => day.pronunciationExampleIds.includes(example.id))).map((example) => ({ word: example.word, ipa: example.ipa })),
        ...(day.pronunciationPlan ? { stage: day.pronunciationPlan.stage, objective: day.pronunciationPlan.objective, ...(day.pronunciationPlan.requiredPositions ? { targetPositions: day.pronunciationPlan.requiredPositions, passage: "" } : {}) } : {}),
        ...(review || sounds.length > 1 ? { reviewTargets: sounds.map((sound) => ({ soundId: sound.id, focus: sound.ipa, words: examplesFor(sound).map((example) => ({ word: example.word, ipa: example.ipa })) })) } : {})
      } : {} },
      { code: "listening", title: "Nghe", content: withFocus("listening") },
      { code: "reading", title: "Đọc", content: withFocus("reading") },
      { code: "writing", title: "Viết", content: withFocus("writing") },
      { code: "word_class", title: "Từ loại", content: withFocus("word_class") },
      { code: "word_use", title: "Dùng từ", content: withFocus("word_use") },
      { code: "speaking", title: "Nói", content: withFocus("speaking") }
    ]
  };
}
