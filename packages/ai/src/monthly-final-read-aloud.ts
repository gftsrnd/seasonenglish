import {z} from "zod";
import type {AiValidationIssue} from "./types.js";
import {monthlyFinalWordCount,monthlyFinalIsWordList} from "./monthly-final-schemas.js";

export const monthlyFinalReadAloudInputSchema=z.object({
  cefr:z.enum(["A1","A2","B1","B2","C1"]),maxWords:z.number().int().positive().max(100),
  words:z.array(z.string().trim().min(1)).max(8),theme:z.string(),previousText:z.string(),
  pools:z.array(z.object({code:z.enum(["P1","P2","P3","P4"]),focus:z.string(),examples:z.array(z.object({exampleId:z.string(),word:z.string(),ipa:z.string()})).min(2)})).min(1).max(4).optional()
});
export const monthlyFinalReadAloudOutputSchema=z.object({candidates:z.array(z.string().trim().min(1).max(400)).min(1).max(3)});
export const monthlyFinalReadAloudOutputJsonSchema={type:"object",additionalProperties:false,required:["candidates"],properties:{candidates:{type:"array",minItems:1,maxItems:3,items:{type:"string"},description:"Up to three short natural read-aloud passages, not instructions or word lists."}}};
export type MonthlyFinalReadAloudInput=z.infer<typeof monthlyFinalReadAloudInputSchema>;
export function readAloudPoolWords(text: string, examples: readonly {word: string}[]): string[] {
  return [...new Set(examples.filter(example => presentWord(text, example.word)).map(example => example.word.toLocaleLowerCase("en-US")))];
}
export function monthlyFinalReadAloudIssues(text:string,input:MonthlyFinalReadAloudInput):AiValidationIssue[]{
  const issues:AiValidationIssue[]=[];
  const count=monthlyFinalWordCount(text);
  if(count>input.maxWords)issues.push({path:"candidates",message:`The passage has ${count} words; use at most ${input.maxWords}.`});
  if(input.pools){
    for(const pool of input.pools){
      const present=readAloudPoolWords(text,pool.examples);
      if(present.length<2)issues.push({path:"candidates",message:`${pool.code} has ${present.length ? present.join(", ") : "no exact matches"} in this passage. Use TWO different words spelled exactly as in this pool: ${pool.examples.map(example=>example.word).join(", ")}.`});
    }
    const chosen=input.pools.flatMap(pool=>pool.examples.filter(example=>presentWord(text,example.word)).slice(0,2).map(example=>example.word));
    if(monthlyFinalIsWordList(text,chosen))issues.push({path:"candidates",message:"Write natural sentences rather than echoing the taught words as a list."});
    return issues;
  }
  const missing=input.words.filter(word=>!presentWord(text,word));
  if(missing.length)issues.push({path:"candidates",message:`Include all eight assigned pronunciation words. Missing: ${missing.join(", ")}.`});
  if(monthlyFinalIsWordList(text,input.words))issues.push({path:"candidates",message:"Write a natural sentence, not the assigned words copied as a list. Add grammatical connecting words within the remaining budget."});
  return issues;
}
function presentWord(text:string,word:string){return new RegExp(`(^|[^\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&")}([^\\p{L}]|$)`,"iu").test(text);}
/** The program derives assessment positions from words actually present, never model claims. */
export function readAloudPositions(text:string,input:MonthlyFinalReadAloudInput){
  if(!input.pools || monthlyFinalReadAloudIssues(text,input).length)return [];
  return input.pools.flatMap(pool=>{
    const seen=new Set<string>();
    const examples=pool.examples.filter(example=>{const word=example.word.toLocaleLowerCase("en-US");if(seen.has(word)||!presentWord(text,example.word))return false;seen.add(word);return true;}).slice(0,2);
    return examples.map(example=>({code:pool.code,exampleId:example.exampleId,word:example.word,target:`${pool.focus} in ${example.word}`}));
  });
}
export function validateMonthlyFinalReadAloudOutput(output:z.infer<typeof monthlyFinalReadAloudOutputSchema>,input:MonthlyFinalReadAloudInput):AiValidationIssue[]{
  const findings=output.candidates.map(text=>monthlyFinalReadAloudIssues(text,input));
  return findings.some(issues=>issues.length===0) ? [] : findings.flat();
}
