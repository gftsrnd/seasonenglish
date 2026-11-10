import {expect,it} from "vitest";
import {createAiService} from "../src/service.js";
import {AI_TASKS} from "../src/registry.js";
it("accepts a negative semantic judgement without retrying the reviewer to force a positive answer",async()=>{
 let calls=0;
 const service=createAiService({registry:AI_TASKS,loadPrompt:async()=>"Review evidence",provider:{name:"test",model:"test",complete:async()=>{calls++;return {output:{items:[{key:"writing.gaMain",matches:false,reason:"Future does not demonstrate simple present."}]},usage:{}};}}});
 const result=await service.runTask("monthly_final_grammar_evidence_review",{items:[{key:"writing.gaMain",quote:"We are going to meet tomorrow.",grammar:{focus:"Simple present",formula:"Subject + V",usage:"Facts"}}]});
 expect(calls).toBe(1);expect(result.output).toMatchObject({items:[{matches:false}]});
});
