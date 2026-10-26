import {
  coachInputSchema, coachOutputJsonSchema, coachOutputSchema,
  vocabularyInputSchema, vocabularyOutputJsonSchema, vocabularyOutputSchema,
  weeklyLessonsInputSchema, weeklyLessonsOutputJsonSchema, weeklyLessonsOutputSchema,
  weeklyLessonDayInputSchema, weeklyLessonDayOutputJsonSchema, weeklyLessonDayOutputSchema,
  weeklyLessonVocabularyInputSchema, weeklyLessonSkillsInputSchema,
  weeklyLessonFoundationOutputJsonSchema, weeklyLessonFoundationOutputSchema,
  weeklyLessonGrammarClassificationOutputJsonSchema, weeklyLessonGrammarClassificationOutputSchema,
  weeklyLessonFoundationInputSchema,
  weeklyLessonVocabularyOutputJsonSchema, weeklyLessonVocabularyOutputSchema,
  weeklyLessonSkillsOutputJsonSchema, weeklyLessonSkillsOutputSchema,
  levelFormInputSchema, levelFormOutputJsonSchema, levelFormOutputSchema,
  weekSuggestionsInputSchema, weekSuggestionsOutputJsonSchema, weekSuggestionsOutputSchema,
  assessmentGradingInputSchema, assessmentGradingOutputJsonSchema, assessmentGradingOutputSchema,
  microLessonInputSchema, microLessonOutputJsonSchema, microLessonOutputSchema,
  microGradingInputSchema, microGradingOutputJsonSchema, microGradingOutputSchema,
  weeklyPracticeInputSchema, weeklyPracticeOutputJsonSchema, weeklyPracticeOutputSchema
} from "./schemas.js";
import type { AiTaskDefinition } from "./types.js";

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
    id: "week_suggestions", promptKey: "week_suggestions", inputSchema: weekSuggestionsInputSchema,
    outputSchema: weekSuggestionsOutputSchema, outputJsonSchema: weekSuggestionsOutputJsonSchema,
    validateOutput: validateWeekSuggestions
  },
  {
    id: "level_form_generation", promptKey: "level_form_generation", inputSchema: levelFormInputSchema,
    outputSchema: levelFormOutputSchema, outputJsonSchema: levelFormOutputJsonSchema
  },
  {
    id: "coach_dialogue", promptKey: "coach_dialogue", inputSchema: coachInputSchema,
    outputSchema: coachOutputSchema, outputJsonSchema: coachOutputJsonSchema
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
    id: "weekly_lesson_grammar_classifier", promptKey: "weekly_lessons", inputSchema: weeklyLessonDayInputSchema,
    outputSchema: weeklyLessonGrammarClassificationOutputSchema, outputJsonSchema: weeklyLessonGrammarClassificationOutputJsonSchema
  },
  {
    id: "weekly_lesson_foundation", promptKey: "weekly_lessons", inputSchema: weeklyLessonFoundationInputSchema,
    outputSchema: weeklyLessonFoundationOutputSchema, outputJsonSchema: weeklyLessonFoundationOutputJsonSchema,
    normalizeOutput: (rawOutput, input) => {
      const foundationInput = input as { grammarClassification?: { status?: string } };
      if (foundationInput.grammarClassification?.status === "classified") return rawOutput;
      if (!rawOutput || typeof rawOutput !== "object" || Array.isArray(rawOutput)) return rawOutput;
      return { ...rawOutput, title: null, grammar: null };
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
    id: "weekly_practice_grading", promptKey: "weekly_practice_grading", inputSchema: weeklyPracticeInputSchema,
    outputSchema: weeklyPracticeOutputSchema, outputJsonSchema: weeklyPracticeOutputJsonSchema
  },
  {
    id: "vocabulary_generation", promptKey: "vocabulary_generation", inputSchema: vocabularyInputSchema,
    outputSchema: vocabularyOutputSchema, outputJsonSchema: vocabularyOutputJsonSchema
  }
]);

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
