import {expect,it} from "vitest";
import type {AiTaskRunner} from "@e4s/ai";
import {buildMonthlyFinalGenerationInput} from "../src/modules/assessment/monthly-final-builder.js";
import {generateMonthlyFinalListening} from "../src/modules/assessment/monthly-final-listening-generation.js";
import {fakeMonthlyFinalAiOutput,frameworkRef,monthlyFinalContract} from "./support/monthly-final-fixture.js";

it.each(["A1","A2","B1","B2","C1"] as const)("gives each %s listening target to exactly one isolated message call",async cefr=>{
  const input=buildMonthlyFinalGenerationInput(monthlyFinalContract(cefr),frameworkRef),fixture=fakeMonthlyFinalAiOutput(input);
  const calls:Array<{label:string;ids:string[]}>=[];
  const runner={runTask:async(taskId:string,raw:any)=>{
    expect(taskId).toBe("monthly_final_listening_message_generation");calls.push({label:raw.messageLabel,ids:raw.targets.listening.map((term:any)=>term.id)});
    const message=fixture.receptive.listening.messages.find(message=>message.label===raw.messageLabel)!;
    expect(message.questions.map(q=>q.termId)).toEqual(raw.targets.listening.map((term:any)=>term.id));
    return {output:message,metadata:{}};
  }} as unknown as AiTaskRunner;
  const result=await generateMonthlyFinalListening(runner,input,"Generate messages");
  expect(calls.map(c=>c.label)).toEqual(["A","B"]);
  const assigned=calls.flatMap(c=>c.ids);expect(new Set(assigned).size).toBe(input.targets.listening.length);expect(assigned).toEqual(input.targets.listening.map(term=>term.id));
  expect(result.output).toEqual({listening:fixture.receptive.listening});
});
it("isolates a still-invalid message with exact target meanings and concrete repair feedback",async()=>{
 const input=buildMonthlyFinalGenerationInput(monthlyFinalContract("A1"),frameworkRef),fixture=fakeMonthlyFinalAiOutput(input);
 const calls:any[]=[];const runner={runTask:async(_id:string,raw:any,options:any)=>{
  calls.push({label:raw.messageLabel,options});const message=fixture.receptive.listening.messages.find(m=>m.label===raw.messageLabel)!;
  if(raw.messageLabel==="A"&&!options.messages)throw Object.assign(new Error("invalid"),{code:"AI_OUTPUT_INVALID",details:{invalidOutput:JSON.stringify(message),issues:[{path:"scriptBlocks.0",message:"Use the exact assessed term."}]}});
  if(options.messages){expect(options.messages[2].content).toContain("Use the exact assessed term.");expect(options.systemPrompt).toContain(input.targets.listening[0]!.word);}
  return {output:message,metadata:{}};
 }} as unknown as AiTaskRunner;
 expect((await generateMonthlyFinalListening(runner,input,"Full exam prompt")).output).toEqual({listening:fixture.receptive.listening});
 expect(calls.filter(call=>call.label==="A")).toHaveLength(2);expect(calls.filter(call=>call.label==="B")).toHaveLength(1);
});
