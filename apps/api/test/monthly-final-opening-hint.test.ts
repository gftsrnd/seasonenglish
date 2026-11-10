import {expect,it} from "vitest";
import {assembleMonthlyFinalFromAi,buildMonthlyFinalGenerationInput} from "../src/modules/assessment/monthly-final-builder.js";
import {evaluateMonthlyFinal} from "../src/modules/assessment/monthly-final-checks.js";
import {fakeMonthlyFinalAiOutput,frameworkRef,monthlyFinalContract} from "./support/monthly-final-fixture.js";

const starter="Dear Mr. Nam, thank you for the feedback yesterday.";
const answer="We finished the first design last week. We can finish the changes next Monday.";
function fixture(level:"A1"|"B1"="A1"){
  const contract=monthlyFinalContract(level),input=buildMonthlyFinalGenerationInput(contract,frameworkRef),output=fakeMonthlyFinalAiOutput(input);
  output.productive.writing.sample=`${starter} ${answer}`;
  output.productive.writing.task=`Bắt đầu tin nhắn bằng câu gợi ý: "${starter}"`;
  const blueprint=assembleMonthlyFinalFromAi(contract,frameworkRef,output.receptive,output.productive);
  const writing=blueprint.sections.find(s=>s.code==="writing")!.groups[0]!.tasks[0]!;
  const check=()=>evaluateMonthlyFinal(blueprint,contract).checks.find(c=>c.code==="GEN18")!.status;
  return {blueprint,writing,check};
}
it("allows the explicitly marked A1 writing starter, including a title abbreviation",()=>{expect(fixture().check()).toBe("pass");});
it.each([["'","'"],["‘","’"],["“","”"]])("allows an explicitly marked starter using %s %s",(left,right)=>{
  const f=fixture();f.writing.prompt=`Câu mở đầu gợi ý: ${left}${starter}${right}`;expect(f.check()).toBe("pass");
});
it("still blocks the full answer or a later answer sentence after the starter",()=>{
  const f=fixture();f.writing.prompt+=` ${answer}`;expect(f.check()).toBe("fail");
});
it("does not exempt the same sentence in another learner field",()=>{
  const f=fixture();f.blueprint.sections.find(s=>s.code==="reading")!.groups[0]!.tasks[0]!.prompt=starter;expect(f.check()).toBe("fail");
});
it("does not exempt a script that happens to match an allowed opening",()=>{
  const f=fixture();f.blueprint.sections[0]!.groups[0]!.stimulus!.lines![0]!.text=starter;expect(f.check()).toBe("fail");
});
it("requires an A1 marked prefix and never exempts an entire sample",()=>{
  expect(fixture("B1").check()).toBe("fail");
  const f=fixture();f.writing.prompt=f.writing.prompt.replace(starter,answer);expect(f.check()).toBe("fail");
  const full=fixture();full.writing.prompt=`Bắt đầu tin nhắn bằng câu gợi ý: "${full.blueprint.monthlyExam!.grader.writingSample}"`;expect(full.check()).toBe("fail");
  const unmarked=fixture();unmarked.writing.prompt=starter;expect(unmarked.check()).toBe("fail");
});
it("does not exempt a near-complete answer fragment or a repeated marked starter",()=>{
  const f=fixture();const partial=starter.replace(/\.$/u,"");f.writing.prompt=`Bắt đầu tin nhắn bằng câu gợi ý: "${partial}"`;expect(f.check()).toBe("fail");
  const repeated=fixture();repeated.writing.prompt+=` Bắt đầu tin nhắn bằng câu gợi ý: "${starter}"`;expect(repeated.check()).toBe("fail");
});
