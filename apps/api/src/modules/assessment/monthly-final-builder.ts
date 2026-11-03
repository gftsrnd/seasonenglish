import type { MonthlyCurriculumContract } from "@e4s/domain/monthly";
import { buildMonthlyExamScope } from "@e4s/domain/monthly";
import type { StoredAssessmentDefinition, StoredAssessmentTask } from "@e4s/database";

/**
 * Builds a reviewable draft from the frozen framework. It intentionally has no
 * lexical fallback: every word, grammar point and pronunciation cue comes from
 * the month contract supplied by the operator-approved resource plan.
 */
export function buildMonthlyFinalDraft(contract: MonthlyCurriculumContract): StoredAssessmentDefinition {
  const scope = buildMonthlyExamScope(contract);
  const cores = contract.coreTerms;
  const support = contract.supportTerms;
  const grammar = contract.grammarTopics.flatMap((topic) => topic.steps);
  const sounds = contract.sounds;
  if (cores.length < 3 || grammar.length < 2 || sounds.length < 1) {
    throw new Error("MONTHLY_FINAL_SCOPE_INCOMPLETE");
  }
  const words = cores.slice(0, 6).map((term) => term.word);
  const core = (index: number) => cores[index % cores.length]!;
  const supportTerm = (index: number) => support[index % Math.max(1, support.length)]?.word ?? core(index).word;
  const grammarStep = (index: number) => grammar[index % grammar.length]!;
  const sound = (index: number) => sounds[index % sounds.length]!;
  const optionSet = (answer: string, alternatives: string[]) => unique([answer, ...alternatives.filter((item) => item !== answer)]).slice(0, 4).map((label, index) => ({ value: "ABCD"[index]!, label }));
  const task = (key: string, prompt: string, answer: string, alternatives: string[]): StoredAssessmentTask => ({
    key,
    prompt,
    responseType: "single_choice",
    maxScore: 5,
    options: optionSet(answer, alternatives),
    correctAnswer: "A"
  });
  const listeningScript = [
    { speaker: "Team lead", text: `Please ${core(1).word} the ${core(0).word} before the ${core(2).word}.` },
    { speaker: "Colleague", text: `I will use ${grammarStep(0).formula} and update each ${supportTerm(0)}.` }
  ];

  return {
    key: `monthly-final-${contract.month}-${contract.cefr.toLowerCase()}`,
    kind: "final",
    title: `Bài thi tháng ${contract.month}`,
    version: contract.version,
    totalMinutes: 30,
    totalScore: 100,
    monthlyScope: scope,
    sections: [
      {
        code: "listening", title: "Nghe", durationMinutes: 8, maxScore: 25,
        instructions: ["Nghe nội dung đúng tài nguyên tháng. Operator phải tạo hoặc tải audio trước khi phát hành."],
        groups: [{
          key: "ML", title: "Nghe theo chủ đề tháng", instruction: "Nghe tối đa hai lần và chọn đáp án.", maxPlays: 2,
          stimulus: { type: "audio_script", lines: listeningScript },
          tasks: [
            task("ML1", `What must the colleague confirm?`, core(0).word, words),
            task("ML2", `What is the deadline item?`, core(2).word, words),
            task("ML3", `Which word names the action?`, core(1).word, words),
            task("ML4", `Which support term is mentioned?`, supportTerm(0), [core(0).word, core(1).word, core(2).word]),
            task("ML5", `Which grammar pattern is used?`, grammarStep(0).formula, grammar.map((item) => item.formula))
          ]
        }]
      },
      {
        code: "reading", title: "Đọc", durationMinutes: 8, maxScore: 25,
        instructions: ["Đọc tình huống, từ vựng và ngữ pháp thuộc tài nguyên tháng."],
        groups: [{
          key: "MR", title: "Đọc và dùng ngôn ngữ", instruction: "Chọn đáp án dựa trên từ và ngữ pháp đã học.",
          stimulus: { type: "passage", text: `${core(0).word} requires the team to ${core(1).word} before the ${core(2).word}. ${grammarStep(1).examples[0] ?? grammarStep(1).formula}` },
          tasks: [
            task("MR1", `Which item is being prepared?`, core(0).word, words),
            task("MR2", `Which action is required?`, core(1).word, words),
            task("MR3", `Which deadline word appears?`, core(2).word, words),
            task("MR4", `Choose the month grammar focus.`, grammarStep(1).focus, grammar.map((item) => item.focus)),
            task("MR5", `Choose a related expansion.`, supportTerm(0), [core(0).word, core(1).word, core(2).word])
          ]
        }]
      },
      {
        code: "writing", title: "Viết", durationMinutes: 7, maxScore: 25,
        instructions: ["Viết câu trả lời công việc dựa đúng từ cốt lõi và ngữ pháp tháng."],
        groups: [{
          key: "MW", title: "Email ngắn", instruction: "Viết 70–100 từ.",
          tasks: [{ key: "MW1", responseType: "long_text", maxScore: 25, minWords: 70, maxWords: 100, prompt: `Write a short work email about ${core(0).word}. Use ${core(1).word}, ${core(2).word}, and the grammar pattern “${grammarStep(0).formula}”.` }]
        }]
      },
      {
        code: "speaking", title: "Nói", durationMinutes: 7, maxScore: 25,
        instructions: ["Ghi âm câu trả lời dựa đúng từ, ngữ pháp và trọng tâm phát âm tháng."],
        groups: [{
          key: "MS", title: "Trình bày tình huống", instruction: "Nói 1–2 phút.",
          tasks: [{ key: "MS1", responseType: "speaking_evidence", maxScore: 25, prompt: `Explain a ${core(0).word} to a colleague. Use ${core(1).word}, ${core(2).word}, “${grammarStep(1).formula}”, and pronounce the target ${sound(0).ipa} clearly.` }]
        }]
      }
    ]
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}
