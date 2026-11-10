import {z} from "zod";
import {monthlyFinalContainsTerm,monthlyFinalIncludesEvidence,monthlyFinalWordCount,type MonthlyFinalProductiveOutput} from "./monthly-final-schemas.js";
import type {AiValidationIssue} from "./types.js";

export const monthlyFinalSampleRepairInputSchema=z.object({
  kind:z.enum(["writing","speakingB"]),cefr:z.enum(["A1","A2","B1","B2","C1"]),
  targets:z.array(z.object({word:z.string(),type:z.string(),meaning:z.string()})).min(1),
  theme:z.string(),task:z.string(),facts:z.string(),requirements:z.array(z.string()),
  grammar:z.array(z.record(z.string(),z.unknown())).length(2),profile:z.record(z.string(),z.unknown()),previousSample:z.string()
});
export type MonthlyFinalSampleRepairInput=z.infer<typeof monthlyFinalSampleRepairInputSchema>;
const outputJson=(keys:string[])=>({type:"object",additionalProperties:false,required:["sample","evidence"],properties:{sample:{type:"string"},evidence:{type:"object",additionalProperties:false,required:keys,properties:Object.fromEntries(keys.map(key=>[key,{type:"string",description:"A verbatim sentence or excerpt from sample, without commentary."}]))}}});
export const monthlyFinalWritingSampleRepairJsonSchema=outputJson(["gaMain","gaSecondary","gbMain","gbSecondary"]);
export const monthlyFinalSpeakingSampleRepairJsonSchema=outputJson(["gaMain","gbMain"]);

export function validateMonthlyFinalSampleRepair(output:Pick<MonthlyFinalProductiveOutput["writing"],"sample"|"evidence">|Pick<MonthlyFinalProductiveOutput["speakingB"],"sample"|"evidence">,input:MonthlyFinalSampleRepairInput):AiValidationIssue[]{
  const issues:AiValidationIssue[]=[];
  const missing=input.targets.filter(term=>!monthlyFinalContainsTerm(output.sample,term.word)).map(term=>term.word);
  if(missing.length)issues.push({path:"sample",message:`Use every assigned target word naturally with the supplied meaning: ${missing.join(", ")}.`});
  for(const [key,quote] of Object.entries(output.evidence))if(!monthlyFinalIncludesEvidence(output.sample,quote))issues.push({path:`evidence.${key}`,message:"Copy only a real sentence or excerpt from sample, without explanations or invented sentences."});
  if(input.kind==="writing" && typeof input.profile.minWords==="number" && typeof input.profile.maxWords==="number"){
    const count=monthlyFinalWordCount(output.sample);
    if(count<input.profile.minWords || count>input.profile.maxWords)issues.push({path:"sample",message:`The sample has ${count} words. Write ${input.profile.minWords}–${input.profile.maxWords} words, including all assigned terms and the selected grammar.`});
  }
  return issues;
}
