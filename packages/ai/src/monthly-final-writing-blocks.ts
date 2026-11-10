import {z} from "zod";
import {monthlyFinalContainsTerm,monthlyFinalWordCount,monthlyFinalWritingOpening} from "./monthly-final-schemas.js";
import {monthlyFinalSampleRepairInputSchema,validateMonthlyFinalSampleRepair,type MonthlyFinalSampleRepairInput} from "./monthly-final-sample-repair.js";
import type {AiValidationIssue} from "./types.js";

export const WRITING_BLOCK_KEYS=["gaMain","gaSecondary","gbMain","gbSecondary"] as const;
export const monthlyFinalWritingBlocksInputSchema=monthlyFinalSampleRepairInputSchema.extend({opening:z.string(),blocks:z.array(z.object({key:z.enum(WRITING_BLOCK_KEYS),minWords:z.number().int().nonnegative(),maxWords:z.number().int().positive(),targets:z.array(z.object({word:z.string(),type:z.string(),meaning:z.string()}))})).length(4)});
export type MonthlyFinalWritingBlocksInput=z.infer<typeof monthlyFinalWritingBlocksInputSchema>;
export const monthlyFinalWritingBlocksOutputSchema=z.object({gaMain:z.string().trim().min(1).max(400),gaSecondary:z.string().trim().min(1).max(400),gbMain:z.string().trim().min(1).max(400),gbSecondary:z.string().trim().min(1).max(400)});
export type MonthlyFinalWritingBlocks=z.infer<typeof monthlyFinalWritingBlocksOutputSchema>;
export const monthlyFinalWritingBlocksJsonSchema={type:"object",additionalProperties:false,required:[...WRITING_BLOCK_KEYS],properties:Object.fromEntries(WRITING_BLOCK_KEYS.map(key=>[key,{type:"string",description:"Only the short English block assigned to this grammar role. Follow its individual word budget and required vocabulary."}]))};
export const monthlyFinalWritingBlockInputSchema=z.object({
  cefr:monthlyFinalSampleRepairInputSchema.shape.cefr,key:z.enum(WRITING_BLOCK_KEYS),
  minWords:z.number().int().nonnegative(),maxWords:z.number().int().positive(),
  targets:monthlyFinalSampleRepairInputSchema.shape.targets,
  grammar:z.record(z.string(),z.unknown()),theme:z.string(),task:z.string(),facts:z.string(),requirements:z.array(z.string()),
  previousText:z.string(),otherBlocks:z.array(z.string())
});
export const monthlyFinalWritingBlockOutputSchema=z.object({candidates:z.array(z.string().trim().min(1).max(1000)).min(1).max(5)});
export const monthlyFinalWritingBlockJsonSchema={type:"object",additionalProperties:false,required:["candidates"],properties:{candidates:{type:"array",minItems:1,maxItems:5,items:{type:"string"},description:"Up to five complete natural alternatives, each using the assigned grammar and all target words."}}};
export function monthlyFinalWritingBlockCandidates(
  output: z.infer<typeof monthlyFinalWritingBlockOutputSchema>,
  input: z.infer<typeof monthlyFinalWritingBlockInputSchema>
): string[] {
  return [...new Set(output.candidates)].filter(text => {
    if (!/[.!?]$/u.test(text) || !input.targets.every(term => monthlyFinalContainsTerm(text, term.word))) return false;
    if (input.cefr !== "A1") return true;
    const words = monthlyFinalWordCount(text);
    return words >= input.minWords && words <= input.maxWords;
  });
}

export function validateMonthlyFinalWritingBlock(
  output: z.infer<typeof monthlyFinalWritingBlockOutputSchema>,
  input: z.infer<typeof monthlyFinalWritingBlockInputSchema>
): AiValidationIssue[] {
  if (monthlyFinalWritingBlockCandidates(output, input).length) return [];
  const length = input.cefr === "A1" ? ` between ${input.minWords} and ${input.maxWords} words` : "";
  return [{
    path: "candidates",
    message: `Write at least one complete sentence${length} using every assigned word: ${input.targets.map(term => term.word).join(", ")}. Rewrite it as a short sentence with one idea.`
  }];
}
export function writingBlocksInput(input:MonthlyFinalSampleRepairInput):MonthlyFinalWritingBlocksInput{
  const opening=monthlyFinalWritingOpening(input.task);
  const min=Number(input.profile.minWords),max=Number(input.profile.maxWords),used=monthlyFinalWordCount(opening);
  const minWords=Math.max(0,Math.ceil((min-used)/4)),maxWords=Math.floor((max-used)/4);
  if(!Number.isFinite(minWords)||!Number.isFinite(maxWords)||maxWords<Math.max(1,minWords))throw new Error("Writing opening leaves no valid word budget");
  return {...input,opening,blocks:WRITING_BLOCK_KEYS.map((key,index)=>({key,minWords,maxWords,targets:input.targets.filter((_,target)=>target%4===index)}))};
}
export function composeWritingBlocks(output:MonthlyFinalWritingBlocks,input:MonthlyFinalWritingBlocksInput){
  return {sample:[input.opening,...WRITING_BLOCK_KEYS.map(key=>output[key])].filter(Boolean).join(" "),evidence:{...output}};
}
export function validateMonthlyFinalWritingBlocks(output:MonthlyFinalWritingBlocks,input:MonthlyFinalWritingBlocksInput):AiValidationIssue[]{
  const issues:AiValidationIssue[]=validateMonthlyFinalSampleRepair(composeWritingBlocks(output,input),input);
  if(!issues.length)return [];
  for(const block of input.blocks){
    const text=output[block.key],count=monthlyFinalWordCount(text);
    if(count<block.minWords || count>block.maxWords)issues.push({path:block.key,message:`This block has ${count} words; write ${block.minWords}–${block.maxWords} words only. The opening is added separately.`});
    const missing=block.targets.filter(term=>!monthlyFinalContainsTerm(text,term.word)).map(term=>term.word);
    if(missing.length)issues.push({path:block.key,message:`This block must naturally use its assigned word(s): ${missing.join(", ")}.`});
  }
  return issues;
}
