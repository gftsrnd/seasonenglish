import type { MonthlyResourcePlanTaskOutput } from "@e4s/ai";
import { describe, expect, it } from "vitest";
import { runMonthlyCorePhase, type MonthlyPhaseTargets } from "./monthly-core-phase.js";
import { buildMonthlyCoreCandidatesPrompt, getMonthlyGrammarPhaseIssues, runMonthlyGrammarPhaseWithRetry, selectMonthlyCoreCandidates, selectMonthlyPronunciationCandidates } from "./monthly-resource-generation.js";
import {
  buildMonthlyCrossLevelCoreExclusions,
  buildMonthlyPronunciationExampleRepairInstruction,
  buildMonthlyPronunciationExampleRules,
  getMonthlyCoreLevelIssue,
  getMonthlyPronunciationExampleQualityIssue,
  monthlyNonWordIssue
} from "./monthly-resource-quality-gates.js";

type CoreTerm = MonthlyResourcePlanTaskOutput["coreTerms"][number];
type SupportTerm = MonthlyResourcePlanTaskOutput["expandedTerms"][number];
type Example = MonthlyResourcePlanTaskOutput["pronunciationTargets"][number]["words"][number];

// Real outputs of the 2026-11 regenerations (docs/ai-resource-fix-2026-11-11.md, section 6;
// .artifacts/regen-backup-2026-11-11/contracts-before|after).
const B2_V5_TOO_EASY = ["client", "team", "manager", "problem", "message", "cancel", "change", "comment", "head", "colleague", "review"];
const B2_V5_SHARED_WITH_B1 = ["client", "present", "manager", "schedule", "accurate", "confirm", "progress", "problem", "request", "propose", "consultant", "change", "complete", "developer", "solution", "team", "adjust", "spreadsheet", "extend", "inform", "upload", "improve"];
const B2_V5_SHARED_WITH_C1 = ["revise", "deliverable", "postpone", "efficiently", "clarify", "implement"];
const C1_V3_SHARED_WITH_B1 = ["present", "document", "problem", "confirm", "request", "accurate", "supplier", "feedback", "change", "complete", "progress", "solution", "consultant", "propose", "partner", "developer", "adjust", "upload", "evaluate", "improve"];
const B1_CORES = [...new Set([...B2_V5_SHARED_WITH_B1, ...C1_V3_SHARED_WITH_B1])];
const C1_CORES = [...B2_V5_SHARED_WITH_C1, "articulate", "discrepancy", "endorse", "meticulous", "procurement", "contingency"];

const example = (word: string, ipa: string): Example => ({ word, ipa });
const pick = (targetIpa: string, words: Example[], options: { targetLabel?: string; coreTerms?: Array<{ word: string; ipa: string }> } = {}) => selectMonthlyPronunciationCandidates({
  candidates: words,
  forbiddenWords: new Set(),
  needed: words.length,
  targetIpa,
  ...options
});

describe("core level gate (B2/C1 regeneration evidence)", () => {
  it("rejects the A1–A2 words the B2 v5 regeneration kept as cores, accepts B1-labelled review cores at B2, and keeps them too easy for C1", () => {
    for (const word of B2_V5_TOO_EASY) {
      expect(getMonthlyCoreLevelIssue({ word, cefr: "A1" }, "B2"), word).toContain("below B1");
      expect(getMonthlyCoreLevelIssue({ word, cefr: "A2" }, "B2"), word).toContain("below B1");
      expect(getMonthlyCoreLevelIssue({ word, cefr: "B1" }, "B2"), word).toBeUndefined();
      expect(getMonthlyCoreLevelIssue({ word, cefr: "B2" }, "C1"), word).toContain("too easy for a C1 core");
    }
  });

  it("rejects every B2 core shared with B1 or C1 of the same month", () => {
    const exclusions = buildMonthlyCrossLevelCoreExclusions("B2", [{ cefr: "B1", words: B1_CORES }, { cefr: "C1", words: C1_CORES }]);
    for (const word of [...B2_V5_SHARED_WITH_B1, ...B2_V5_SHARED_WITH_C1]) {
      expect(getMonthlyCoreLevelIssue({ word, cefr: "B2" }, "B2", exclusions), word).toBeTruthy();
    }
    expect(getMonthlyCoreLevelIssue({ word: "deliverable" }, "B2", exclusions)).toBe("already a C1 core word this month; levels must not share core words");
    expect(getMonthlyCoreLevelIssue({ word: "spreadsheet" }, "B2", exclusions)).toBe("already a B1 core word this month; levels must not share core words");
  });

  it("rejects the 20 C1 v3 cores shared with B1 and keeps genuine C1 words", () => {
    const exclusions = buildMonthlyCrossLevelCoreExclusions("C1", [{ cefr: "B1", words: B1_CORES }]);
    for (const word of C1_V3_SHARED_WITH_B1) expect(getMonthlyCoreLevelIssue({ word, cefr: "C1" }, "C1", exclusions), word).toBeTruthy();
    for (const word of ["articulate", "discrepancy", "endorse", "meticulous", "procurement", "scrutinise", "contingency", "satisfactory", "thoroughly"]) {
      expect(getMonthlyCoreLevelIssue({ word, cefr: "C1" }, "C1", exclusions), word).toBeUndefined();
    }
  });

  it("rejects a core labelled below the level band, and non-words", () => {
    expect(getMonthlyCoreLevelIssue({ word: "allocate", cefr: "B1" }, "C1")).toContain("below B2");
    expect(getMonthlyCoreLevelIssue({ word: "allocate", cefr: "A2" }, "B2")).toContain("below B1");
    expect(getMonthlyCoreLevelIssue({ word: "allocate", cefr: "B1" }, "B2")).toBeUndefined();
    expect(getMonthlyCoreLevelIssue({ word: "allocate", cefr: "A1" }, "B1")).toContain("below A2");
    expect(getMonthlyCoreLevelIssue({ word: "allocate", cefr: "A2" }, "B1")).toBeUndefined();
    for (const word of ["ot", "est", "min", "info", "nth"]) expect(monthlyNonWordIssue(word), word).toBeTruthy();
    expect(monthlyNonWordIssue("forecast")).toBeUndefined();
  });

  it("keeps A1–A2–B1 overlap a warning only, blocks every pair involving B2/C1, and leaves basic words valid at A1–B1", () => {
    expect(buildMonthlyCrossLevelCoreExclusions("A2", [{ cefr: "A1", words: ["team"] }, { cefr: "B1", words: ["deadline"] }, { cefr: "C1", words: ["endorse"] }]).size).toBe(0);
    const b1 = buildMonthlyCrossLevelCoreExclusions("B1", [{ cefr: "A1", words: ["team"] }, { cefr: "A2", words: ["deadline"] }, { cefr: "B2", words: ["negotiate"] }, { cefr: "C1", words: ["endorse"] }]);
    expect([...b1.entries()]).toEqual([["negotiate", "B2"], ["endorse", "C1"]]);
    const b2 = buildMonthlyCrossLevelCoreExclusions("B2", [{ cefr: "A2", words: ["outline"] }, { cefr: "B1", words: ["milestone"] }]);
    expect([...b2.keys()]).toEqual(["outline", "milestone"]);
    expect(getMonthlyCoreLevelIssue({ word: "team" }, "A2")).toBeUndefined();
    expect(getMonthlyCoreLevelIssue({ word: "client" }, "B1")).toBeUndefined();
  });

  it("is applied by selectMonthlyCoreCandidates with the other levels' cores", () => {
    const core = (word: string, cefr: "A2" | "B1" | "B2" = "B2"): CoreTerm & { cefr: "A2" | "B1" | "B2" } => ({ id: word, word, meaning: `nghĩa ${word}`, type: "verb", ipa: "/x/", cefr });
    const result = selectMonthlyCoreCandidates({
      candidates: [core("client", "A2"), core("present"), core("revise"), core("negotiate"), core("allocate", "B1")],
      existingCoreWords: new Set(),
      needed: 5,
      cefr: "B2",
      otherLevelCoreWords: buildMonthlyCrossLevelCoreExclusions("B2", [{ cefr: "B1", words: B1_CORES }, { cefr: "C1", words: C1_CORES }])
    });
    expect(result.selected.map((term) => term.word)).toEqual(["negotiate", "allocate"]);
    expect(result.rejected).toEqual([
      "client -> client (labelled CEFR A2, below B1, the lowest core level for B2)",
      "present -> present (already a B1 core word this month; levels must not share core words)",
      "revise -> revise (already a C1 core word this month; levels must not share core words)"
    ]);
  });

  it("states the target level, too-easy examples and the exclusion list in the core prompt", () => {
    const prompt = buildMonthlyCoreCandidatesPrompt({
      cefr: "B2", theme: "Project updates", communicationGoal: "Report progress", existingCoreWords: [], batchNumber: 1, preflightRelations: true,
      otherLevelCoreWords: buildMonthlyCrossLevelCoreExclusions("B2", [{ cefr: "B1", words: ["deadline", "request"] }, { cefr: "C1", words: ["deliverable"] }])
    });
    expect(prompt).toContain("TARGET LEVEL B2 (upper-intermediate)");
    expect(prompt).toContain("at the target level B2 or ONE level below (B1), i.e. CEFR B1–B2");
    expect(prompt).toContain("rejects a core labelled below B1 or above B2");
    expect(prompt).toContain("Only A1–A2 words are too easy for a B2 core: do not use A1–A2 basic words (for example client, team, manager, colleague, head, problem, message, comment, review, change, cancel");
    expect(prompt).not.toContain("examples of rejected too-easy words");
    expect(prompt).toContain("OTHER CEFR LEVELS OF THIS MONTH");
    expect(prompt).toContain("B1: deadline, request; C1: deliverable");
    expect(prompt).not.toContain("or below, never above it");
    const c1 = buildMonthlyCoreCandidatesPrompt({ cefr: "C1", theme: "Project updates", communicationGoal: "Report progress", existingCoreWords: [], batchNumber: 1 });
    expect(c1).toContain("CEFR B2–C1");
    expect(c1).toContain("examples of rejected too-easy words: client, team, manager, colleague, head, problem, message, comment, review, change, cancel");
    const b1 = buildMonthlyCoreCandidatesPrompt({ cefr: "B1", theme: "Project updates", communicationGoal: "Report progress", existingCoreWords: [], batchNumber: 1 });
    expect(b1).toContain("CEFR A2–B1");
    expect(b1).toContain("Only A1 words are too easy for a B1 core");
    const a1 = buildMonthlyCoreCandidatesPrompt({ cefr: "A1", theme: "Office", communicationGoal: "Talk", existingCoreWords: [], batchNumber: 1 });
    expect(a1).toContain("must be at CEFR A1 or below");
  });
});

describe("core phase repair loop feeds level rejections back to the AI", () => {
  const coreWithEdges = (word: string, id: string, cefr: "A2" | "B2" = "B2") => ({
    core: { id, word, meaning: `nghĩa ${word}`, type: "noun", ipa: "/x/", cefr },
    edges: [
      { id: `${id}-u`, word: `umb${word}`, meaning: "nghĩa", type: "noun", relation: "umbrella" as const, relatesToCoreId: id },
      { id: `${id}-s`, word: `syn${word}`, meaning: "nghĩa", type: "noun", relation: "synonym" as const, relatesToCoreId: id, definition: "a word with the same sense" },
      { id: `${id}-f`, word: `${word}ness`, meaning: "nghĩa", type: "noun", relation: "word_family" as const, relatesToCoreId: id }
    ] satisfies SupportTerm[]
  });

  it("rejects below-band and cross-level cores in round 1 and lists them in the round 2 prompt", async () => {
    const prompts: string[] = [];
    let round = 0;
    const generate = async (prompt: string, batch: CoreTerm[], _targets: MonthlyPhaseTargets): Promise<MonthlyResourcePlanTaskOutput> => {
      if (batch.length) return { coreTerms: [], expandedTerms: [], grammarTopics: [], pronunciationTargets: [] };
      prompts.push(prompt);
      round = prompt.includes("RETRY FOR CORE BATCH") ? 2 : 1;
      const words = round === 1 ? ["client", "team", "colleague", "revise"] : ["quabx", "qubbx"];
      const entries = words.map((word, index) => coreWithEdges(word, `r${round}-${index}`, round === 1 && word !== "revise" ? "A2" : "B2"));
      return { coreTerms: entries.map((entry) => entry.core), expandedTerms: entries.flatMap((entry) => entry.edges), grammarTopics: [], pronunciationTargets: [] };
    };
    const audit = async (_core: CoreTerm, candidates: SupportTerm[]): Promise<MonthlyResourcePlanTaskOutput> => ({ coreTerms: [], expandedTerms: candidates, grammarTopics: [], pronunciationTargets: [] });
    const result = await runMonthlyCorePhase({
      cefr: "B2",
      theme: { title: "Project updates", communicationGoal: "Report progress" },
      neededCount: 2,
      maxRepeatedPlacements: 100,
      maxPhrasePlacements: 100,
      supportTargetPerCore: 3,
      generate,
      audit,
      candidatesPerCall: 4,
      maxParallelCalls: 1,
      maxRounds: 3,
      minRequest: 4,
      otherLevelCoreWords: buildMonthlyCrossLevelCoreExclusions("B2", [{ cefr: "C1", words: ["revise"] }])
    });
    expect(result.coreTerms.map((term) => term.word)).toEqual(["quabx", "qubbx"]);
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("C1: revise");
    expect(prompts[1]).toContain("LEVEL REPAIR: the application rejected these core candidates — labelled below the B2 band: client, team, colleague; already core words of another level this month: revise.");
    expect(prompts[1]).toContain("Replace them with words that genuinely belong to CEFR B2");
  });
});

describe("pronunciation example gate (real bad outputs)", () => {
  it("A1 /ɜː/ and /æ/: problem, project, ot and job are rejected", () => {
    const vowel = pick("/ɜː/", [
      example("learn", "/lɜːn/"), example("work", "/wɜːk/"), example("early", "/ˈɜːli/"), example("person", "/ˈpɜːsn/"), example("turn", "/tɜːn/"),
      example("problem", "/ˈprɒbləm/"), example("project", "/ˈprɒdʒekt/"), example("project", "/ˈprɜːdʒekt/")
    ]);
    expect(vowel.selected.map((item) => item.word)).toEqual(["learn", "work", "early", "person", "turn"]);
    expect(vowel.rejected.join(" ")).toContain("problem -> problem");
    const ae = pick("/æ/", [example("back", "/bæk/"), example("manager", "/ˈmænɪdʒə(r)/"), example("laptop", "/ˈlæptɒp/"), example("ot", "/ɒt/"), example("job", "/dʒɒb/"), example("job", "/dʒæb/")]);
    expect(ae.selected.map((item) => item.word)).toEqual(["back", "manager", "laptop"]);
    expect(ae.rejected.some((entry) => entry.startsWith("job -> job") && entry.includes("cannot be pronounced with /æ/"))).toBe(true);
  });

  it("A2 /s/: zoom, easy, busy and noise are rejected whether the IPA is honest or faked", () => {
    const result = pick("/s/", [
      example("schedule", "/ˈskedʒuːl/"), example("success", "/səkˈses/"), example("staff", "/stɑːf/"), example("supplier", "/səˈplaɪər/"), example("service", "/ˈsɜːvɪs/"),
      example("sales", "/seɪlz/"), example("cost", "/kɒst/"), example("test", "/test/"), example("absence", "/ˈæbsəns/"),
      example("zoom", "/zuːm/"), example("zoom", "/suːm/"), example("easy", "/ˈiːzi/"), example("easy", "/ˈiːsi/"), example("busy", "/ˈbɪsi/"), example("noise", "/nɔɪs/")
    ]);
    expect(result.selected.map((item) => item.word)).toEqual(["schedule", "success", "staff", "supplier", "service", "sales", "cost", "test", "absence"]);
    expect(result.rejected).toHaveLength(6);
  });

  it("A2 /ɪ/: clear, meeting and min are rejected", () => {
    const result = pick("/ɪ/", [
      example("visit", "/ˈvɪzɪt/"), example("quick", "/kwɪk/"), example("finish", "/ˈfɪnɪʃ/"), example("fix", "/fɪks/"), example("bill", "/bɪl/"),
      example("clear", "/klɪər/"), example("meeting", "/ˈmiːtɪŋ/"), example("min", "/mɪn/")
    ]);
    expect(result.selected.map((item) => item.word)).toEqual(["visit", "quick", "finish", "fix", "bill"]);
    expect(result.rejected.find((entry) => entry.startsWith("meeting"))).toContain("stressed vowel of /ˈmiːtɪŋ/ is /iː/");
    expect(result.rejected.find((entry) => entry.startsWith("min"))).toContain("abbreviation");
  });

  it("B1 stress: supplier, present (core verb), and 3-syllable words for a two-syllable label are rejected", () => {
    const coreTerms = [{ word: "present", ipa: "/prɪˈzent/" }];
    const twoSyllable = pick("/ˈ/", [
      example("deadline", "/ˈdedlaɪn/"), example("problem", "/ˈprɒbləm/"), example("schedule", "/ˈʃedjuːl/"), example("progress", "/ˈprəʊɡres/"), example("feedback", "/ˈfiːdbæk/"),
      example("supplier", "/səˈplaɪər/"), example("present", "/ˈprez.ənt/"), example("document", "/ˈdɒkjumənt/"), example("manager", "/ˈmænɪdʒər/")
    ], { targetLabel: "Word stress on the first syllable of two-syllable nouns", coreTerms });
    expect(twoSyllable.selected.map((item) => item.word)).toEqual(["deadline", "problem", "schedule", "progress", "feedback"]);
    expect(twoSyllable.rejected.find((entry) => entry.startsWith("supplier"))).toContain("stresses syllable 2");
    expect(twoSyllable.rejected.find((entry) => entry.startsWith("present"))).toContain("core word this month pronounced /prɪˈzent/");
    const firstSyllable = pick("/ˈ/", [example("document", "/ˈdɒkjumənt/"), example("office", "/ˈɒfɪs/"), example("budget", "/ˈbʌdʒɪt/"), example("supplier", "/səˈplaɪər/")], { targetLabel: "Primary stress on the first syllable of workplace nouns" });
    expect(firstSyllable.selected.map((item) => item.word)).toEqual(["document", "office", "budget"]);
  });

  it("B1 /ks/ and C1 clusters: tracks /trædks/, count /krʌnt/, ax, client, est and extend are rejected", () => {
    const ks = pick("/ks/", [example("fix", "/fɪks/"), example("tasks", "/tɑːsks/"), example("checks", "/tʃeks/"), example("works", "/wɜːrks/"), example("tracks", "/trædks/"), example("ax", "/æks/")]);
    expect(ks.selected.map((item) => item.word)).toEqual(["fix", "tasks", "checks", "works"]);
    expect(ks.rejected.find((entry) => entry.startsWith("tracks"))).toContain("has /d/, which the spelling \"tracks\" cannot produce");
    const st = pick("/st/", [
      example("request", "/rɪˈkwest/"), example("forecast", "/ˈfɔːkɑːst/"), example("first", "/fɜːst/"), example("adjust", "/əˈdʒʌst/"), example("suggest", "/səˈdʒest/"),
      example("client", "/ˈklaɪ.ənt/"), example("est", "/est/"), example("extend", "/ɪkˈstend/")
    ], { targetLabel: "Final consonant cluster /st/ in workplace words" });
    expect(st.selected.map((item) => item.word)).toEqual(["request", "forecast", "first", "adjust", "suggest"]);
    expect(st.rejected).toHaveLength(3);
    expect(getMonthlyPronunciationExampleQualityIssue({ targetIpa: "/nt/", word: "count", ipa: "/krʌnt/" })).toContain("has /r/");
  });

  it("B2 /ɪ/: feedback and sequence (stressed /iː/) are rejected", () => {
    const result = pick("/ɪ/", [example("risk", "/rɪsk/"), example("revision", "/rɪˈvɪʒn/"), example("feedback", "/ˈfiːdbæk/"), example("sequence", "/ˈsiːkwəns/")]);
    expect(result.selected.map((item) => item.word)).toEqual(["risk", "revision"]);
  });

  it("tells the model the example rules and lists rejected examples in the repair instruction", () => {
    const rules = buildMonthlyPronunciationExampleRules();
    for (const fragment of ["meeting /ˈmiːtɪŋ/ does not illustrate /ɪ/", "zoom, easy, busy and noise have /z/", "extend ends in /nd/", "supplier /səˈplaɪə/", "min, est, ot", "tracks is /træks/"]) expect(rules).toContain(fragment);
    const rejected = pick("/s/", [example("zoom", "/zuːm/"), example("easy", "/ˈiːsi/")]).rejected;
    const repair = buildMonthlyPronunciationExampleRepairInstruction({ ipa: "/s/", label: "Consonant /s/" }, rejected, 4);
    expect(repair).toContain("keep exactly this target — ipa /s/");
    expect(repair).toContain("4 more examples are still needed");
    expect(repair).toContain("zoom -> zoom (IPA /zuːm/ does not illustrate target /s/)");
    expect(repair).toContain("easy -> easy (the s in \"easy\" is normally voiced /z/");
  });
});

describe("dailyObjectives language rule (round 1) stays in the generation loop", () => {
  const grammar = (objective: string): MonthlyResourcePlanTaskOutput => ({
    coreTerms: [], expandedTerms: [], pronunciationTargets: [],
    grammarTopics: [0, 1].map((topic) => ({
      id: `g${topic}`, title: `Topic ${topic}`,
      steps: [0, 1, 2].map((step) => ({ id: `g${topic}-s${step}`, focus: `Focus ${step}`, formula: "S + V", usage: "Use it.", examples: ["We confirm the date."], dailyObjectives: [`${objective} ${topic}-${step}a`, `Apply the pattern in a work email ${topic}-${step}b`] }))
    }))
  });

  it("rejects the real Vietnamese B1 objective at B1, B2 and C1 and asks for English on retry", async () => {
    const vietnamese = grammar("Nhận biết cấu trúc could/would + you + V1 và mức độ lịch sự");
    for (const cefr of ["B1", "B2", "C1"]) expect(getMonthlyGrammarPhaseIssues(vietnamese, cefr).join(" "), cefr).toContain(`dailyObjectives must be in simple English for ${cefr}`);
    expect(getMonthlyGrammarPhaseIssues(vietnamese, "A2")).toEqual([]);
    const prompts: string[] = [];
    const english = grammar("Recognise could/would + you + base verb and how polite it is");
    const result = await runMonthlyGrammarPhaseWithRetry(async (prompt) => { prompts.push(prompt); return prompts.length === 1 ? vietnamese : english; }, "B2");
    expect(result).toBe(english);
    expect(prompts[0]).toContain("write dailyObjectives in simple English with no Vietnamese words");
    expect(prompts[0]).toContain("simple English for B1, B2 and C1");
    expect(prompts[1]).toContain("dailyObjectives must be in simple English for B2, not Vietnamese");
  });
});
