import {expect,it} from "vitest";
import {validateMonthlyFinalSampleRepair,type MonthlyFinalSampleRepairInput} from "../src/monthly-final-sample-repair.js";
const input:MonthlyFinalSampleRepairInput={kind:"writing",cefr:"A1",targets:["nice","round","done","end"].map(word=>({word,type:"noun",meaning:word})),theme:"Feedback",task:"Give a client an update.",facts:"Work is nearly complete.",requirements:["Give an update."],grammar:[{},{}],profile:{minWords:35,maxWords:45},previousSample:""};
const sample="Thank you very much for the nice feedback. We have done the first round of changes. We can finish by the end of Monday. Could you confirm this date? The team is checking your comments now.";
const good={sample,evidence:{gaMain:"The team is checking your comments now.",gaSecondary:"We have done the first round of changes.",gbMain:"Could you confirm this date?",gbSecondary:"We can finish by the end of Monday."}};
it("accepts a compact sample with all assigned words and real evidence quotes",()=>{expect(validateMonthlyFinalSampleRepair(good,input)).toEqual([]);});
it("rejects absent words, commentary presented as evidence and writing beyond the word range",()=>{
  const result=validateMonthlyFinalSampleRepair({...good,sample:"Please contact the client.",evidence:{...good.evidence,gaMain:"Add a sentence later."}},input);
  expect(result).toEqual(expect.arrayContaining([expect.objectContaining({path:"sample"}),expect.objectContaining({path:"evidence.gaMain"})]));
});
