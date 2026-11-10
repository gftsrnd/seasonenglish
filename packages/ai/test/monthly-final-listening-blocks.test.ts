import {expect,it} from "vitest";
import {listeningScriptPlan,validateMonthlyFinalListeningBlocks} from "../src/monthly-final-listening-blocks.js";
import {monthlyFinalListeningMessageOutputSchema,type MonthlyFinalGenerationInput} from "../src/monthly-final-schemas.js";
const input={levelProfile:{listeningScriptWords:{min:70,max:90}},targets:{listening:[{id:"report",word:"report"},{id:"client",word:"client"}]}} as unknown as MonthlyFinalGenerationInput;
it("plans a bounded full script and composes it from the actual blocks",()=>{
 const plan=listeningScriptPlan(input);expect(plan.blocks).toHaveLength(5);expect(plan.blocks[0]).toMatchObject({minWords:14,maxWords:18,termIds:["report"],grammarRole:"GA"});
 const blocks=["Our report is ready for the meeting, and we can discuss the main points today.","The client sent some helpful feedback yesterday, so we are checking the design before Friday.","We finished the first design on Monday and are updating the details after the call.","Our team needs two more days to check everything carefully and send the final version.","Could you please check the new date and tell our team if this plan works?"];
 const parsed=monthlyFinalListeningMessageOutputSchema.parse({label:"A",speaker:"Anna",scriptBlocks:blocks,questions:[{termId:"report",prompt:"What is ready?",options:["Report","Meeting","Date"],correctIndex:0,explanation:"The report is ready.",evidence:"Our report is ready for the meeting"}]});
 expect(parsed.script).toBe(blocks.join(" "));expect(parsed.gaSentence).toBe(blocks[0]);expect(parsed.gbSentence).toBe(blocks[4]);
 expect(validateMonthlyFinalListeningBlocks(parsed,{...input,scriptPlan:plan})).toEqual([]);
});
it("identifies the oversized block in an overlong script and the missing vocabulary",()=>{
 const plan=listeningScriptPlan(input);
 const output={scriptBlocks:["A short unrelated sentence.","client "+"word ".repeat(110),"one","two","three"]} as any;
 expect(validateMonthlyFinalListeningBlocks(output,{...input,scriptPlan:plan})).toEqual(expect.arrayContaining([expect.objectContaining({path:"scriptBlocks.0",message:expect.stringContaining("report")}),expect.objectContaining({path:"scriptBlocks.1",message:expect.stringContaining("words")})]));
});
it("allows uneven sentence lengths when the complete script is 70 words and every assigned word is present",()=>{
 const assigned={...input,targets:{...input.targets,listening:["company","move","staff","agree","computer","phone"].map(word=>({id:word,word}))}} as MonthlyFinalGenerationInput;
 const blocks=["Hello everyone, Lan here. We sent the draft to the company, and I called on the phone.","The client wants to move the meeting from Thursday to Friday morning.","Our staff will prepare the new design this week, led by Mr. Hung.","The client did not agree with the old deadline, so we agreed on a new date.","Could you check your computer for the new file, please? Thank you."];
 expect(validateMonthlyFinalListeningBlocks({scriptBlocks:blocks} as any,{...assigned,scriptPlan:listeningScriptPlan(assigned)})).toEqual([]);
});
it("does not impose a hard sentence maximum when the complete script and word coverage pass",()=>{
 const blocks=["Our report is ready for the meeting, and we can discuss all of the main points today together.","The client sent some helpful feedback yesterday, so we are checking the design before Friday.","We finished the first design on Monday and are updating the details after the call.","Our team needs two more days to check everything carefully and send the final version.","Could you please check the new date and tell our team if this plan works?"];
 expect(validateMonthlyFinalListeningBlocks({scriptBlocks:blocks} as any,{...input,scriptPlan:listeningScriptPlan(input)})).toEqual([]);
});
