import {describe,expect,it} from "vitest";
import {
  monthlyFinalReadingItemIssues,monthlyFinalReadingOutputSchema,monthlyFinalReadingQuestionMark,validateMonthlyFinalReadingOutput,
  type MonthlyFinalGenerationInput
} from "../src/monthly-final-schemas.js";

// Real failing items from the 2026-11-11 re-measure (GEN07 failed in 5/6 assembled exams).
const failing = [
  {word:"explain",prompt:"The login page is not working. Please explain why this happened.",options:["say why something happens clearly","wait for the client to decide alone","send the design file to another team"],issues:["no_question"]},
  {word:"supplier",prompt:"Our supplier sent the wrong files, so we must contact the supplier today to ask for the correct ones.",options:["Ask the company that provides materials to send the right files","Cancel the meeting with the whole client team","Change the project deadline for next year"],issues:["no_question"]},
  {word:"ask",prompt:"We do not understand the new request. What will Minh do?",options:["Ask the client for more details","Refuse the request without a reason","Tell the client the price changed"],issues:["word_not_in_context"]},
  {word:"tolerance",prompt:"Our server response time can vary by a few milliseconds. What is the tolerance for this variation?",options:["The acceptable limit of variation","The date the server will be replaced","The number of users on the server"],issues:["word_not_in_context"]},
  {word:"consistent",prompt:"Our reports show the same figures every week, so the client trusts them. What does 'consistent' mean here?",options:["Stays the same and does not contradict itself.","Is updated many times each day.","Is sent only to senior managers."],issues:["word_not_in_context"]}
] as const;
// Accepted items from the same run.
const passing = [
  {word:"document",prompt:"Please read the document before the call. What should you read?",options:["a file with information","a time for the call","a name for the team"]},
  {word:"cancel",prompt:"The budget was not approved, so they cancelled the review. Why was the review cancelled?",options:["The budget was not approved","The meeting moved to a bigger room","The client asked for more time"]},
  {word:"invoice",prompt:"Please send the ____ to the finance team today.",options:["invoice","meeting","laptop"]}
] as const;

function input(words: readonly string[]): MonthlyFinalGenerationInput {
  return {
    month:"2026-11",cefr:"B1",formCode:"B1",frameworkVersion:1,theme:{title:"Feedback",brief:"",context:"",communicationGoal:""},
    allocation:{n:10,l:2,r:words.length,w:4,s:3},levelProfile:{readingItem:{maxWords:25}},
    targets:{listening:[],reading:words.map(word=>({id:word,code:word,word,type:"noun",meaning:word})),writing:[],speaking:[]},
    grammar:[],pronunciation:[],backgroundWords:[]
  } as unknown as MonthlyFinalGenerationInput;
}

describe("GEN07 Reading item rule inside the Reading generation repair loop", () => {
  it.each(failing)("flags the real failing item for '$word'", (item) => {
    expect(monthlyFinalReadingItemIssues(item.prompt, item.options[0], item.word)).toEqual(item.issues);
  });
  it.each(passing)("accepts the item for '$word'", (item) => {
    expect(monthlyFinalReadingItemIssues(item.prompt, item.options[0], item.word)).toEqual([]);
  });

  it("feeds the GEN07 findings back as concrete repair issues before assembly", () => {
    const all = [...failing, ...passing];
    const questions = all.map(item => ({termId:item.word,prompt:item.prompt,options:[...item.options],correctIndex:0,explanation:"Meaning in context."}));
    const issues = validateMonthlyFinalReadingOutput({reading:{questions}}, input(all.map(item => item.word)));
    expect(issues).toEqual([
      {path:"reading.questions.0.prompt",message:expect.stringContaining("has no question")},
      {path:"reading.questions.1.prompt",message:expect.stringContaining("has no question")},
      {path:"reading.questions.2.termId",message:expect.stringContaining('"ask" must appear verbatim in the context sentence')},
      {path:"reading.questions.3.termId",message:expect.stringContaining('"tolerance" must appear verbatim in the context sentence')},
      {path:"reading.questions.4.termId",message:expect.stringContaining('"consistent" must appear verbatim in the context sentence')}
    ]);
  });

  it("adds a missing '?' only to a final sentence that is plainly a question", () => {
    expect(monthlyFinalReadingQuestionMark("The invoice shows the wrong price. What should the team do next.")).toBe("The invoice shows the wrong price. What should the team do next?");
    expect(monthlyFinalReadingQuestionMark("The invoice shows the wrong price. Why is it wrong")).toBe("The invoice shows the wrong price. Why is it wrong?");
    for (const unchanged of [
      "The login page is not working. Please explain why this happened.",
      "The design is complete. Do the review first.",
      "Please send the ____ today.",
      "The invoice is late. What should we do?"
    ]) expect(monthlyFinalReadingQuestionMark(unchanged)).toBe(unchanged);
    const parsed = monthlyFinalReadingOutputSchema.parse({questions:[{termId:"invoice",prompt:"The invoice is late. Who should send it again.",options:["the finance team","the client","the designer"],correctIndex:0,explanation:"x"}]});
    expect(parsed.reading.questions[0]!.prompt).toBe("The invoice is late. Who should send it again?");
    expect(monthlyFinalReadingItemIssues(parsed.reading.questions[0]!.prompt, "the finance team", "invoice")).toEqual([]);
  });
});
