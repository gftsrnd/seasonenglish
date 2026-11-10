import {expect,it} from "vitest";
import {createAiService} from "../src/service.js";
import {AI_TASKS} from "../src/registry.js";
import {validateMonthlyFinalListeningOutput,validateMonthlyFinalProductiveOutput,validateMonthlyFinalReadingOutput, type MonthlyFinalGenerationInput, type MonthlyFinalListeningOutput, type MonthlyFinalProductiveOutput} from "../src/monthly-final-schemas.js";

it("rejects a translated opening hint in learner notes because the English hint is appended separately", () => {
  const task = AI_TASKS.get("monthly_final_writing_notes_repair");
  const notes = {
    task: 'Viết tin nhắn cho đồng nghiệp. Gợi ý câu mở đầu: "Đây là bản cập nhật ngắn."',
    facts: "Đội đã gửi bản chỉnh sửa hôm qua.",
    requirements: ["Cập nhật tiến độ.", "Đề xuất bước tiếp theo."]
  };
  expect(task.validateOutput?.(notes, {})).toEqual([expect.objectContaining({path:"task"})]);
  expect(task.validateOutput?.({...notes,task:"Viết tin nhắn cho đồng nghiệp."}, {})).toEqual([]);
});

function fixture() {
  const term=(word:string)=>({id:word,code:word,word,type:"noun",meaning:word});
  const input={month:"2026-11",cefr:"A1",formCode:"A1",frameworkVersion:1,theme:{title:"Feedback",brief:"",context:"",communicationGoal:""},allocation:{n:10,l:2,r:1,w:4,s:3},levelProfile:{listeningScriptWords:{min:10,max:100},readingItem:{maxWords:12},writing:{minWords:35,maxWords:45},speakingA:{maxWords:18}},targets:{listening:[term("easy"),term("phone")],reading:[term("report")],writing:["nice","round","done","end"].map(term),speaking:["client","feedback","report"].map(term)},grammar:(["GA","GB"] as const).map(code=>({code,topicId:code,topicTitle:code,taughtSteps:[1,2].map(n=>({stepId:code+n,focus:"Focus",formula:"Subject + V",usage:"Usage",examples:[]}))})),pronunciation:[["team","meeting"],["learn","work"],["think","month"],["back","plan"]].map((words,index)=>({code:(["P1","P2","P3","P4"] as const)[index]!,soundId:`p${index}`,ipa:"/x/",label:"Sound",taughtExamples:words.map(word=>({exampleId:word,word,ipa:"/x/"}))})),backgroundWords:[]} as MonthlyFinalGenerationInput;
  const message=(label:"A"|"B",word:string)=>({label,speaker:"Anna",script:`Our ${word} is ready. We can meet tomorrow. Please send a short update before the next meeting.`,gaSentence:`Our ${word} is ready.`,gbSentence:"We can meet tomorrow.",questions:[{termId:word,prompt:"What is ready?",options:[word,"other","third"],correctIndex:0,explanation:"The speaker says it is ready.",evidence:`Our ${word} is ready.`}]});
  const listening:MonthlyFinalListeningOutput={listening:{messages:[message("A","easy"),message("B","phone")]}};
  const writing="Thank you for the nice feedback. We have done the first round of changes. We can finish by the end of Monday. Could you confirm this date? The team is checking your comments now. Thank you.";
  const productive={title:"Monthly exam",grammarComponents:input.grammar.map(t=>({code:t.code,mainStepId:t.code+1,mainLabel:"Main",mainPatterns:["Subject + V"],secondaryStepId:t.code+2,secondaryLabel:"Secondary",secondaryPatterns:["Subject + V"]})),writing:{task:'Bắt đầu bằng câu gợi ý: "Thank you for the nice feedback."',facts:"The client gave feedback.",requirements:["Give an update.","Confirm a date."],sample:writing,evidence:{gaMain:"The team is checking your comments now.",gaSecondary:"We have done the first round of changes.",gbMain:"Could you confirm this date?",gbSecondary:"We can finish by the end of Monday."}},speakingA:{text:"Our team will learn and work back at the meeting. Think about the plan this month.",positions:input.pronunciation.flatMap(t=>t.taughtExamples.map(e=>({code:t.code,exampleId:e.exampleId,word:e.word,target:t.ipa})))},speakingB:{task:"Leave a voice note.",facts:"The client gave feedback.",requirements:["Give an update.","Ask for a report."],sample:"The client gave feedback. Our report is ready. Could you call me?",evidence:{gaMain:"Our report is ready.",gbMain:"Could you call me?"}}} as MonthlyFinalProductiveOutput;
  return {input,listening,productive};
}

it("accepts consistent content while preserving all four pronunciation targets",()=>{
  const f=fixture();
  expect(validateMonthlyFinalListeningOutput(f.listening,f.input)).toEqual([]);
  expect(validateMonthlyFinalProductiveOutput(f.productive,f.input)).toEqual([]);
});
it("rejects a target word only present in the question and evidence absent from the actual recording",()=>{
  const f=fixture();f.listening.listening.messages[0]!.script="The update is ready. We can meet tomorrow.";
  const issues=validateMonthlyFinalListeningOutput(f.listening,f.input);
  expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({path:"listening.messages.0.questions.0.termId"}),expect.objectContaining({path:"listening.messages.0.questions.0.evidence"})]));
});
it("rejects explanatory prose in a grammar quote and missing productive vocabulary",()=>{
  const f=fixture();f.productive.writing.evidence.gaMain='"The team is checking your comments now." (add this sentence if needed)';f.productive.speakingB.sample="Our report is ready. Could you call me?";
  const issues=validateMonthlyFinalProductiveOutput(f.productive,f.input);
  expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({path:"writing.evidence.gaMain"}),expect.objectContaining({path:"speakingB.sample"})]));
});
it.each([["A1",18],["A2",22],["B1",25],["B2",35],["C1",45]] as const)("rejects %s pronunciation positions absent from the passage and a passage beyond its %s-word profile",(cefr,maxWords)=>{
  const f=fixture();f.input.cefr=cefr;f.input.levelProfile.speakingA={maxWords};f.productive.speakingA.text="Our team will show the new design to the client on Monday. Please read the sample feedback, the project plan and the meeting schedule clearly."+" Please check the design again.".repeat(10);
  const issues=validateMonthlyFinalProductiveOutput(f.productive,f.input);
  expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({path:"speakingA.text"}),expect.objectContaining({path:"speakingA.positions.P2"})]));
});
it("uses the actual level profile rather than imposing A1's short passage on C1",()=>{
  const f=fixture();f.productive.speakingA.text+=" Please send the notes after the call today.";
  expect(validateMonthlyFinalProductiveOutput(f.productive,f.input).some(issue=>issue.path==="speakingA.text")).toBe(true);
  f.input.cefr="C1";f.input.levelProfile.speakingA={maxWords:45};
  expect(validateMonthlyFinalProductiveOutput(f.productive,f.input)).toEqual([]);
});
it("rejects one word above the real read-aloud maximum and reordered word lists",()=>{
 const f=fixture();f.productive.speakingA.text="Our team will learn and work back at the meeting. Think about the plan this month, please today now.";
 expect(validateMonthlyFinalProductiveOutput(f.productive,f.input)).toEqual(expect.arrayContaining([expect.objectContaining({path:"speakingA.text"})]));
 f.productive.speakingA.text=f.productive.speakingA.positions.map(position=>position.word).reverse().join(", ");
 expect(validateMonthlyFinalProductiveOutput(f.productive,f.input)).toEqual(expect.arrayContaining([expect.objectContaining({path:"speakingA.text",message:expect.stringContaining("list")})]));
});
it("rejects an otherwise complete model writing answer outside the learner's word range",()=>{
 const f=fixture();f.productive.writing.sample+=" Please contact me tomorrow for more details about the next review meeting with our client.";
 expect(validateMonthlyFinalProductiveOutput(f.productive,f.input)).toEqual(expect.arrayContaining([expect.objectContaining({path:"writing.sample",message:expect.stringContaining("35–45")})]));
});
it("requires A1 opening support and rejects reading options which only differ by inflection",()=>{
 const f=fixture();f.productive.writing.task="Write a message.";
 expect(validateMonthlyFinalProductiveOutput(f.productive,f.input)).toEqual(expect.arrayContaining([expect.objectContaining({path:"writing.task"})]));
 const reading={reading:{questions:[{termId:"report",prompt:"Send a report.",options:["report","reports","reporting"],correctIndex:0,explanation:"A singular noun is required."}]}};
 expect(validateMonthlyFinalReadingOutput(reading,f.input)).toEqual(expect.arrayContaining([expect.objectContaining({path:"reading.questions.0.options"})]));
});

it("flags reading length bias and copied grammar examples before the full exam is assembled", () => {
  const {input} = fixture();
  const terms = ["report", "plan", "call", "meeting"];
  input.targets.reading = terms.map(word => ({id: word, code: word, word, type: "noun", meaning: word}));
  input.grammar[0]!.taughtSteps[0]!.examples = ["We need a report today."];
  const questions = terms.map(word => ({
    termId: word,
    prompt: `We need a ${word} today.`,
    options: ["a detailed item for the work team", "a price", "a place"],
    correctIndex: 0,
    explanation: "The meaning matches the context."
  }));
  expect(validateMonthlyFinalReadingOutput({reading: {questions}}, input)).toEqual(expect.arrayContaining([
    expect.objectContaining({path: "reading.questions", message: expect.stringContaining("uniquely longest")}),
    expect.objectContaining({path: "reading.questions.0", message: expect.stringContaining("taught grammar example")})
  ]));
});

it("flags a private sample sentence already visible in the task facts", () => {
  const {input, productive} = fixture();
  productive.writing.facts = "We have done the first round of changes.";
  expect(validateMonthlyFinalProductiveOutput(productive, input)).toEqual(expect.arrayContaining([
    expect.objectContaining({path: "writing.sample", message: expect.stringContaining("Paraphrase")})
  ]));
});

it("feeds concrete content failures back through the existing bounded AI repair loop",async()=>{
  const f=fixture();let calls=0;let feedback="";
  const service=createAiService({registry:AI_TASKS,maxAttempts:2,loadPrompt:async()=>"Generate the monthly exam.",provider:{name:"test",model:"fixture",complete:async request=>{
    calls++;feedback=JSON.stringify(request.messages??[]);
    const output=structuredClone(f.productive);
    if(calls===1){
      output.speakingA.text="Our team can show the design to the client. Please read the project plan and the meeting schedule before the next presentation starts on Monday.";
      output.writing.evidence.gaMain="Insert a sentence here.";output.writing.evidence.gbMain="Insert another sentence here.";
      output.writing.sample="This draft is ready and we can discuss the next steps during the meeting tomorrow. Please contact us later.";
      output.speakingB.sample="Our report is ready. Could you call me?";
    }
    return {output,usage:{}};
  }}});
  const result=await service.runTask("monthly_final_productive_generation",f.input);
  expect(calls).toBe(2);expect(feedback).toContain('speakingA.positions.P2');expect(feedback).toContain('learn');
  expect(feedback).toContain('writing.sample:');expect(feedback).toContain('speakingB.sample:');
  expect(result.output).toEqual(f.productive);
});
