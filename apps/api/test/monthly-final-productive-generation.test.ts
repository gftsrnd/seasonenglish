import {expect,it} from "vitest";
import {normalizeMonthlyFinalReadAloudOutput, type AiTaskRunner, type MonthlyFinalReadAloudInput} from "@e4s/ai";
import {buildMonthlyFinalGenerationInput} from "../src/modules/assessment/monthly-final-builder.js";
import {generateMonthlyFinalProductive,withAcceptedGrammarReviewMemo} from "../src/modules/assessment/monthly-final-productive-generation.js";
import {monthlyFinalContract,frameworkRef,fakeMonthlyFinalAiOutput} from "./support/monthly-final-fixture.js";

it("repairs only an overlong read-aloud after the full productive response exhausted its retries",async()=>{
  const input=buildMonthlyFinalGenerationInput(monthlyFinalContract("B1"),frameworkRef);
  const candidate=fakeMonthlyFinalAiOutput(input).productive;
  candidate.speakingA.text+=" Please check the design before the meeting starts.".repeat(3);
  const calls:string[]=[];
  const text="Our client will attend to the tasks and desks. Hold the old list and check the cost.";
  const runner={runTask:async(taskId:string,raw:Record<string,unknown>)=>{
    if(taskId==="monthly_final_grammar_evidence_review")return {output:{items:(raw.items as any[]).map(item=>({key:item.key,matches:true,reason:"Matches selected component."}))},metadata:{}};
    calls.push(taskId);
    if(calls.length===1)throw Object.assign(new Error("AI_OUTPUT_INVALID"),{code:"AI_OUTPUT_INVALID",details:{invalidOutput:JSON.stringify(candidate)}});
    const start=(raw.pools as any[])[0].code==="P1"?0:2;
    expect(raw.pools).toEqual(input.pronunciation.slice(start,start+2).map(p=>({code:p.code,focus:p.ipa,examples:p.taughtExamples})));// Requested size is 12–13 words per sentence; a sentence is accepted up to the passage cap (25) minus a minimal 6-word second sentence.
    expect(raw.maxWords).toBe(20);
    return {output:{candidates:[start===0?"Our client will attend to the tasks and desks.":"Hold the old list and check the cost."]},metadata:{}};
  }} as unknown as AiTaskRunner;
  const result=await generateMonthlyFinalProductive(runner,input,"Generate exam");
  expect(calls).toEqual(["monthly_final_productive_generation","monthly_final_read_aloud_repair","monthly_final_read_aloud_repair"]);
  expect(result.output).toEqual({...candidate,speakingA:{text,positions:candidate.speakingA.positions.map(p=>({...p,target:`${input.pronunciation.find(pool=>pool.code===p.code)!.ipa} in ${p.word}`}))}});
});

it("does not recover invalid grammar selection",async()=>{
  for(const corrupt of [(v:any)=>{v.grammarComponents[0].mainStepId="invented";}]){
    const input=buildMonthlyFinalGenerationInput(monthlyFinalContract("B1"),frameworkRef),candidate=fakeMonthlyFinalAiOutput(input).productive;
    candidate.speakingA.text+=" More words before the meeting starts.".repeat(3);corrupt(candidate);
    let calls=0;const error=Object.assign(new Error("AI_OUTPUT_INVALID"),{code:"AI_OUTPUT_INVALID",details:{invalidOutput:JSON.stringify(candidate)}});
    const runner={runTask:async()=>{calls++;throw error;}} as unknown as AiTaskRunner;
    await expect(generateMonthlyFinalProductive(runner,input,"Generate exam")).rejects.toBe(error);expect(calls).toBe(1);
  }
});
it("repairs failed samples independently while preserving accepted tasks, facts and grammar",async()=>{
  const input=buildMonthlyFinalGenerationInput(monthlyFinalContract("B1"),frameworkRef);input.levelProfile.writing={minWords:0,maxWords:400};
  const good=fakeMonthlyFinalAiOutput(input).productive,candidate=structuredClone(good);
  candidate.speakingA.text+=" Please check the design before the meeting starts.".repeat(3);
  candidate.writing.sample="A completely unrelated answer with none of the assigned vocabulary.";
  candidate.speakingB.sample="Another completely unrelated answer with none of the required terms.";
  const calls:string[]=[];const text="Our client will attend to the tasks and desks. Hold the old list and check the cost.";
  const blocks={gaMain:"Could you extend and update the deadline?",gaSecondary:"We have to send the report for approval.",gbMain:"If HR sends the data tonight, I will finish tomorrow.",gbSecondary:"If we had the missing figures, we would finish."};
  const runner={runTask:async(taskId:string,raw:any)=>{
    if(taskId==="monthly_final_grammar_evidence_review")return {output:{items:raw.items.map((item:any)=>({key:item.key,matches:true,reason:"Matches selected component."}))},metadata:{}};
    calls.push(taskId);if(calls.length===1)throw Object.assign(new Error("AI_OUTPUT_INVALID"),{code:"AI_OUTPUT_INVALID",details:{invalidOutput:JSON.stringify(candidate)}});
    if(taskId==="monthly_final_read_aloud_repair")return {output:{candidates:[raw.pools[0].code==="P1"?"Our client will attend to the tasks and desks.":"Hold the old list and check the cost."]},metadata:{}};
    if(taskId==="monthly_final_writing_block_repair")return {output:{candidates:[blocks[raw.key as keyof typeof blocks]]},metadata:{}};
    const section=taskId==="monthly_final_writing_sample_repair" ? good.writing : good.speakingB;
    expect(raw.targets.map((term:any)=>term.word)).toEqual(input.targets[raw.kind==="writing" ? "writing" : "speaking"].map(term=>term.word));
    return {output:{sample:section.sample,evidence:section.evidence},metadata:{}};
  }} as unknown as AiTaskRunner;
  const result=await generateMonthlyFinalProductive(runner,input,"Generate exam");
  expect(calls.filter(id=>id==="monthly_final_read_aloud_repair")).toHaveLength(2);expect(calls.filter(id=>id==="monthly_final_writing_block_repair")).toHaveLength(4);expect(calls.filter(id=>id==="monthly_final_speaking_sample_repair")).toHaveLength(1);
  expect(result.output).toEqual({...good,writing:{...good.writing,sample:Object.values(blocks).join(" "),evidence:blocks},speakingA:{text,positions:good.speakingA.positions.map(p=>({...p,target:`${input.pronunciation.find(pool=>pool.code===p.code)!.ipa} in ${p.word}`}))}});
});
it("selects complete candidate combinations using each role's own taught grammar and target words",async()=>{
 const input=buildMonthlyFinalGenerationInput(monthlyFinalContract("B1"),frameworkRef);input.levelProfile.writing={minWords:0,maxWords:400};
 const candidate=fakeMonthlyFinalAiOutput(input).productive;candidate.writing.sample="An unrelated answer.";
 const blocks={gaMain:"Could you extend and update the deadline?",gaSecondary:"We have to send the report for approval.",gbMain:"If HR sends the data tonight, I will finish tomorrow.",gbSecondary:"If we had the missing figures, we would finish."};
 const keys:string[]=[];
 const runner={runTask:async(taskId:string,raw:any)=>{
  if(taskId==="monthly_final_grammar_evidence_review")return {output:{items:raw.items.map((item:any)=>({key:item.key,matches:true,reason:"Matches."}))},metadata:{}};
  if(taskId==="monthly_final_productive_generation")throw Object.assign(new Error("invalid"),{code:"AI_OUTPUT_INVALID",details:{invalidOutput:JSON.stringify(candidate)}});
  expect(taskId).toBe("monthly_final_writing_block_repair");keys.push(raw.key);
  const index=["gaMain","gaSecondary","gbMain","gbSecondary"].indexOf(raw.key);
  expect(raw.targets.map((term:any)=>term.word)).toEqual(input.targets.writing.filter((_,target)=>target%4===index).map(term=>term.word));
  expect(raw.grammar.stepId).toBe(index===0?candidate.grammarComponents[0]!.mainStepId:index===1?candidate.grammarComponents[0]!.secondaryStepId:index===2?candidate.grammarComponents[1]!.mainStepId:candidate.grammarComponents[1]!.secondaryStepId);
  return {output:{candidates:["An irrelevant complete sentence.",blocks[raw.key as keyof typeof blocks]]},metadata:{}};
 }} as unknown as AiTaskRunner;
 const result=await generateMonthlyFinalProductive(runner,input,"Generate exam");
 expect(keys).toEqual(["gaMain","gaSecondary","gbMain","gbSecondary"]);
 expect((result.output as any).writing.evidence).toEqual(blocks);expect((result.output as any).speakingA).toEqual(candidate.speakingA);
});it("repairs semantically wrong evidence and rechecks without changing the accepted tasks",async()=>{
 const input=buildMonthlyFinalGenerationInput(monthlyFinalContract("B1"),frameworkRef);input.levelProfile.writing={minWords:0,maxWords:400};
 const candidate=fakeMonthlyFinalAiOutput(input).productive;let reviews=0,repairs=0;
 const blocks={gaMain:"Could you extend and update the deadline?",gaSecondary:"We have to send the report for approval.",gbMain:"If HR sends the data tonight, I will finish tomorrow.",gbSecondary:"If we had the missing figures, we would finish."};
 candidate.writing={...candidate.writing,sample:Object.values(blocks).join(" "),evidence:blocks};
 const runner={runTask:async(taskId:string,raw:any)=>{
  if(taskId==="monthly_final_productive_generation")return {output:candidate,metadata:{}};
  if(taskId==="monthly_final_grammar_evidence_review"){reviews++;return {output:{items:raw.items.map((item:any)=>({key:item.key,matches:reviews>1||item.key!=="writing.gaMain",reason:"Wrong taught grammar component."}))},metadata:{}};}
  expect(taskId).toBe("monthly_final_writing_block_repair");repairs++;return {output:{candidates:[blocks[raw.key as keyof typeof blocks]]},metadata:{}};
 }} as unknown as AiTaskRunner;
 const result=await generateMonthlyFinalProductive(runner,input,"Generate exam");
 // 6 first reviews + the new gaMain block candidate + the rewritten gaMain with its sample. Unchanged accepted quotes (block candidates equal to the
 // accepted secondary quotes, untouched Speaking B evidence) are not re-reviewed.
 expect(reviews).toBe(8);expect(repairs).toBe(4);
 expect((result.output as any).writing.task).toBe(candidate.writing.task);expect((result.output as any).speakingB).toEqual(candidate.speakingB);
 expect((result.output as any).writing.evidence).toEqual(blocks);
});
it("uses three sentence groups for C1 and checks the complete composed passage",async()=>{
 const input=buildMonthlyFinalGenerationInput(monthlyFinalContract("C1"),frameworkRef),candidate=fakeMonthlyFinalAiOutput(input).productive;
 candidate.speakingA.text+=" Please check all the documents carefully before tomorrow's meeting.".repeat(4);
 const groups:string[][]=[];
 const runner={runTask:async(taskId:string,raw:any)=>{
  if(taskId==="monthly_final_grammar_evidence_review")return {output:{items:raw.items.map((item:any)=>({key:item.key,matches:true,reason:"Matches."}))},metadata:{}};
  if(taskId==="monthly_final_productive_generation")throw Object.assign(new Error("invalid"),{code:"AI_OUTPUT_INVALID",details:{invalidOutput:JSON.stringify(candidate)}});
  groups.push(raw.pools.map((pool:any)=>pool.code));
  const text=raw.pools[0].code==="P1"?"Our client will attend to the tasks and desks.":raw.pools[0].code==="P3"?"Please check the list and the cost before our meeting.":"Hold the old report until we meet tomorrow.";
  return {output:{candidates:[text]},metadata:{}};
 }} as unknown as AiTaskRunner;
 const result=await generateMonthlyFinalProductive(runner,input,"Generate exam");
 expect(groups).toEqual([["P1","P2"],["P3"],["P4"]]);
 expect((result.output as any).speakingA.text.split(/(?<=[.!?])\s/u)).toHaveLength(3);
 expect((result.output as any).speakingA.positions).toHaveLength(8);
});
it("accepts a longer first read-aloud sentence when the whole passage still fits (B1 'The passage has 17 words; use at most 14.')",async()=>{
 const input=buildMonthlyFinalGenerationInput(monthlyFinalContract("B1"),frameworkRef),candidate=fakeMonthlyFinalAiOutput(input).productive;
 candidate.speakingA.text+=" Please check the design before the meeting starts.".repeat(3);
 const first="Our client will attend to the tasks and desks in the main office after lunch today.";
 const calls:string[]=[];
 const runner={runTask:async(taskId:string,raw:any)=>{
  if(taskId==="monthly_final_grammar_evidence_review")return {output:{items:raw.items.map((item:any)=>({key:item.key,matches:true,reason:"Matches."}))},metadata:{}};
  calls.push(taskId);
  if(taskId==="monthly_final_productive_generation")throw Object.assign(new Error("invalid"),{code:"AI_OUTPUT_INVALID",details:{invalidOutput:JSON.stringify(candidate)}});
  return {output:{candidates:[raw.pools[0].code==="P1"?first:"Hold the old list and check the cost."]},metadata:{}};
 }} as unknown as AiTaskRunner;
 const result=await generateMonthlyFinalProductive(runner,input,"Generate exam");
 // 16 + 8 = 24 words within the B1 cap of 26: no failure and no shortening call.
 expect(calls).toEqual(["monthly_final_productive_generation","monthly_final_read_aloud_repair","monthly_final_read_aloud_repair"]);
 expect((result.output as any).speakingA.text).toBe(`${first} Hold the old list and check the cost.`);
 expect((result.output as any).speakingA.positions).toHaveLength(8);
});
it("shortens a long first sentence only when the composed passage exceeds the cap",async()=>{
 const input=buildMonthlyFinalGenerationInput(monthlyFinalContract("B1"),frameworkRef),candidate=fakeMonthlyFinalAiOutput(input).productive;
 candidate.speakingA.text+=" Please check the design before the meeting starts.".repeat(3);
 const long="Our client will attend to the tasks and desks in the main office after the long lunch break today.";
 const limits:number[]=[];
 const runner={runTask:async(taskId:string,raw:any)=>{
  if(taskId==="monthly_final_grammar_evidence_review")return {output:{items:raw.items.map((item:any)=>({key:item.key,matches:true,reason:"Matches."}))},metadata:{}};
  if(taskId==="monthly_final_productive_generation")throw Object.assign(new Error("invalid"),{code:"AI_OUTPUT_INVALID",details:{invalidOutput:JSON.stringify(candidate)}});
  if(raw.pools[0].code!=="P1")return {output:{candidates:["Hold the old list and check the cost."]},metadata:{}};
  limits.push(raw.maxWords);
  return {output:{candidates:[raw.previousText?"Our client will attend to the tasks and desks.":long]},metadata:{}};
 }} as unknown as AiTaskRunner;
 const result=await generateMonthlyFinalProductive(runner,input,"Generate exam");
 // 19 + 8 > 26: rebalancing asks for the first sentence within 26 - 8 = 18 words.
 expect(limits).toEqual([20,18]);
 expect((result.output as any).speakingA.text).toBe("Our client will attend to the tasks and desks. Hold the old list and check the cost.");
});
it("preserves the December B1 two-phrase sentence when its local word budget cannot be met", async () => {
 const input = buildMonthlyFinalGenerationInput(monthlyFinalContract("B1"), frameworkRef);
 const pools = [
  ["asked", "checked", "finished", "helped", "laughed", "fixed", "washed", "wished", "stopped"],
  ["called", "planned", "agreed", "caused", "listened", "improved", "approved", "reviewed", "followed"],
  ["started", "needed", "updated", "wanted", "visited", "accepted", "decided", "provided", "added"],
  ["booked it", "moved on", "closed a deal", "approved everything", "pulled out", "signed off", "hired an assistant", "named a new owner", "wrapped up early"]
 ];
 const candidate = fakeMonthlyFinalAiOutput(input).productive;
 input.pronunciation.forEach((pool, index) => {
  pool.taughtExamples = pools[index]!.map((word, term) => ({ word, exampleId: `${pool.code}-${term}`, ipa: pool.ipa }));
 });
 candidate.speakingA.text += " More words before the meeting starts.".repeat(3);
 const first = "We called the team, planned the review, then checked and finished the report.";
 const shorterFirst = "We called and planned, then checked and finished the final project report.";
 const second = "We started the review, updated the records, signed off, and then wrapped up early.";
 const failedSecond = "We started the work, updated the notes, and signed off just before the afternoon meeting.";
 const invalid = (output: unknown) => Object.assign(new Error("invalid"), {
  code: "AI_OUTPUT_INVALID", details: { invalidOutput: JSON.stringify(output) }
 });
 const limits: Array<[string, number]> = [];
 const runner = { runTask: async (taskId: string, raw: any) => {
  if (taskId === "monthly_final_grammar_evidence_review") return { output: { items: raw.items.map((item: any) => ({ key: item.key, matches: true, reason: "Matches." })) }, metadata: {} };
  if (taskId === "monthly_final_productive_generation") throw invalid(candidate);
  const pool = raw.pools[0].code;
  limits.push([pool, raw.maxWords]);
  if (pool === "P3" && raw.maxWords <= 13) throw invalid({ candidates: [failedSecond] });
  return { output: { candidates: [pool === "P3" ? second : raw.previousText ? shorterFirst : first] }, metadata: {} };
 }} as unknown as AiTaskRunner;
 const { output } = await generateMonthlyFinalProductive(runner, input, "Generate exam");
 expect(limits).toEqual([["P1", 20], ["P3", 20], ["P3", 13], ["P1", 12]]);
 expect((output as any).speakingA.text).toBe(`${shorterFirst} ${second}`);
 expect((output as any).speakingA.positions.map(({word}: {word:string}) => word)).toEqual(
  ["checked", "finished", "called", "planned", "started", "updated", "signed off", "wrapped up early"]
 );
});
it("uses the validated December B1 passage when the provider omits pinned terms", async () => {
 const input = buildMonthlyFinalGenerationInput(monthlyFinalContract("B1"), frameworkRef);
 const candidate = fakeMonthlyFinalAiOutput(input).productive;
 input.month = "2026-12";
 const pairs = [["checked", "finished"], ["called", "reviewed"], ["started", "updated"], ["signed off", "moved on"]];
 input.pronunciation.forEach((pool, index) => {
  pool.taughtExamples = [...pairs[index]!, "extra example"].map(word => ({ word, exampleId: `${pool.code}-${word}`, ipa: pool.ipa }));
 });
 const metadata = { traceId: "read-aloud" };
 const calls: MonthlyFinalReadAloudInput[] = [];
 const runner = { runTask: async (taskId: string, raw: any) => {
  if (taskId === "monthly_final_grammar_evidence_review") return { output: { items: raw.items.map((item: any) => ({ key: item.key, matches: true, reason: "Matches." })) }, metadata: {} };
  if (taskId === "monthly_final_productive_generation") throw Object.assign(new Error("invalid"), {
   code: "AI_OUTPUT_INVALID", details: { invalidOutput: JSON.stringify(candidate) }
  });
  calls.push(raw);
  const omission = { candidates: ["We helped the team, then called about the plan. We started and updated the tracker, then signed off and moved on."] };
  return { output: normalizeMonthlyFinalReadAloudOutput(omission, raw), metadata };
 }} as unknown as AiTaskRunner;
 const result = await generateMonthlyFinalProductive(runner, input, "Generate exam");
 expect(calls).toHaveLength(1);
 expect(calls[0]?.pools?.map(pool => pool.examples.map(example => example.word))).toEqual(pairs);
 expect(result.metadata).toBe(metadata);
 expect((result.output as any).speakingA.text).toBe(calls[0]?.fallbackText);
 expect((result.output as any).speakingA.positions.map(({word}: {word:string}) => word)).toEqual(pairs.flat());
});

it("does not send an already accepted grammar quote to the reviewer again, but re-reviews rejected ones",async()=>{
 let reviews=0;
 const base={runTask:async(_taskId:string,raw:any)=>{reviews++;return {output:{items:raw.items.map((item:any)=>({key:item.key,matches:item.quote.startsWith("Good"),reason:"r"}))},metadata:{}};}} as unknown as AiTaskRunner;
 const runner=withAcceptedGrammarReviewMemo(base);
 const item=(quote:string)=>({items:[{key:"writing.gbMain",grammar:{focus:"f",formula:"x",usage:"u"},quote}]});
 for(let i=0;i<3;i++)await runner.runTask("monthly_final_grammar_evidence_review",item("Good quote."),{systemPrompt:"p"});
 for(let i=0;i<2;i++)await runner.runTask("monthly_final_grammar_evidence_review",item("Bad quote."),{systemPrompt:"p"});
 expect(reviews).toBe(3);
});
