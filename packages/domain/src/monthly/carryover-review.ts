import type {MonthlyCurriculumContract} from "./curriculum.js";
/** Resolve only the preceding calendar week's actual new-learning allocations. Never borrow the new month's words. */
export function carryoverReviewContract(current: MonthlyCurriculumContract, previous: MonthlyCurriculumContract, lessonNumber: number): MonthlyCurriculumContract {
 const day = current.daySpecs.find(day => day.lessonNumber === lessonNumber);
 if (!day?.reviewFromPreviousMonth || day.kind !== "review" || !day.reviewWeekKey) throw new Error("Not a carry-over review");
 const expected = new Date(current.month + "-01T12:00:00Z"); expected.setUTCMonth(expected.getUTCMonth()-1);
 if (previous.month !== expected.toISOString().slice(0,7) || previous.cefr !== current.cefr) throw new Error("Previous month and CEFR must match");
 const source = previous.daySpecs.filter(item => item.kind === "new" && item.date >= day.reviewWeekKey! && item.date < day.date);
 if (!source.length) throw new Error("Previous month's teaching scope is not available");
 const unique = (ids: string[]) => [...new Set(ids)];
 const core = unique(source.flatMap(item => item.coreTermIds));
 const support = unique(source.flatMap(item => item.expandedTermIds));
 const grammar = unique(source.flatMap(item => item.grammarStepIds ?? [item.grammarStepId]));
 const sounds = unique(source.flatMap(item => item.pronunciationPlan?.targetIds ?? [item.soundId]));
 const examples = unique(source.flatMap(item => item.pronunciationPlan?.exampleIds ?? item.pronunciationExampleIds));
 const first = previous.sounds.find(sound => sound.id === sounds[0]);
 if (!first || !grammar.length || !examples.length) throw new Error("Previous month's teaching scope is incomplete");
 const review = {...day,reviewTermIds:core,reviewExpandedTermIds:support,reviewGrammarStepIds:grammar,reviewSoundIds:sounds,reviewPronunciationExampleIds:examples,grammarStepId:grammar[0]!,grammarStepIds:grammar,soundId:first.id,pronunciationExampleIds:first.examples.filter(example => examples.includes(example.id)).slice(0,3).map(example => example.id),skillExercises:day.skillExercises.map(item => ({...item,resourceIds:[...core,...support]}))};
 return {...previous,month:current.month,version:current.version,daySpecs:[review]};
}
