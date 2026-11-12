import {monthlyFinalListeningMessageOutputSchema,validateMonthlyFinalListeningOutput,listeningScriptPlan,type AiTaskRunner,type MonthlyFinalGenerationInput,type MonthlyFinalListeningOutput,type AiRunResult} from "@e4s/ai";

/** Code allocates each assessed word to exactly one message; AI only writes that message. */
export async function generateMonthlyFinalListening(runner:AiTaskRunner,input:MonthlyFinalGenerationInput,prompt:string):Promise<AiRunResult<MonthlyFinalListeningOutput>>{
  if(input.targets.listening.length<2)throw Object.assign(new Error("Two listening messages need at least two assigned words"),{code:"MONTHLY_FINAL_INPUT_ERROR"});
  const split=Math.min(input.targets.listening.length-1,Math.ceil(input.targets.listening.length*0.6));
  const assignments=[{label:"A" as const,terms:input.targets.listening.slice(0,split)},{label:"B" as const,terms:input.targets.listening.slice(split)}];
  const generated=await Promise.all(assignments.map(async assignment=>{
    const assigned={...input,targets:{...input.targets,listening:assignment.terms}};
    const plan=listeningScriptPlan(assigned);
    const slice={...assigned,messageLabel:assignment.label,scriptPlan:plan};
    const balancedIds=assignment.terms.filter((_,index)=>index%2===0).map(term=>term.id).join(", ");
    const optionGuide=`Keep options parallel in form. For ${balancedIds}, at least one plausible wrong option must be as long as or longer than the correct option in characters. Preserve the meaning and avoid padding.`;
    const blocks=plan.blocks.map(block=>`Block ${block.index}: ${block.minWords}–${block.maxWords} words; must use ${block.termIds.map(id=>assignment.terms.find(term=>term.id===id)!.word).join(", ")||"the established context"}${block.grammarRole ? `; apply a taught ${block.grammarRole} structure` : ""}.`).join("\n");
    let result:AiRunResult;
    try{
      result=await runner.runTask("monthly_final_listening_message_generation",slice,{systemPrompt:`${prompt}\nThis request produces ONLY Message ${assignment.label}, not both messages and not a whole exam. Code assigned exactly ${assignment.terms.length} target words: ${assignment.terms.map(term=>`${term.id}=${term.word} (${term.type}: ${term.meaning})`).join(", ")}. Every assessed word must occur in its supplied meaning and word class in the script; a derived word of a different class is not the assessed word. Return exactly one question per assigned ID, once each. Return scriptBlocks, NOT a complete script string. Code will join the blocks and take GA/GB evidence from the first/last block. Write exactly ${plan.blocks.length} natural short blocks forming ONE coherent workplace message, without labels, instructions or duplicated introductions. Obey each block's own word budget and target words:\n${blocks}\nEvery question's evidence must be a verbatim excerpt from the blocks. Preserve names, times and facts consistently. Keep prompts/options concise.\n${optionGuide}`,maxOutputTokens:6500,maxAttempts:2});
    }catch(error){
      if(!error||typeof error!=="object"||!("code" in error)||error.code!=="AI_OUTPUT_INVALID")throw error;
      const details=(error as {details?:{invalidOutput?:unknown;issues?:Array<{path:string;message:string}>}}).details;
      if(typeof details?.invalidOutput!=="string")throw error;
      const feedback=details.issues?.map(issue=>`${issue.path}: ${issue.message}`).join("\n")??"Correct the validation failures.";
      // A bounded focused repair sees only the failed message, not full-exam authoring instructions.
      result=await runner.runTask("monthly_final_listening_message_generation",slice,{systemPrompt:`Repair only English listening Message ${assignment.label} at ${input.cefr}. Preserve valid questions and facts, correcting evidence if its sentence changes. ALL exact assessed terms must be spoken naturally in their specified meanings and word classes: ${assignment.terms.map(term=>`${term.id}=${JSON.stringify(term.word)} (${term.type}: ${term.meaning})`).join("; ")}. Do not replace an adjective with an adverb or another derived word. Return scriptBlocks and exactly one question per assigned ID. The complete joined script must fit the levelProfile listeningScriptWords range. The first block applies GA, the last GB. Each evidence is copied verbatim from the actual script. Block guide:\n${blocks}\n${optionGuide}`,messages:[{role:"user",content:JSON.stringify(slice)},{role:"assistant",content:details.invalidOutput},{role:"user",content:`Correct these concrete failures, preserve the other target words and check the complete result:\n${feedback}`}],maxOutputTokens:6500,maxAttempts:2});
    }
    return {...result,output:monthlyFinalListeningMessageOutputSchema.parse(result.output)};
  }));
  let output={listening:{messages:generated.map(result=>result.output)}};
  let issues=validateMonthlyFinalListeningOutput(output,input);
  // Only the section-wide option-length rule failed (GEN17): one targeted repair of the
  // options of the message with the most uniquely-longest keys; scripts are never touched.
  if(issues.length&&issues.every(issue=>issue.path==="listening.messages"&&issue.message.includes("uniquely longest"))){
    const repaired=await repairMonthlyFinalListeningOptionLengths(runner,input,output.listening.messages,issues.map(issue=>issue.message).join(" ")).catch(()=>null);
    if(repaired){
      const candidate={listening:{messages:repaired}};
      const candidateIssues=validateMonthlyFinalListeningOutput(candidate,input);
      if(!candidateIssues.length){output=candidate;issues=candidateIssues;}
    }
  }
  if(issues.length)throw Object.assign(new Error("Assigned listening messages did not satisfy the exam scope"),{code:"AI_OUTPUT_INVALID",issues});
  return {output,metadata:generated[0]!.metadata};
}

type ListeningMessage=MonthlyFinalListeningOutput["listening"]["messages"][number];
const keyIsUniqueLongest=(question:{options:string[];correctIndex:number})=>{
  const key=question.options[question.correctIndex]?.trim().length??0;
  return question.options.every((option,index)=>index===question.correctIndex||option.trim().length<key);
};

/**
 * Rewrites only the wrong options of the uniquely-longest-key questions of ONE
 * message. Merged per question: the prompt, the exact correct option text,
 * evidence and the script stay as generated (audio and evidence unaffected).
 */
export async function repairMonthlyFinalListeningOptionLengths(runner:AiTaskRunner,input:MonthlyFinalGenerationInput,messages:ListeningMessage[],feedback:string):Promise<ListeningMessage[]|null>{
  const ranked=messages.map((message,index)=>({index,count:message.questions.filter(keyIsUniqueLongest).length})).sort((left,right)=>right.count-left.count);
  const target=ranked[0];
  if(!target?.count)return null;
  const message=messages[target.index]!;
  const ids=message.questions.filter(keyIsUniqueLongest).map(question=>question.termId);
  const terms=input.targets.listening.filter(term=>message.questions.some(question=>question.termId===term.id));
  const slice={...input,targets:{...input.targets,listening:terms},messageLabel:message.label,scriptPlan:listeningScriptPlan({...input,targets:{...input.targets,listening:terms}})};
  const result=await runner.runTask("monthly_final_listening_message_generation",slice,{
    systemPrompt:`Repair only the answer options of listening Message ${message.label} at ${input.cefr}. Return the complete message with the same script blocks, the same questions, prompts, termIds, evidence and explanations, and the exact same correct option text. For ${ids.join(", ")}: rewrite only the wrong options so at least one plausible wrong option is as long as or longer than the correct option in characters, parallel in form and clearly wrong according to the script. Never pad with empty words.`,
    messages:[{role:"user",content:JSON.stringify(slice)},{role:"assistant",content:JSON.stringify(message)},{role:"user",content:feedback}],
    maxOutputTokens:6500,maxAttempts:1
  });
  const repaired=monthlyFinalListeningMessageOutputSchema.parse(result.output);
  const byTerm=new Map(repaired.questions.map(question=>[question.termId,question]));
  const questions=message.questions.map(question=>{
    const next=byTerm.get(question.termId);
    if(!next||!ids.includes(question.termId))return question;
    const key=question.options[question.correctIndex]!.trim();
    const nextKey=next.options[next.correctIndex]?.trim();
    if(nextKey!==key||next.options.length!==question.options.length||new Set(next.options.map(option=>option.trim().toLocaleLowerCase())).size!==next.options.length)return question;
    return {...question,options:next.options.map(option=>option.trim()),correctIndex:next.correctIndex};
  });
  return messages.map((item,index)=>index===target.index?{...item,questions}:item);
}
