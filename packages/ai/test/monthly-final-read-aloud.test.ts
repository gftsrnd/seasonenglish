import {expect,it} from "vitest";
import {monthlyFinalReadAloudIssues,monthlyFinalReadAloudOutputSchema,validateMonthlyFinalReadAloudOutput,readAloudPositions,type MonthlyFinalReadAloudInput} from "../src/monthly-final-read-aloud.js";
const input:MonthlyFinalReadAloudInput={cefr:"A1",maxWords:18,words:["team","meeting","learn","work","think","month","back","plan"],theme:"Feedback",previousText:"Too long"};
it.each([" ",", "])("rejects an echoed word list separated by %s",separator=>{
  expect(monthlyFinalReadAloudIssues(input.words.join(separator),input)).toEqual(expect.arrayContaining([expect.objectContaining({message:expect.stringContaining("not the assigned words copied as a list")})]));
});
it("derives two real positions per taught pool from the actual text instead of trusting an arbitrary previous selection",()=>{
 const pooled:MonthlyFinalReadAloudInput={...input,words:[],pools:[["team","meeting","screen"],["work","first","verb"],["think","month","three"],["back","plan","happy"]].map((words,index)=>({code:(["P1","P2","P3","P4"] as const)[index]!,focus:"/x/",examples:words.map(word=>({exampleId:word,word,ipa:"/x/"}))}))};
 const text="Our team will work back at the first meeting. Think about the plan for next month.";
 expect(monthlyFinalReadAloudIssues(text,pooled)).toEqual([]);
 expect(readAloudPositions(text,pooled).map(position=>position.word)).toEqual(["team","meeting","work","first","think","month","back","plan"]);
 expect(monthlyFinalReadAloudIssues("Our team will work on the first meeting plan.",pooled)).not.toEqual([]);
 expect(monthlyFinalReadAloudIssues("plan, back, month, think, first, work, meeting, team",pooled)).not.toEqual([]);
});
it("accepts a natural compact alternative and rejects missing/overlong alternatives",()=>{
  const good="Our team will learn and work back at the meeting. Think about the plan this month.";
  expect(monthlyFinalReadAloudIssues(good,input)).toEqual([]);
  expect(validateMonthlyFinalReadAloudOutput({candidates:[input.words.join(", "),good]},input)).toEqual([]);
  expect(monthlyFinalReadAloudIssues(good+" Please send the report tomorrow.",input)).not.toEqual([]);
  expect(monthlyFinalReadAloudOutputSchema.safeParse({candidates:["a".repeat(401)]}).success).toBe(false);
});
