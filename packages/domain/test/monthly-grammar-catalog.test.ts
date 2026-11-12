import { describe, expect, it } from "vitest";
import type { CefrLevel } from "@e4s/contracts";
import { planMonthlyResourcePool, validateMonthlyCurriculum, type MonthlyResourcePoolContract } from "../src/index.js";
import { buildMonthlyTeachingCalendar } from "../src/monthly/calendar.js";
import { dailyTeachingPlan } from "../src/monthly/daily-progression.js";
import {
  findMonthlyGrammarCatalogTopic, monthlyGrammarCatalog, monthlyGrammarExampleTranslationIssues, monthlyGrammarContentMarkers, monthlyGrammarCoverageIssues, monthlyGrammarDayCode,
  monthlyGrammarDayStage, monthlyGrammarMonthCodes, monthlyGrammarPairOf, monthlyGrammarTopicTitle, monthlyGrammarUncoveredContents, selectMonthlyGrammarPair
} from "../src/monthly/grammar-catalog.js";

const LEVELS: readonly CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];

/** Same synthetic pool as monthly-daily-progression.test.ts (copied so that suite is not re-run here). */
function progressionPool(cefr: CefrLevel = "A1", month = "2026-11"): MonthlyResourcePoolContract {
  const count = buildMonthlyTeachingCalendar(month).filter(day => day.kind === "new").length * 3;
  return {
    month, cefr, version: 1, theme: { version: 1, title: "Updates", brief: "Explain progress", context: "Office", communicationGoal: "Agree next steps" },
    coreTerms: Array.from({ length: count }, (_, i) => ({ id: `c${i}`, word: `term${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + i % 26)}`, meaning: "nghĩa", type: "noun", ipa: "/t/", source: "core_registry", component: "core" })),
    supportTerms: Array.from({ length: count * 3 }, (_, i) => ({ id: `s${i}`, word: `support${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + i % 26)}`, meaning: "nghĩa", type: "noun", relation: (["umbrella", "synonym", "word_family"] as const)[i % 3]!, source: (["group", "synonym", "family"] as const)[i % 3]!, component: "expanded", relatedCoreTermId: `c${Math.floor(i / 3)}` })),
    grammarTopics: [0, 1].map(t => ({ id: `g${t}`, title: `Topic ${t}`, steps: [0, 1, 2].map(s => ({ id: `g${t}s${s}`, focus: `Focus ${t}.${s}`, formula: "Subject + verb", usage: "Apply the pattern", examples: ["I work here.", "We work here.", "They work here."] })) })),
    sounds: [0, 1, 2, 3].map(s => ({ id: `p${s}`, label: `Target ${s}`, ipa: `/p${s}/`, examples: Array.from({ length: 9 }, (_, i) => ({ id: `p${s}e${i}`, word: `word${s}${i}`, ipa: `/p${s}/` })) }))
  };
}


function roadmapPool(cefr: CefrLevel, month: string, pairIndex = 0) {
  const pool = progressionPool(cefr, month);
  const pair = monthlyGrammarCatalog(cefr)[pairIndex]!;
  pool.grammarTopics = pool.grammarTopics.map((topic, index) => ({ ...topic, catalogId: (index === 0 ? pair.topicA : pair.topicB).id, title: monthlyGrammarTopicTitle(cefr, index === 0 ? pair.topicA : pair.topicB) }));
  return pool;
}

function monthWithNewDays(count: number): string {
  for (let year = 2026; year <= 2032; year += 1) for (let month = 1; month <= 12; month += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (buildMonthlyTeachingCalendar(key).filter((day) => day.kind === "new").length === count) return key;
  }
  throw new Error(`no month with ${count} new days`);
}

describe("grammar roadmap catalog", () => {
  it("has six ordered pairs per level with roadmap rows, pair types and non-empty contents", () => {
    for (const [levelIndex, cefr] of LEVELS.entries()) {
      const catalog = monthlyGrammarCatalog(cefr);
      expect(catalog.map((pair) => pair.order)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(catalog.map((pair) => pair.roadmapMonth)).toEqual([1, 2, 3, 4, 5, 6].map((n) => levelIndex * 6 + n));
      for (const pair of catalog) {
        expect(pair.id).toBe(`${cefr.toLowerCase()}-p${pair.order}`);
        expect([pair.topicA.id, pair.topicB.id]).toEqual([`${pair.id}-a`, `${pair.id}-b`]);
        for (const topic of [pair.topicA, pair.topicB]) {
          expect(topic.titleVi.length).toBeGreaterThan(3);
          expect(topic.titleEn).toMatch(/^[\x20-\x7e]+$/u);
          expect(topic.contents.length).toBeGreaterThanOrEqual(3);
        }
      }
    }
    const a2 = monthlyGrammarCatalog("A2")[1]!;
    expect(a2.topicA.titleVi).toBe("Hiện tại hoàn thành 1");
    expect(a2.topicA.contents).toEqual(["have/has + V3", "just/already/yet", "ever/never", "Have you ever…?", "been vs gone"]);
    expect(a2.pairType).toBe("extension");
    expect(monthlyGrammarCatalog("A1")[1]!.pairType).toBe("contrast");
    expect(monthlyGrammarCatalog("B1")[0]!.pairType).toBe("contrast");
    expect(monthlyGrammarCatalog("C1")[5]!.topicB.titleVi).toBe("Tổ chức thông tin & nhấn mạnh");
  });

  it("titles are Vietnamese roadmap names at A1–A2 and English names from B1", () => {
    const a1 = monthlyGrammarCatalog("A1")[0]!.topicA;
    expect(monthlyGrammarTopicTitle("A1", a1)).toBe("Động từ to be");
    const b1 = monthlyGrammarCatalog("B1")[4]!.topicA;
    expect(monthlyGrammarTopicTitle("B1", b1)).toBe("The passive");
    expect(findMonthlyGrammarCatalogTopic("B1", { title: "the passive" })?.topic.id).toBe("b1-p5-a");
    expect(findMonthlyGrammarCatalogTopic("A1", { title: "Present perfect" })).toBeUndefined();
  });
});

describe("grammar pair selection with 12-month memory", () => {
  it("starts a level with no history at the first pair", () => {
    for (const cefr of LEVELS) expect(selectMonthlyGrammarPair({ cefr, month: "2026-12", history: [] }).pair.order).toBe(1);
  });

  it("takes the next untaught pair in roadmap order and ignores month numbers", () => {
    const history = [
      { month: "2026-09", topics: [{ catalogId: "a2-p1-a" }, { catalogId: "a2-p1-b" }] },
      { month: "2026-10", topics: [{ catalogId: "a2-p2-a" }, { catalogId: "a2-p2-b" }] }
    ];
    const selection = selectMonthlyGrammarPair({ cefr: "A2", month: "2026-12", history });
    expect(selection.pair.id).toBe("a2-p3");
    expect(selection.taughtPairIds).toEqual(["a2-p1", "a2-p2"]);
    expect(selection.newCycle).toBe(false);
  });

  it("continues after the last taught pair and skips pairs already taught in the window", () => {
    const history = [
      { month: "2026-05", topics: [{ catalogId: "b1-p3-a" }, { catalogId: "b1-p3-b" }] },
      { month: "2026-07", topics: [{ catalogId: "b1-p5-a" }, { catalogId: "b1-p5-b" }] },
      { month: "2026-08", topics: [{ catalogId: "b1-p6-a" }, { catalogId: "b1-p6-b" }] },
      { month: "2026-09", topics: [{ catalogId: "b1-p1-a" }, { catalogId: "b1-p1-b" }] }
    ];
    expect(selectMonthlyGrammarPair({ cefr: "B1", month: "2026-10", history }).pair.id).toBe("b1-p2");
    const after = [...history, { month: "2026-10", topics: [{ catalogId: "b1-p2-a" }, { catalogId: "b1-p2-b" }] }];
    expect(selectMonthlyGrammarPair({ cefr: "B1", month: "2026-11", history: after }).pair.id).toBe("b1-p4");
  });

  it("forgets pairs older than 12 months and ignores later months and other-level topics", () => {
    const history = [
      { month: "2025-10", topics: [{ catalogId: "a1-p1-a" }, { catalogId: "a1-p1-b" }] },
      { month: "2026-12", topics: [{ catalogId: "a1-p2-a" }, { catalogId: "a1-p2-b" }] },
      { month: "2026-06", topics: [{ catalogId: "b2-p1-a" }, { title: "Free-form legacy topic" }] }
    ];
    // 2025-10 is outside the window for 2026-11 (window starts 2025-11).
    expect(selectMonthlyGrammarPair({ cefr: "A1", month: "2026-11", history }).pair.id).toBe("a1-p1");
  });

  it("recognises legacy months by exact roadmap title", () => {
    const history = [{ month: "2026-10", topics: [{ title: "Present simple" }, { title: "Present continuous" }] }];
    expect(selectMonthlyGrammarPair({ cefr: "A1", month: "2026-11", history }).pair.id).toBe("a1-p3");
  });

  it("wraps around to a new cycle only after all six pairs are covered", () => {
    const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
    const history = months.map((month, index) => ({ month, topics: [{ catalogId: `c1-p${index + 1}-a` }, { catalogId: `c1-p${index + 1}-b` }] }));
    const seventh = selectMonthlyGrammarPair({ cefr: "C1", month: "2026-07", history });
    expect(seventh.pair.id).toBe("c1-p1");
    expect(seventh.newCycle).toBe(true);
    const eighth = selectMonthlyGrammarPair({ cefr: "C1", month: "2026-08", history: [...history, { month: "2026-07", topics: [{ catalogId: "c1-p1-a" }, { catalogId: "c1-p1-b" }] }] });
    expect(eighth.pair.id).toBe("c1-p2");
    // Five of six taught: the remaining pair is taken, no new cycle yet.
    expect(selectMonthlyGrammarPair({ cefr: "C1", month: "2026-06", history: history.slice(0, 5) })).toMatchObject({ newCycle: false, pair: { id: "c1-p6" } });
  });

  it("simulates a level generating every month: 1→6, then 1→6 again", () => {
    const history: Array<{ month: string; topics: Array<{ catalogId: string }> }> = [];
    const picked: number[] = [];
    for (let index = 0; index < 14; index += 1) {
      const month = `${2027 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
      const { pair } = selectMonthlyGrammarPair({ cefr: "B2", month, history });
      picked.push(pair.order);
      history.push({ month, topics: [{ catalogId: pair.topicA.id }, { catalogId: pair.topicB.id }] });
    }
    expect(picked).toEqual([1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 1, 2]);
  });
});

describe("grammar roadmap day mapping", () => {
  it("maps N1–N18 to A1–A6, B1–B6, K1–K3, M1–M3 and the scaffolding stages", () => {
    expect(Array.from({ length: 18 }, (_, i) => monthlyGrammarDayCode(i + 1))).toEqual([
      "A1", "A2", "A3", "A4", "A5", "A6", "B1", "B2", "B3", "B4", "B5", "B6", "K1", "K2", "K3", "M1", "M2", "M3"
    ]);
    expect([1, 2, 3, 4, 5, 6].map(monthlyGrammarDayStage)).toEqual(["identify", "structure", "variation", "meaning_use", "common_errors", "application"]);
    expect([7, 8, 9, 10, 11, 12].map(monthlyGrammarDayStage)).toEqual(["identify", "structure", "variation", "meaning_use", "common_errors", "application"]);
    expect([13, 14, 15, 16, 17, 18].map(monthlyGrammarDayStage)).toEqual(["link", "mixed_practice", "workplace_task", "error_review", "long_context", "mock_test"]);
    expect(monthlyGrammarMonthCodes(15).at(-1)).toBe("K3");
    expect(monthlyGrammarMonthCodes(16).slice(-1)).toEqual(["M1"]);
    expect(monthlyGrammarMonthCodes(17).slice(-2)).toEqual(["M1", "M2"]);
    expect(monthlyGrammarMonthCodes(18).slice(-3)).toEqual(["M1", "M2", "M3"]);
  });

  it.each([15, 16, 17, 18])("plans a %i-new-day roadmap month: codes, stages, A recall on N7–N12, M3 last", (count) => {
    const month = monthWithNewDays(count);
    const contract = planMonthlyResourcePool(roadmapPool("A2", month, 1));
    expect(validateMonthlyCurriculum(contract)).toEqual([]);
    const days = contract.daySpecs.filter((day) => day.kind === "new");
    expect(days).toHaveLength(count);
    expect(days.map((day) => day.grammarPlan?.code)).toEqual(monthlyGrammarMonthCodes(count));
    expect(days.map((day) => day.grammarPlan?.stage)).toEqual(Array.from({ length: count }, (_, i) => monthlyGrammarDayStage(i + 1)));
    const [a, b] = contract.grammarTopics;
    // Six scaffolding days per topic over its three stored steps (two daily objectives each).
    expect(days.slice(0, 6).map((day) => day.grammarStepId)).toEqual([0, 0, 1, 1, 2, 2].map((s) => a!.steps[s]!.id));
    expect(days.slice(6, 12).map((day) => day.grammarStepId)).toEqual([0, 0, 1, 1, 2, 2].map((s) => b!.steps[s]!.id));
    expect(days.slice(0, 6).every((day) => day.grammarPlan?.recallMilestoneIds.length === 0)).toBe(true);
    // Every B day (N7–N12) recalls topic A, walking through A's steps.
    expect(days.slice(6, 12).map((day) => day.grammarPlan?.recallMilestoneIds)).toEqual([0, 0, 1, 1, 2, 2].map((s) => [a!.steps[s]!.id]));
    expect(days.slice(12).every((day) => day.grammarPlan?.recallMilestoneIds.length === 0)).toBe(true);
    expect(days.slice(12).every((day) => day.grammarStepIds?.length === 2)).toBe(true);
    if (count === 18) expect(days.at(-1)!.grammarPlan?.code).toBe("M3");
    // K1 of an extension pair joins A and B.
    expect(days[12]!.grammarPlan?.objective).toMatch(/^K1 Nối A–B/u);
  });

  it("K1 contrasts A and B for a contrast pair and B1+ objectives are English", () => {
    const contract = planMonthlyResourcePool(roadmapPool("B1", "2026-11", 0));
    const k1 = contract.daySpecs.find((day) => day.grammarPlan?.code === "K1")!;
    expect(k1.grammarPlan?.objective).toMatch(/^K1 Contrast A–B: choose Present simple vs present continuous or Past simple/u);
    expect(k1.grammarPlan?.mode).toBe("contrast");
  });

  it("leaves legacy (non-roadmap) plans unchanged", () => {
    const pool = progressionPool("A1", "2026-11");
    const plan = dailyTeachingPlan(13, pool.grammarTopics, pool.sounds, "A1");
    expect(plan.grammarPlan).not.toHaveProperty("stage");
    expect(plan.grammarPlan.mode).toBe("contrast");
    expect(dailyTeachingPlan(7, pool.grammarTopics, pool.sounds, "A1").grammarPlan.recallMilestoneIds).toEqual([]);
    expect(dailyTeachingPlan(8, pool.grammarTopics, pool.sounds, "A1").grammarPlan.recallMilestoneIds).toEqual(["g0s0"]);
    expect(monthlyGrammarPairOf("A1", pool.grammarTopics)).toBeUndefined();
    expect(validateMonthlyCurriculum(planMonthlyResourcePool(pool))).toEqual([]);
  });
});

describe("grammar roadmap coverage gate", () => {
  const presentPerfect = monthlyGrammarCatalog("A2")[1]!.topicA;

  it("extracts English markers and skips Vietnamese-only items", () => {
    expect(monthlyGrammarContentMarkers("just/already/yet").strong).toEqual(["just", "already", "yet"]);
    expect(monthlyGrammarContentMarkers("am/is/are").weak).toEqual(["am", "is", "are"]);
    expect(monthlyGrammarContentMarkers("sở hữu cách 's (Anna's desk)").strong).toEqual(["'s"]);
    expect(monthlyGrammarContentMarkers("đếm được/không đếm được")).toEqual({ strong: [], weak: [] });
    expect(monthlyGrammarContentMarkers("used to + V (thói quen cũ)").strong).toEqual(["used"]);
  });

  it("reports roadmap items the topic does not cover", () => {
    const topic = { title: "Hiện tại hoàn thành 1", steps: [
      { focus: "have/has + V3", formula: "S + have/has + V3", usage: "Kết quả ở hiện tại", examples: ["I have sent the file."], dailyObjectives: ["Nhận diện", "Cấu trúc"] },
      { focus: "just, already, yet", formula: "have just/already + V3; haven't + V3 + yet", usage: "", examples: ["Have you ever worked remotely?"], dailyObjectives: [] },
      { focus: "Lỗi hay gặp", formula: "S + have/has + V3", usage: "", examples: [], dailyObjectives: [] }
    ] };
    expect(monthlyGrammarUncoveredContents(presentPerfect, topic)).toEqual(["been vs gone"]);
    topic.steps[2]!.examples.push("She has gone to Da Nang; she has been there twice.");
    expect(monthlyGrammarUncoveredContents(presentPerfect, topic)).toEqual([]);
    const issues = monthlyGrammarCoverageIssues("A2", [{ ...topic, steps: topic.steps.slice(0, 1), id: "a2-grammar-1", catalogId: presentPerfect.id }]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/does not cover roadmap content: "just\/already\/yet" \(use at least one of: just, already, yet\)/u);
    expect(monthlyGrammarCoverageIssues("A2", [{ ...topic, id: "legacy" }])).toEqual([]);
  });
});

describe("A1–A2 grammar example translations", () => {
  const examples = ["I have sent the report.", "She has booked the room."];
  it("requires one short Vietnamese translation per example at A1–A2", () => {
    expect(monthlyGrammarExampleTranslationIssues("A2", examples, ["Tôi đã gửi báo cáo.", "Cô ấy đã đặt phòng."])).toEqual([]);
    expect(monthlyGrammarExampleTranslationIssues("A1", examples, undefined)[0]).toMatch(/one short Vietnamese translation per grammar.examples sentence/u);
    expect(monthlyGrammarExampleTranslationIssues("A1", examples, ["Tôi đã gửi báo cáo."])[0]).toMatch(/2 expected, received 1/u);
    expect(monthlyGrammarExampleTranslationIssues("A2", examples, ["Tôi đã gửi báo cáo.", "She has booked the room."])).toEqual(["grammar.exampleTranslations[1] must be a Vietnamese translation of example 2"]);
    expect(monthlyGrammarExampleTranslationIssues("A2", examples, ["Tôi đã gửi báo cáo.", `Cô ấy ${"đã đặt phòng ".repeat(20)}`])[0]).toMatch(/must be short/u);
  });

  it("keeps Vietnamese out of the spoken examples and has no translations from B1", () => {
    expect(monthlyGrammarExampleTranslationIssues("A2", ["I have sent it. (Tôi đã gửi.)"], ["Tôi đã gửi."])[0]).toMatch(/read aloud in English.*into grammar.exampleTranslations/u);
    expect(monthlyGrammarExampleTranslationIssues("B1", examples, undefined)).toEqual([]);
    expect(monthlyGrammarExampleTranslationIssues("B2", examples, ["Tôi đã gửi báo cáo.", "Cô ấy đã đặt phòng."])).toEqual(["grammar.exampleTranslations must be omitted at B2 (no Vietnamese translations from B1)"]);
  });
});
