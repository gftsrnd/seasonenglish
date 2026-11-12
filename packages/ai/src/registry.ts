import {
  coachInputSchema, coachOutputJsonSchema, coachOutputSchema, coachRoleplayTurnOutputJsonSchema, coachRoleplayTurnOutputSchema,
  vocabularyInputSchema, vocabularyOutputJsonSchema, vocabularyOutputSchema,
  weeklyLessonsInputSchema, weeklyLessonsOutputJsonSchema, weeklyLessonsOutputSchema,
  weeklyLessonDayInputSchema, weeklyLessonDayOutputJsonSchema, weeklyLessonDayOutputSchema,
  monthlyLessonDayOutputJsonSchema, monthlyLessonDayOutputSchema,
  weeklyLessonVocabularyInputSchema, weeklyLessonSkillsInputSchema,
  weeklyLessonSkillsReviewInputSchema,
  weeklyLessonFoundationBodyOutputJsonSchema, weeklyLessonFoundationBodyOutputSchema,
  weeklyLessonObjectivesOutputJsonSchema, weeklyLessonObjectivesOutputSchema,
  weeklyLessonGrammarClassificationOutputJsonSchema, weeklyLessonGrammarClassificationOutputSchema,
  weeklyLessonFoundationInputSchema,
  weeklyLessonVocabularyOutputJsonSchema, weeklyLessonVocabularyOutputSchema,
  weeklyLessonSkillsOutputJsonSchema, weeklyLessonSkillsOutputSchema,
  weeklyLessonComprehensionOutputJsonSchema, weeklyLessonComprehensionOutputSchema,
  weeklyLessonLanguagePracticeOutputJsonSchema, weeklyLessonLanguagePracticeOutputSchema,
  weeklyLessonSpeakingOutputJsonSchema, weeklyLessonSpeakingOutputSchema,
  weeklyLessonListeningRepairOutputJsonSchema, weeklyLessonListeningRepairOutputSchema,
  weeklyLessonReadingRepairOutputJsonSchema, weeklyLessonReadingRepairOutputSchema,
  weeklyLessonWritingRepairOutputJsonSchema, weeklyLessonWritingRepairOutputSchema,
  weeklyLessonWordClassRepairOutputJsonSchema, weeklyLessonWordClassRepairOutputSchema,
  weeklyLessonWordUseRepairOutputJsonSchema, weeklyLessonWordUseRepairOutputSchema,
  weeklyLessonSpeakingRepairOutputJsonSchema, weeklyLessonSpeakingRepairOutputSchema,
  weeklyLessonLengthRepairInputSchema, weeklyLessonLengthRepairOutputJsonSchema, weeklyLessonLengthRepairOutputSchema,
  weeklyLessonSkillsReviewOutputJsonSchema, weeklyLessonSkillsReviewOutputSchema,
  levelFormInputSchema, levelFormOutputJsonSchema, levelFormOutputSchema, levelFormPartialOutputSchema,
  levelFormReadingRepairInputSchema, levelFormReadingRepairOutputJsonSchema, levelFormReadingRepairOutputSchema,
  levelFormListeningOutputJsonSchema, levelFormListeningOutputSchema, levelFormReadingOutputJsonSchema, levelFormReadingOutputSchema, levelFormProductionOutputJsonSchema, levelFormProductionOutputSchema,
  weekSuggestionsInputSchema, weekSuggestionsOutputJsonSchema, weekSuggestionsOutputSchema,
  monthlyTopicSuggestionInputSchema, monthlyTopicSuggestionOutputJsonSchema, monthlyTopicSuggestionOutputSchema,
  monthlyResourcePlanInputSchema, monthlyResourcePlanOutputJsonSchema, monthlyResourcePlanOutputSchema,
  weeklyLessonPlanBlueprintInputSchema, weeklyLessonPlanBlueprintOutputJsonSchema, weeklyLessonPlanBlueprintOutputSchema,
  assessmentGradingInputSchema, assessmentGradingOutputJsonSchema, assessmentGradingOutputSchema,
  productiveAssessmentGradingInputSchema, productiveAssessmentGradingOutputJsonSchema, productiveAssessmentGradingOutputSchema, validateProductiveAssessmentGrading,
  microLessonInputSchema, microLessonOutputJsonSchema, microLessonOutputSchema,
  microGradingInputSchema, microGradingOutputJsonSchema, microGradingOutputSchema,
  weeklyPracticeInputSchema, weeklyPracticeOutputJsonSchema, weeklyPracticeOutputSchema
} from "./schemas.js";
import { monthlyReviewExercisesOutputJsonSchema, monthlyReviewExercisesOutputSchema, monthlyReviewItemRepairOutputJsonSchema, monthlyReviewItemRepairOutputSchema } from "./monthly-review-schemas.js";
import {
  monthlyFinalGenerationInputSchema,
  monthlyFinalProductiveOutputJsonSchema, monthlyFinalProductiveOutputSchema,
  monthlyFinalReceptiveOutputJsonSchema, monthlyFinalReceptiveOutputSchema,
  monthlyFinalListeningOutputJsonSchema, monthlyFinalListeningOutputSchema, validateMonthlyFinalListeningOutput,
  monthlyFinalListeningMessageInputSchema,monthlyFinalListeningMessageOutputSchema,monthlyFinalListeningMessageOutputJsonSchema,
  monthlyFinalWritingNotesSchema, monthlyFinalWritingNotesJsonSchema, monthlyFinalWritingOpening, monthlyFinalSpeakingSampleRepairSchema,
  monthlyFinalReadingOutputJsonSchema, monthlyFinalReadingOutputSchema, validateMonthlyFinalReadingOutput,
  validateMonthlyFinalProductiveOutput, validateMonthlyFinalReceptiveOutput
} from "./monthly-final-schemas.js";
import { z } from "zod";
import {monthlyFinalReadAloudInputSchema,monthlyFinalReadAloudOutputSchema,monthlyFinalReadAloudOutputJsonSchema,validateMonthlyFinalReadAloudOutput} from "./monthly-final-read-aloud.js";
import {monthlyFinalSampleRepairInputSchema,monthlyFinalSpeakingSampleRepairJsonSchema,validateMonthlyFinalSampleRepair} from "./monthly-final-sample-repair.js";
import {monthlyFinalWritingBlocksInputSchema,monthlyFinalWritingBlocksOutputSchema,monthlyFinalWritingBlocksJsonSchema,validateMonthlyFinalWritingBlocks} from "./monthly-final-writing-blocks.js";
import {monthlyFinalWritingBlockInputSchema,monthlyFinalWritingBlockOutputSchema,monthlyFinalWritingBlockJsonSchema,validateMonthlyFinalWritingBlock} from "./monthly-final-writing-blocks.js";
import {validateMonthlyFinalListeningBlocks} from "./monthly-final-listening-blocks.js";
import {monthlyFinalGrammarReviewInputSchema,monthlyFinalGrammarReviewOutputSchema,monthlyFinalGrammarReviewJsonSchema,validateMonthlyFinalGrammarReview} from "./monthly-final-grammar-review.js";
import {
  LESSON_PRODUCTIVE_GRADING_TASK, lessonProductiveGradingInputSchema, lessonProductiveGradingOutputJsonSchema,
  lessonProductiveGradingOutputSchema, validateLessonProductiveGrading
} from "./lesson-productive-grading.js";
import type { AiTaskDefinition } from "./types.js";
import { standardLessonInstruction } from "./lesson-instruction.js";

export class AiTaskRegistry {
  private readonly tasks = new Map<string, AiTaskDefinition>();

  constructor(tasks: AiTaskDefinition[]) {
    for (const task of tasks) {
      if (this.tasks.has(task.id)) throw new Error(`AI_TASK_DUPLICATE:${task.id}`);
      this.tasks.set(task.id, task);
    }
  }

  get(taskId: string): AiTaskDefinition {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`AI_TASK_NOT_FOUND:${taskId}`);
    return task;
  }

  list(): AiTaskDefinition[] {
    return [...this.tasks.values()];
  }
}

export const AI_TASKS = new AiTaskRegistry([
  {
    id: LESSON_PRODUCTIVE_GRADING_TASK, promptKey: LESSON_PRODUCTIVE_GRADING_TASK, inputSchema: lessonProductiveGradingInputSchema,
    outputSchema: lessonProductiveGradingOutputSchema, outputJsonSchema: lessonProductiveGradingOutputJsonSchema,
    validateOutput: (output, input) => validateLessonProductiveGrading(output as never, input as never)
  },
  {
    id: "micro_lesson_generation", promptKey: "micro_lesson_generation", inputSchema: microLessonInputSchema,
    outputSchema: microLessonOutputSchema, outputJsonSchema: microLessonOutputJsonSchema
  },
  {
    id: "micro_grading", promptKey: "micro_grading", inputSchema: microGradingInputSchema,
    outputSchema: microGradingOutputSchema, outputJsonSchema: microGradingOutputJsonSchema
  },
  {
    id: "assessment_scoring", promptKey: "assessment_scoring", inputSchema: assessmentGradingInputSchema,
    outputSchema: assessmentGradingOutputSchema, outputJsonSchema: assessmentGradingOutputJsonSchema
  },
  {
    id: "productive_assessment_scoring", promptKey: "assessment_scoring", inputSchema: productiveAssessmentGradingInputSchema,
    outputSchema: productiveAssessmentGradingOutputSchema, outputJsonSchema: productiveAssessmentGradingOutputJsonSchema,
    validateOutput: (output, input) => validateProductiveAssessmentGrading(productiveAssessmentGradingOutputSchema.parse(output), productiveAssessmentGradingInputSchema.parse(input))
  },
  {
    id: "week_suggestions", promptKey: "week_suggestions", inputSchema: weekSuggestionsInputSchema,
    outputSchema: weekSuggestionsOutputSchema, outputJsonSchema: weekSuggestionsOutputJsonSchema,
    validateOutput: validateWeekSuggestions
  },
  {
    id: "monthly_topic_suggestion", promptKey: "monthly_topic_suggestion", inputSchema: monthlyTopicSuggestionInputSchema,
    outputSchema: monthlyTopicSuggestionOutputSchema, outputJsonSchema: monthlyTopicSuggestionOutputJsonSchema
  },
  {
    id: "monthly_resource_generation", promptKey: "monthly_resource_generation", inputSchema: monthlyResourcePlanInputSchema,
    outputSchema: monthlyResourcePlanOutputSchema, outputJsonSchema: monthlyResourcePlanOutputJsonSchema
  },
  {
    id: "weekly_lesson_plan_blueprint", promptKey: "weekly_lessons", inputSchema: weeklyLessonPlanBlueprintInputSchema,
    outputSchema: weeklyLessonPlanBlueprintOutputSchema, outputJsonSchema: weeklyLessonPlanBlueprintOutputJsonSchema
  },
  {
    id: "level_form_generation", promptKey: "level_form_generation", inputSchema: levelFormInputSchema,
    outputSchema: levelFormPartialOutputSchema, outputJsonSchema: levelFormOutputJsonSchema
  },
  {
    id: "level_form_reading_repair", promptKey: "level_form_generation", inputSchema: levelFormReadingRepairInputSchema,
    outputSchema: levelFormReadingRepairOutputSchema, outputJsonSchema: levelFormReadingRepairOutputJsonSchema
  },
  { id: "level_form_listening_generation", promptKey: "level_form_generation", inputSchema: levelFormInputSchema, outputSchema: levelFormListeningOutputSchema, outputJsonSchema: levelFormListeningOutputJsonSchema },
  { id: "level_form_reading_generation", promptKey: "level_form_generation", inputSchema: levelFormInputSchema, outputSchema: levelFormReadingOutputSchema, outputJsonSchema: levelFormReadingOutputJsonSchema },
  {
    id: "monthly_final_receptive_generation", maxValidationIssues: 32, promptKey: "monthly_final_generation", inputSchema: monthlyFinalGenerationInputSchema,
    outputSchema: monthlyFinalReceptiveOutputSchema, outputJsonSchema: monthlyFinalReceptiveOutputJsonSchema,
    validateOutput: (output, input) => validateMonthlyFinalReceptiveOutput(monthlyFinalReceptiveOutputSchema.parse(output), monthlyFinalGenerationInputSchema.parse(input))
  },
  // Same slicing as the level-up form: listening and reading are separate calls.
  {
    id: "monthly_final_listening_generation", maxValidationIssues: 32, promptKey: "monthly_final_generation", inputSchema: monthlyFinalGenerationInputSchema,
    outputSchema: monthlyFinalListeningOutputSchema, outputJsonSchema: monthlyFinalListeningOutputJsonSchema,
    validateOutput: (output, input) => validateMonthlyFinalListeningOutput(monthlyFinalListeningOutputSchema.parse(output), monthlyFinalGenerationInputSchema.parse(input))
  },
  {
    id:"monthly_final_listening_message_generation",maxValidationIssues:32,promptKey:"monthly_final_generation",inputSchema:monthlyFinalListeningMessageInputSchema,
    outputSchema:monthlyFinalListeningMessageOutputSchema,outputJsonSchema:monthlyFinalListeningMessageOutputJsonSchema,
    validateOutput:(output,rawInput)=>{
      const input=monthlyFinalListeningMessageInputSchema.parse(rawInput);
      const message=monthlyFinalListeningMessageOutputSchema.parse(output);
      return [...validateMonthlyFinalListeningBlocks(message,input),...validateMonthlyFinalListeningOutput({listening:{messages:[message]}},input,input.messageLabel)];
    }
  },
  {
    id: "monthly_final_reading_generation", maxValidationIssues: 32, promptKey: "monthly_final_generation", inputSchema: monthlyFinalGenerationInputSchema,
    outputSchema: monthlyFinalReadingOutputSchema, outputJsonSchema: monthlyFinalReadingOutputJsonSchema,
    validateOutput: (output, input) => validateMonthlyFinalReadingOutput(monthlyFinalReadingOutputSchema.parse(output), monthlyFinalGenerationInputSchema.parse(input))
  },
  {
    id: "monthly_final_productive_generation", maxValidationIssues: 32, promptKey: "monthly_final_generation", inputSchema: monthlyFinalGenerationInputSchema,
    outputSchema: monthlyFinalProductiveOutputSchema, outputJsonSchema: monthlyFinalProductiveOutputJsonSchema,
    validateOutput: (output, input) => validateMonthlyFinalProductiveOutput(monthlyFinalProductiveOutputSchema.parse(output), monthlyFinalGenerationInputSchema.parse(input))
  },
  {
    id:"monthly_final_read_aloud_repair",promptKey:"monthly_final_generation",maxValidationIssues:32,inputSchema:monthlyFinalReadAloudInputSchema,
    outputSchema:monthlyFinalReadAloudOutputSchema,outputJsonSchema:monthlyFinalReadAloudOutputJsonSchema,
    validateOutput:(output,input)=>validateMonthlyFinalReadAloudOutput(monthlyFinalReadAloudOutputSchema.parse(output),monthlyFinalReadAloudInputSchema.parse(input))
  },
  {
    id:"monthly_final_writing_sample_repair",promptKey:"monthly_final_generation",maxValidationIssues:32,inputSchema:monthlyFinalWritingBlocksInputSchema,
    outputSchema:monthlyFinalWritingBlocksOutputSchema,outputJsonSchema:monthlyFinalWritingBlocksJsonSchema,
    validateOutput:(output,input)=>validateMonthlyFinalWritingBlocks(monthlyFinalWritingBlocksOutputSchema.parse(output),monthlyFinalWritingBlocksInputSchema.parse(input))
  },
  {
    id: "monthly_final_writing_notes_repair", promptKey: "monthly_final_generation", inputSchema: monthlyFinalSampleRepairInputSchema,
    outputSchema: monthlyFinalWritingNotesSchema, outputJsonSchema: monthlyFinalWritingNotesJsonSchema,
    validateOutput(output) {
      const {task} = monthlyFinalWritingNotesSchema.parse(output);
      const extraHint = monthlyFinalWritingOpening(task) || /gợi ý câu mở đầu|câu mở đầu gợi ý|mở đầu bằng câu|suggested opening/iu.test(task);
      return extraHint ? [{path:"task",message:"Leave out all opening hints and translations. The application appends the single English opening."}] : [];
    }
  },
  {
    id:"monthly_final_grammar_evidence_review",promptKey:"monthly_final_generation",inputSchema:monthlyFinalGrammarReviewInputSchema,
    outputSchema:monthlyFinalGrammarReviewOutputSchema,outputJsonSchema:monthlyFinalGrammarReviewJsonSchema,
    validateOutput:(output,input)=>validateMonthlyFinalGrammarReview(monthlyFinalGrammarReviewOutputSchema.parse(output),monthlyFinalGrammarReviewInputSchema.parse(input))
  },
  {
    id:"monthly_final_writing_block_repair",promptKey:"monthly_final_generation",maxValidationIssues:32,inputSchema:monthlyFinalWritingBlockInputSchema,
    outputSchema:monthlyFinalWritingBlockOutputSchema,outputJsonSchema:monthlyFinalWritingBlockJsonSchema,
    validateOutput:(output,input)=>validateMonthlyFinalWritingBlock(monthlyFinalWritingBlockOutputSchema.parse(output),monthlyFinalWritingBlockInputSchema.parse(input))
  },
  {
    id:"monthly_final_speaking_sample_repair",promptKey:"monthly_final_generation",maxValidationIssues:32,inputSchema:monthlyFinalSampleRepairInputSchema,
    outputSchema:monthlyFinalSpeakingSampleRepairSchema,outputJsonSchema:monthlyFinalSpeakingSampleRepairJsonSchema,
    validateOutput:(output,input)=>validateMonthlyFinalSampleRepair(monthlyFinalSpeakingSampleRepairSchema.parse(output),monthlyFinalSampleRepairInputSchema.parse(input))
  },
  { id: "level_form_production_generation", promptKey: "level_form_generation", inputSchema: levelFormInputSchema, outputSchema: levelFormProductionOutputSchema, outputJsonSchema: levelFormProductionOutputJsonSchema },
  {
    id: "coach_roleplay_turn", promptKey: "coach_dialogue", inputSchema: coachInputSchema,
    outputSchema: coachRoleplayTurnOutputSchema, outputJsonSchema: coachRoleplayTurnOutputJsonSchema
  },
  {
    id: "coach_dialogue", promptKey: "coach_dialogue", inputSchema: coachInputSchema,
    outputSchema: coachOutputSchema, outputJsonSchema: coachOutputJsonSchema,
    normalizeOutput: normalizeCoachOutput
  },
  {
    id: "weekly_lessons", promptKey: "weekly_lessons", inputSchema: weeklyLessonsInputSchema,
    outputSchema: weeklyLessonsOutputSchema, outputJsonSchema: weeklyLessonsOutputJsonSchema
  },
  {
    id: "weekly_lesson_day", promptKey: "weekly_lessons", inputSchema: weeklyLessonDayInputSchema,
    outputSchema: weeklyLessonDayOutputSchema, outputJsonSchema: weeklyLessonDayOutputJsonSchema
  },
  {
    id: "monthly_lesson_day", promptKey: "monthly_lessons", inputSchema: z.record(z.string(), z.unknown()),
    outputSchema: monthlyLessonDayOutputSchema, outputJsonSchema: monthlyLessonDayOutputJsonSchema
  },
  {
    id: "monthly_review_exercises", promptKey: "monthly_lessons", inputSchema: z.record(z.string(), z.unknown()),
    outputSchema: monthlyReviewExercisesOutputSchema, outputJsonSchema: monthlyReviewExercisesOutputJsonSchema
  },
  {
    id: "monthly_review_item_repair", promptKey: "monthly_lessons", inputSchema: z.record(z.string(), z.unknown()),
    outputSchema: monthlyReviewItemRepairOutputSchema, outputJsonSchema: monthlyReviewItemRepairOutputJsonSchema
  },
  {
    id: "weekly_lesson_grammar_classifier", promptKey: "weekly_lessons", inputSchema: weeklyLessonDayInputSchema,
    outputSchema: weeklyLessonGrammarClassificationOutputSchema, outputJsonSchema: weeklyLessonGrammarClassificationOutputJsonSchema
  },
  {
    id: "weekly_lesson_objectives", promptKey: "weekly_lessons", inputSchema: weeklyLessonFoundationInputSchema,
    outputSchema: weeklyLessonObjectivesOutputSchema, outputJsonSchema: weeklyLessonObjectivesOutputJsonSchema,
    normalizeOutput: (rawOutput, input) => {
      if (!rawOutput || typeof rawOutput !== "object" || Array.isArray(rawOutput)) return rawOutput;
      const output = rawOutput as Record<string, unknown>;
      const rawObjective = output.objective && typeof output.objective === "object" && !Array.isArray(output.objective)
        ? output.objective as Record<string, unknown> : {};
      const advanced = ["B1", "B2", "C1"].includes((input as { cefr?: string }).cefr ?? "");
      let contentIndex = 0;
      let languageIndex = 0;
      const items = Array.isArray(rawObjective.items)
        ? rawObjective.items.map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return item;
            const value = item as Record<string, unknown>;
            const id = value.type === "content" ? `C${++contentIndex}` : `L${++languageIndex}`;
            return { ...value, id };
          })
        : rawObjective.items;
      return { ...output, objective: { ...rawObjective, items, title: advanced ? "Learning objectives" : "Mục tiêu bài học" } };
    }
  },
  {
    id: "weekly_lesson_foundation", promptKey: "weekly_lessons", inputSchema: weeklyLessonFoundationInputSchema,
    outputSchema: weeklyLessonFoundationBodyOutputSchema, outputJsonSchema: weeklyLessonFoundationBodyOutputJsonSchema,
    normalizeOutput: (rawOutput, input) => {
      if (!rawOutput || typeof rawOutput !== "object" || Array.isArray(rawOutput)) return rawOutput;
      const foundationInput = input as {
        cefr?: string;
        grammarClassification?: { status?: string };
        pronunciationPlan?: { focus: string; word1: unknown; word2: unknown; word3: unknown };
      };
      const output = rawOutput as Record<string, unknown>;
      const advanced = ["B1", "B2", "C1"].includes(foundationInput.cefr ?? "");
      const labels = advanced
        ? { pronunciation: "Pronunciation" }
        : { pronunciation: "Phát âm" };
      const rawPronunciation = output.pronunciation && typeof output.pronunciation === "object" && !Array.isArray(output.pronunciation)
        ? output.pronunciation as Record<string, unknown>
        : {};
      const withPronunciationPlan = {
        ...output,
        // Instructions are fixed product copy; any provider instruction is discarded.
        instruction: standardLessonInstruction(foundationInput.cefr ?? ""),
        pronunciation: {
          ...rawPronunciation,
          title: labels.pronunciation,
          ...(foundationInput.pronunciationPlan ?? {})
        }
      };
      if (foundationInput.grammarClassification?.status === "classified") return withPronunciationPlan;
      return { ...withPronunciationPlan, title: null, grammar: null };
    }
  },
  {
    id: "weekly_lesson_vocabulary", promptKey: "weekly_lessons", inputSchema: weeklyLessonVocabularyInputSchema,
    outputSchema: weeklyLessonVocabularyOutputSchema, outputJsonSchema: weeklyLessonVocabularyOutputJsonSchema
  },
  {
    id: "weekly_lesson_skills", promptKey: "weekly_lessons", inputSchema: weeklyLessonSkillsInputSchema,
    outputSchema: weeklyLessonSkillsOutputSchema, outputJsonSchema: weeklyLessonSkillsOutputJsonSchema
  },
  {
    id: "weekly_lesson_comprehension", promptKey: "weekly_lessons", inputSchema: weeklyLessonSkillsInputSchema,
    outputSchema: weeklyLessonComprehensionOutputSchema, outputJsonSchema: weeklyLessonComprehensionOutputJsonSchema
  },
  {
    id: "weekly_lesson_language_practice", promptKey: "weekly_lessons", inputSchema: weeklyLessonSkillsInputSchema,
    outputSchema: weeklyLessonLanguagePracticeOutputSchema, outputJsonSchema: weeklyLessonLanguagePracticeOutputJsonSchema
  },
  {
    id: "weekly_lesson_speaking", promptKey: "weekly_lessons", inputSchema: weeklyLessonSkillsInputSchema,
    outputSchema: weeklyLessonSpeakingOutputSchema, outputJsonSchema: weeklyLessonSpeakingOutputJsonSchema
  },
  {
    id: "weekly_lesson_listening_repair", promptKey: "weekly_lessons", inputSchema: weeklyLessonSkillsInputSchema,
    outputSchema: weeklyLessonListeningRepairOutputSchema, outputJsonSchema: weeklyLessonListeningRepairOutputJsonSchema
  },
  {
    id: "weekly_lesson_reading_repair", promptKey: "weekly_lessons", inputSchema: weeklyLessonSkillsInputSchema,
    outputSchema: weeklyLessonReadingRepairOutputSchema, outputJsonSchema: weeklyLessonReadingRepairOutputJsonSchema
  },
  {
    id: "weekly_lesson_writing_repair", promptKey: "weekly_lessons", inputSchema: weeklyLessonSkillsInputSchema,
    outputSchema: weeklyLessonWritingRepairOutputSchema, outputJsonSchema: weeklyLessonWritingRepairOutputJsonSchema
  },
  {
    id: "weekly_lesson_word_class_repair", promptKey: "weekly_lessons", inputSchema: weeklyLessonSkillsInputSchema,
    outputSchema: weeklyLessonWordClassRepairOutputSchema, outputJsonSchema: weeklyLessonWordClassRepairOutputJsonSchema
  },
  {
    id: "weekly_lesson_word_use_repair", promptKey: "weekly_lessons", inputSchema: weeklyLessonSkillsInputSchema,
    outputSchema: weeklyLessonWordUseRepairOutputSchema, outputJsonSchema: weeklyLessonWordUseRepairOutputJsonSchema
  },
  {
    id: "weekly_lesson_speaking_repair", promptKey: "weekly_lessons", inputSchema: weeklyLessonSkillsInputSchema,
    outputSchema: weeklyLessonSpeakingRepairOutputSchema, outputJsonSchema: weeklyLessonSpeakingRepairOutputJsonSchema
  },
  {
    id: "weekly_lesson_length_repair", promptKey: "weekly_lessons", inputSchema: weeklyLessonLengthRepairInputSchema,
    outputSchema: weeklyLessonLengthRepairOutputSchema, outputJsonSchema: weeklyLessonLengthRepairOutputJsonSchema,
    validateOutput: (output, input) => {
      const parsedInput = weeklyLessonLengthRepairInputSchema.parse(input);
      const parsedOutput = weeklyLessonLengthRepairOutputSchema.parse(output);
      const requested = new Map(parsedInput.repairs.map((repair) => [repair.path, repair]));
      const issues: Array<{ path: string; message: string }> = [];
      const slots = [
        ["listening.body", "listeningBody"],
        ["reading.body", "readingBody"],
        ["speaking.answer", "speakingAnswer"]
      ] as const;
      for (const [path, slot] of slots) {
        const request = requested.get(path);
        const tokens = parsedOutput[slot];
        if (request === undefined && tokens !== null) issues.push({ path: slot, message: "Unrequested repair slot must be null." });
      }
      return issues;
    }
  },
  {
    id: "weekly_lesson_skills_reviewer", promptKey: "weekly_lessons", inputSchema: weeklyLessonSkillsReviewInputSchema,
    outputSchema: weeklyLessonSkillsReviewOutputSchema, outputJsonSchema: weeklyLessonSkillsReviewOutputJsonSchema,
    normalizeOutput: (rawOutput) => {
      if (!rawOutput || typeof rawOutput !== "object" || Array.isArray(rawOutput)) return rawOutput;
      const record = rawOutput as Record<string, unknown>;
      if (
        record.status === "approved"
        && Array.isArray(record.findings)
        && record.findings.length > 0
        && (record.findings as Array<{ message?: unknown }>).every((f) =>
          typeof f?.message === "string" && /\bno change (?:is )?(?:strictly )?(?:needed|required)\b|\bno revision (?:is )?(?:strictly )?(?:needed|required)\b|\bno (?:real |serious )?defect(?: found| requiring revision)?\b|\bnot a defect\b|\bis supported,\s*so\b|\bborderline and acceptable\b|\bno finding required\b|\boverall acceptable\b|\b(?:finding is )?withdrawn\b|\bkey is consistent\b|\bcomplete and usable\b|\bacceptable as (?:is|an example|a model answer)\b|không (?:cần|phải) (?:sửa|thay đổi)|không có (?:vấn đề|lỗi)(?:\s+(?:về|với))?/iu.test(f.message)
        )
      ) {
        return { ...record, findings: [] };
      }
      return rawOutput;
    }
  },
  {
    id: "weekly_practice_grading", promptKey: "weekly_practice_grading", inputSchema: weeklyPracticeInputSchema,
    outputSchema: weeklyPracticeOutputSchema, outputJsonSchema: weeklyPracticeOutputJsonSchema
  },
  {
    id: "vocabulary_generation", promptKey: "vocabulary_generation", inputSchema: vocabularyInputSchema,
    outputSchema: vocabularyOutputSchema, outputJsonSchema: vocabularyOutputJsonSchema
  }
]);

function normalizeCoachOutput(rawOutput: unknown, rawInput: unknown): unknown {
  if (!rawOutput || typeof rawOutput !== "object" || Array.isArray(rawOutput)) return rawOutput;
  const output = rawOutput as Record<string, unknown>;
  const evaluation = output.evaluation;
  const rubric = output.rubric;
  if (!evaluation || typeof evaluation !== "object" || Array.isArray(evaluation)
    || !rubric || typeof rubric !== "object" || Array.isArray(rubric)) return rawOutput;
  let normalizedOutput: Record<string, unknown> = output;
  if (typeof output.nextQuestion !== "string" || !output.nextQuestion.trim()) {
    normalizedOutput = {
      ...normalizedOutput,
      nextQuestion: "What could you say next in this workplace situation?",
      nextQuestionTranslation: "Bạn có thể nói gì tiếp theo trong tình huống công việc này?"
    };
  } else if (typeof output.nextQuestionTranslation !== "string" || !output.nextQuestionTranslation.trim()) {
    normalizedOutput = {
      ...normalizedOutput,
      nextQuestionTranslation: "Bạn có thể trả lời câu hỏi tiếp theo như thế nào?"
    };
  }
  const suggestedAnswer = normalizedOutput.suggestedAnswer;
  if (!suggestedAnswer || typeof suggestedAnswer !== "object" || Array.isArray(suggestedAnswer)
    || typeof (suggestedAnswer as Record<string, unknown>).text !== "string"
    || !(suggestedAnswer as Record<string, unknown>).text
    || typeof (suggestedAnswer as Record<string, unknown>).translation !== "string"
    || !(suggestedAnswer as Record<string, unknown>).translation) {
    normalizedOutput = {
      ...normalizedOutput,
      suggestedAnswer: fallbackCoachSuggestedAnswer(String(normalizedOutput.nextQuestion ?? ""))
    };
  }
  const evaluationRecord = evaluation as Record<string, unknown>;
  const meaning = (rubric as Record<string, unknown>).meaning;
  if (!meaning || typeof meaning !== "object" || Array.isArray(meaning)) return normalizedOutput;
  const meaningScore = (meaning as Record<string, unknown>).score;
  const message = rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
    ? String((rawInput as Record<string, unknown>).message ?? "") : "";
  const meaningfulAttempt = isMeaningfulCoachAttempt(message);
  const incompleteAttempt = evaluationRecord.status === "insufficient"
    || (evaluationRecord.status === "off_topic" && typeof meaningScore === "number" && meaningScore > 0);
  if (!incompleteAttempt || typeof meaningScore !== "number" || !meaningfulAttempt) return normalizedOutput;
  return {
    ...normalizedOutput,
    evaluation: {
      ...evaluationRecord,
      status: "valid",
      result: "partially_correct",
      countsTowardGoal: true
    },
    rubric: {
      ...rubric,
      meaning: { ...meaning, score: Math.max(1, meaningScore) }
    }
  };
}

function fallbackCoachSuggestedAnswer(nextQuestion: string) {
  if (/\bwhen\b/iu.test(nextQuestion)) {
    return { text: "Tomorrow morning would work well for me.", translation: "Sáng mai sẽ phù hợp với tôi." };
  }
  if (/\bwhere\b/iu.test(nextQuestion)) {
    return { text: "It will take place in the main meeting room.", translation: "Việc đó sẽ diễn ra tại phòng họp chính." };
  }
  if (/\bwho\b/iu.test(nextQuestion)) {
    return { text: "The project manager should handle the next step.", translation: "Quản lý dự án nên phụ trách bước tiếp theo." };
  }
  if (/\bwhy\b/iu.test(nextQuestion)) {
    return { text: "Because it will help the team complete the task on time.", translation: "Vì điều đó sẽ giúp nhóm hoàn thành công việc đúng hạn." };
  }
  if (/\bhow\b/iu.test(nextQuestion)) {
    return { text: "I would explain the issue clearly and propose a practical next step.", translation: "Tôi sẽ giải thích rõ vấn đề và đề xuất một bước tiếp theo phù hợp." };
  }
  return {
    text: "I would give a clear and polite response with the key details.",
    translation: "Tôi sẽ trả lời rõ ràng, lịch sự và nêu các thông tin chính."
  };
}

function isMeaningfulCoachAttempt(message: string): boolean {
  const normalized = message.trim().toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}'’\s]/gu, "").replace(/\s+/gu, " ").replaceAll("’", "'");
  const words = normalized.split(" ").filter(Boolean);
  return words.length >= 3 || /^(?:i|you|we|they|he|she|it)\s+\p{L}+(?:'\p{L}+)?$/u.test(normalized);
}

function validateWeekSuggestions(output: unknown, input: unknown): Array<{ path: string; message: string }> {
  const result = output as { weeks: Array<{ weekNumber: number; levels: string[]; options: Array<{ plan: Record<string, string[]> }> }> };
  const request = input as { weekNumbers: number[]; levels: string[] };
  const issues: Array<{ path: string; message: string }> = [];
  const expectedWeeks = new Set(request.weekNumbers);
  const returnedWeeks = new Set(result.weeks.map((week) => week.weekNumber));
  if (result.weeks.length !== expectedWeeks.size || returnedWeeks.size !== expectedWeeks.size || request.weekNumbers.some((week) => !returnedWeeks.has(week))) {
    issues.push({ path: "weeks", message: `Expected exactly one result for each requested week (${request.weekNumbers.join(", ")}).` });
  }
  const expectedLevels = new Set(request.levels);
  for (const week of result.weeks) {
    const returnedLevels = new Set(week.levels);
    if (returnedLevels.size !== expectedLevels.size || week.levels.some((level) => !expectedLevels.has(level)) || request.levels.some((level) => !returnedLevels.has(level))) {
      issues.push({ path: `weeks.${week.weekNumber}.levels`, message: `CEFR levels must exactly match the active matrix: ${request.levels.join(", ")}.` });
    }
    for (const [optionIndex, option] of week.options.entries()) {
      const planLevels = Object.keys(option.plan);
      if (planLevels.length !== expectedLevels.size || planLevels.some((level) => !expectedLevels.has(level)) || request.levels.some((level) => option.plan[level]?.length !== 5)) {
        issues.push({ path: `weeks.${week.weekNumber}.options.${optionIndex}.plan`, message: "Each active CEFR level must contain exactly 5 day-plan items." });
      }
    }
  }
  return issues.slice(0, 8);
}
