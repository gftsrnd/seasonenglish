import { expect,it } from "vitest";
import { monthlyGenerationFailure } from "./monthly-generation-errors.js";
it("identifies the rejected review part without retaining raw model output",()=>{
  const result=monthlyGenerationFailure({code:"AI_OUTPUT_INVALID",monthlyComponents:["grammar","pronunciation"],details:{invalidOutput:JSON.stringify({lesson:{parts:[{code:"grammar",content:"private model text"}]}}),issues:[{path:"lesson.parts.0.content",message:"Expected object"}]}});
  expect(result).toMatchObject({status:422,body:{code:"AI_OUTPUT_INVALID",issues:[{component:"grammar",path:"lesson.parts.0.content"}]}});
  expect(JSON.stringify(result)).not.toContain("private model text");
});
it("keeps provider failures distinct and leaves programming errors to the error handler",()=>{
  expect(monthlyGenerationFailure({code:"AI_TIMEOUT",monthlyComponents:["reading"]})).toMatchObject({status:504,body:{code:"AI_TIMEOUT",components:["reading"]}});
  expect(monthlyGenerationFailure(new Error("programming error"))).toBeUndefined();
});
it("uses normalized indexes when the model duplicates a section",()=>{
  const result=monthlyGenerationFailure({code:"AI_OUTPUT_INVALID",details:{invalidOutput:JSON.stringify({title:"Review",parts:[{code:"grammar",content:{}},{code:"grammar",content:{items:[]}},{code:"listening",content:"invalid prose"}]}),issues:[{path:"lesson.parts.1.content",message:"Expected object"}]}});
  expect(result?.body.issues[0]?.component).toBe("listening");
});
