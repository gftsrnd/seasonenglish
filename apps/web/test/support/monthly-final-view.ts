import type { MonthlyFinalCheckView, MonthlyFinalDraftView, MonthlyFinalGenCode } from "@e4s/contracts";

const MANUAL: MonthlyFinalGenCode[] = ["GEN04", "GEN05", "GEN06", "GEN07", "GEN08", "GEN09", "GEN10", "GEN12", "GEN16", "GEN21"];

/** Test-only Operator view of a generated monthly final (B1, trimmed to a few items). */
export function monthlyFinalView(options: { status?: MonthlyFinalDraftView["exam"] extends infer T ? T extends { status: infer S } ? S : never : never; audio?: boolean; reviewed?: boolean; editable?: boolean } = {}): MonthlyFinalDraftView {
  const status = options.status ?? "NEEDS_REVIEW";
  const checks: MonthlyFinalCheckView[] = Array.from({ length: 23 }, (_, index) => {
    const code = `GEN${String(index + 1).padStart(2, "0")}` as MonthlyFinalGenCode;
    const manual = MANUAL.includes(code);
    const checkStatus = status === "READY" ? "pass" : status === "DRAFT" && code === "GEN11" ? "fail" : manual || code === "GEN20" ? "needs_review" : "pass";
    return { code, title: `Rule ${code}`, mode: manual ? "manual" : "auto", status: checkStatus, detail: `Detail ${code}` };
  });
  const audioSrc = options.audio ? { audioSrc: "/api/v1/files/content-media/read?artifactKey=content-media/a.mp3" } : {};
  return {
    definitionId: "definition-final", versionId: "final-v1", version: 1, status: "draft", examDate: "2026-11-30", editable: options.editable ?? true, stale: false,
    blueprint: {
      title: "Monthly Test – Project updates",
      sections: [
        { code: "listening", title: "Listening", durationMinutes: 8, maxScore: 25, instructions: ["8 minutes"], groups: [
          { key: "LA", title: "Message A", instruction: "Questions L01–L01", maxPlays: 2, stimulus: { type: "audio_script", lines: [{ speaker: "Anna", text: "The deadline is ready. Could you send me the numbers today?" }], ...audioSrc }, tasks: [{ key: "L01", prompt: "What is ready?", responseType: "single_choice", maxScore: 25, options: [{ value: "A", label: "The deadline item" }, { value: "B", label: "The deadline memo" }, { value: "C", label: "The deadline card" }], correctAnswer: "B" }] }
        ] },
        { code: "reading", title: "Reading", durationMinutes: 8, maxScore: 25, instructions: ["8 minutes"], groups: [
          { key: "R", title: "Reading questions", instruction: "Read each message.", tasks: [{ key: "R01", prompt: "Please ___ the file.", responseType: "single_choice", maxScore: 25, options: [{ value: "A", label: "attach" }, { value: "B", label: "borrow" }, { value: "C", label: "collect" }], correctAnswer: "A" }] }
        ] },
        { code: "writing", title: "Writing", durationMinutes: 8, maxScore: 25, instructions: ["8 minutes"], groups: [{ key: "W", title: "Writing task", instruction: "Write once.", tasks: [{ key: "W", prompt: "Write to Anna. Use these 1 words: update.", responseType: "long_text", maxScore: 25, minWords: 80, maxWords: 100, correctAnswer: null }] }] },
        { code: "speaking", title: "Speaking", durationMinutes: 6, maxScore: 25, instructions: ["6 minutes"], groups: [
          { key: "SA", title: "Part A – Read aloud", instruction: "Read once.", tasks: [{ key: "SA", prompt: "Please read: client, attend.", responseType: "speaking_evidence", maxScore: 8, correctAnswer: null }] },
          { key: "SB", title: "Part B – Voice note", instruction: "Record.", tasks: [{ key: "SB", prompt: "Leave a voice note. Use these 1 words: propose.", responseType: "speaking_evidence", maxScore: 17, correctAnswer: null }] }
        ] }
      ]
    },
    exam: {
      specVersion: "2.0", status, source: "ai",
      framework: { id: "framework-b1", version: 2, scopeHash: "monthly-abc", month: "2026-11", cefr: "B1", examDate: "2026-11-30" },
      formCode: "E4S B1 Monthly 2026-11 Form A v2.0",
      allocation: { n: 4, l: 1, r: 1, w: 1, s: 1 }, instructionLanguage: "en",
      grammar: [
        { code: "GA", topicId: "topic-a", topicTitle: "Polite requests and obligations", main: { stepId: "ga-1", label: "Requests", acceptedPatterns: ["Could you + V"] }, secondary: { stepId: "ga-2", label: "Obligation", acceptedPatterns: ["have to + V"] }, taughtSteps: [{ stepId: "ga-1", focus: "Polite requests", formula: "Could you + V" }, { stepId: "ga-2", focus: "Obligation", formula: "have to + V" }, { stepId: "ga-3", focus: "Advice", formula: "should + V" }] },
        { code: "GB", topicId: "topic-b", topicTitle: "Conditionals", main: { stepId: "gb-1", label: "Real", acceptedPatterns: ["If + present, will + V"] }, secondary: { stepId: "gb-2", label: "Unreal", acceptedPatterns: ["If + past, would + V"] }, taughtSteps: [{ stepId: "gb-1", focus: "Real conditions", formula: "If + present, will + V" }, { stepId: "gb-2", focus: "Unreal conditions", formula: "If + past, would + V" }] }
      ],
      pronunciation: (["P1", "P2", "P3", "P4"] as const).map((code, index) => ({ code, soundId: `sound-${index}`, ipa: "/nt/", label: `Sound ${index + 1}`, positions: [{ word: `word${index}a`, exampleId: `ex-${index}-a`, target: "/nt/ at the end" }, { word: `word${index}b`, exampleId: `ex-${index}-b`, target: "/nt/ at the end" }], taughtExamples: [{ exampleId: `ex-${index}-a`, word: `word${index}a` }, { exampleId: `ex-${index}-b`, word: `word${index}b` }] })),
      mapping: [
        { code: "V01", termId: "core-0", word: "deadline", type: "noun", meaning: "hạn chót", skill: "listening", position: "L01", taskKey: "L01" },
        { code: "V02", termId: "core-1", word: "attach", type: "verb", meaning: "đính kèm", skill: "reading", position: "R01", taskKey: "R01" },
        { code: "V03", termId: "core-2", word: "update", type: "noun", meaning: "cập nhật", skill: "writing", position: "W2", taskKey: "W" },
        { code: "V04", termId: "core-3", word: "propose", type: "verb", meaning: "đề xuất", skill: "speaking", position: "S3", taskKey: "SB" }
      ],
      grader: {
        listening: [{ groupKey: "LA", gaSentence: "Could you send me the numbers today?", gbSentence: "If you call, I will answer." }],
        items: { L01: { explanation: "The deadline is named.", evidence: "The deadline is ready." }, R01: { explanation: "attach = đính kèm" } },
        writingSample: "Hi Anna, here is my update.", writingGrammarEvidence: { gaMain: "Could you", gaSecondary: "I have to", gbMain: "If", gbSecondary: "I wish" },
        speakingSample: "Hi Anna, I propose ten.", speakingGrammarEvidence: { gaMain: "Could you", gbMain: "If" },
        rubric: [{ code: "W1", skill: "writing", maxScore: 6, description: "Ideas" }]
      },
      audio: options.reviewed ? { status: "REVIEWED", reviewedAt: "2026-11-20T03:00:00.000Z", reviewedBy: "operator" } : { status: "SCRIPT_ONLY", reviewedAt: null, reviewedBy: null },
      manualConfirmations: status === "READY" ? MANUAL : [],
      checks, generatedAt: "2026-11-20T03:00:00.000Z"
    }
  };
}
