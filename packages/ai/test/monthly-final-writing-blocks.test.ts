import {expect,it} from "vitest";
import {writingBlocksInput,composeWritingBlocks,validateMonthlyFinalWritingBlocks} from "../src/monthly-final-writing-blocks.js";
import {validateMonthlyFinalSampleRepair,type MonthlyFinalSampleRepairInput} from "../src/monthly-final-sample-repair.js";
const input:MonthlyFinalSampleRepairInput={kind:"writing",cefr:"A1",targets:["nice","round","done","end"].map(word=>({word,type:"noun",meaning:word})),theme:"Feedback",task:'Bắt đầu tin nhắn bằng câu gợi ý: "Dear Mr. Tran, thank you for the feedback last week."',facts:"The first design is ready.",requirements:["Give an update."],grammar:[{},{}],profile:{minWords:35,maxWords:45},previousSample:""};
const blocks={gaMain:"The new design is very nice now.",gaSecondary:"We finished the first round on Monday.",gbMain:"Could the work be done next Monday?",gbSecondary:"We will finish before the end date."};
it("allocates per-role words and budgets, then derives sample and exact evidence from the same AI text",()=>{
  const plan=writingBlocksInput(input);
  expect(plan.blocks.map(block=>block.targets.map(term=>term.word))).toEqual([["nice"],["round"],["done"],["end"]]);
  expect(validateMonthlyFinalWritingBlocks(blocks,plan)).toEqual([]);
  const output=composeWritingBlocks(blocks,plan);
  expect(output.sample).toBe([plan.opening,...Object.values(blocks)].join(" "));
  expect(validateMonthlyFinalSampleRepair(output,input)).toEqual([]);
  expect(output.evidence).toEqual(blocks);
});
it("rejects oversized blocks and a missing assigned word before composing a sample",()=>{
  const plan=writingBlocksInput(input);
  const issues=validateMonthlyFinalWritingBlocks({...blocks,gbMain:"Could you send an extremely long report to our client before we meet on Monday?"},plan);
  expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({path:"gbMain",message:expect.stringContaining("done")}),expect.objectContaining({path:"gbMain",message:expect.stringContaining("words")})]));
});
it("allows naturally uneven blocks when the final sample satisfies the actual exam requirements",()=>{
 const plan=writingBlocksInput(input);
 expect(validateMonthlyFinalWritingBlocks({...blocks,gaSecondary:"Yesterday, we finished another round.",gbMain:"Could the work be done by next Monday, please?"},plan)).toEqual([]);
});
