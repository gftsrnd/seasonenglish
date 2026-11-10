import {monthlyFinalContainsTerm,monthlyFinalWordCount,type MonthlyFinalGenerationInput,type MonthlyFinalListeningMessageOutput} from "./monthly-final-schemas.js";
import type {AiValidationIssue} from "./types.js";
export function listeningScriptPlan(input:MonthlyFinalGenerationInput):{blocks:Array<{index:number;minWords:number;maxWords:number;termIds:string[];grammarRole?:"GA"|"GB"|undefined}>}{
  const profile=input.levelProfile.listeningScriptWords as {min:number;max:number};
  const count=Math.ceil(profile.max/20),minWords=Math.ceil(profile.min/count),maxWords=Math.floor(profile.max/count);
  return {blocks:Array.from({length:count},(_,index)=>({index,minWords,maxWords,termIds:input.targets.listening.filter((_,termIndex)=>termIndex%count===index).map(term=>term.id),...(index===0 ? {grammarRole:"GA" as const} : index===count-1 ? {grammarRole:"GB" as const} : {})}))};
}
export function validateMonthlyFinalListeningBlocks(output:MonthlyFinalListeningMessageOutput,input:MonthlyFinalGenerationInput & {scriptPlan:ReturnType<typeof listeningScriptPlan>}):AiValidationIssue[]{
  const blocks=output.scriptBlocks;
  if(!blocks?.length)return [{path:"scriptBlocks",message:"Return the planned short script blocks."}];
  const script=blocks.join(" "),profile=input.levelProfile.listeningScriptWords as {min:number;max:number};
  const total=monthlyFinalWordCount(script);
  const missingOverall=input.targets.listening.filter(term=>!monthlyFinalContainsTerm(script,term.word));
  // Per-block allocations guide generation. A spec-compliant whole message
  // must not be rejected merely for balancing words differently across sentences.
  if(total>=Math.floor(profile.min*0.85) && total<=Math.ceil(profile.max*1.15) && !missingOverall.length)return [];
  const issues:AiValidationIssue[]=[];
  for(const block of input.scriptPlan.blocks){
    const text=blocks[block.index]??"",count=monthlyFinalWordCount(text);
    // Shorter sentences can be balanced by longer ones. Only the complete
    // script has a minimum length in the spec; the block cap prevents overflow.
    if(total>Math.ceil(profile.max*1.15) && count>block.maxWords)issues.push({path:`scriptBlocks.${block.index}`,message:`The full script is too long. This block has ${count} words; aim for at most ${block.maxWords}.`});
    const missing=block.termIds.flatMap(id=>missingOverall.find(term=>term.id===id)??[]).map(term=>term.word);
    if(missing.length)issues.push({path:`scriptBlocks.${block.index}`,message:`Include this block's assigned words naturally: ${missing.join(", ")}.`});
  }
  return issues;
}
