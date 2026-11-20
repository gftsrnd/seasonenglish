// @vitest-environment jsdom
import {render,screen,act,cleanup} from "@testing-library/react";import "@testing-library/jest-dom/vitest";
import {userEvent} from "@testing-library/user-event";import {afterEach,describe,it,expect,vi} from "vitest";
import {OperatorMonths,type OperatorMonthsActions} from "./Months.js";import {ToastProvider} from "../shared/design-system.js";import {ModalProvider} from "../shared/ModalProvider.js";

const makeActions=(generate:OperatorMonthsActions["onGenerateFramework"]):OperatorMonthsActions=>{ return {onSelectMonth:vi.fn(),onSelectLevel:vi.fn(),onSuggestBrief:vi.fn(),onSaveBrief:vi.fn(),onApproveBrief:vi.fn(),onGenerateFramework:generate,onSaveFramework:vi.fn(),onApproveFramework:vi.fn(),onSaveDay:vi.fn(),onGenerateDay:vi.fn(),onAcknowledge:vi.fn(),onApproveDay:vi.fn(),onCreateCorrection:vi.fn(),onSaveCorrection:vi.fn(),onAcknowledgeCorrection:vi.fn(),onApproveCorrection:vi.fn()};};
function testView(generate:OperatorMonthsActions["onGenerateFramework"], checkpoint?: import("../../api/operator.js").MonthlyResourceCheckpointView) { return (<ModalProvider><ToastProvider><OperatorMonths month="2026-11" todayMonth="2026-11" cefr="A1" busy={false} {...(checkpoint ? {resourceCheckpoint:checkpoint} : {})} actions={makeActions(generate)} overview={{systemDate:"2026-11-06",monthWindow:{previous:"2026-10",current:"2026-11",next:"2026-12",writable:true},brief:{month:"2026-11",title:"Work",brief:"Explain work",context:"Office",communicationGoal:"Give an update",version:1,status:"approved"},frameworks:[{id:"f",cefr:"A1",version:1,status:"draft",scopeHash:"scope",resources:{coreTerms:[],supportTerms:[],grammarTopics:[],sounds:[]},lessons:[],quality:{severe:[],light:[]}}]}} /></ToastProvider></ModalProvider>);}

afterEach(cleanup);
describe("resource regeneration state",()=>{
 it("shows a spinner and progress for an existing draft and prevents repeat clicks",async()=>{
 let finish!:()=>void;const generate=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
 const actions:OperatorMonthsActions={onSelectMonth:vi.fn(),onSelectLevel:vi.fn(),onSuggestBrief:vi.fn(),onSaveBrief:vi.fn(),onApproveBrief:vi.fn(),onGenerateFramework:generate,onSaveFramework:vi.fn(),onApproveFramework:vi.fn(),onSaveDay:vi.fn(),onGenerateDay:vi.fn(),onAcknowledge:vi.fn(),onApproveDay:vi.fn(),onCreateCorrection:vi.fn(),onSaveCorrection:vi.fn(),onAcknowledgeCorrection:vi.fn(),onApproveCorrection:vi.fn()};
 render(<ModalProvider><ToastProvider><OperatorMonths month="2026-11" todayMonth="2026-11" cefr="A1" busy={false} actions={actions} overview={{systemDate:"2026-11-06",monthWindow:{previous:"2026-10",current:"2026-11",next:"2026-12",writable:true},brief:{month:"2026-11",title:"Work",brief:"Explain work",context:"Office",communicationGoal:"Give an update",version:1,status:"approved"},frameworks:[{id:"f",cefr:"A1",version:1,status:"draft",scopeHash:"scope",resources:{coreTerms:[],supportTerms:[],grammarTopics:[],sounds:[]},lessons:[],quality:{severe:[],light:[]}}]}} /></ToastProvider></ModalProvider>);
 await userEvent.click(screen.getByRole("button",{name:"Sinh lại tài nguyên"}));
 // Replacing an existing draft now asks for confirmation first.
 await userEvent.click(await screen.findByRole("button",{name:"Sinh lại"}));
 const running=screen.getByRole("button",{name:"Đang sinh tài nguyên…"});expect(running).toBeDisabled();expect(running.querySelector(".spinner")).not.toBeNull();expect(screen.getByText("Đang chuẩn bị sinh tài nguyên…")).toBeInTheDocument();
 await userEvent.click(running);expect(generate).toHaveBeenCalledTimes(1);
 await act(async()=>{finish();});expect(screen.getByRole("button",{name:"Sinh lại tài nguyên"})).toBeEnabled();expect(screen.getByText("Đã hoàn tất tài nguyên tháng")).toBeInTheDocument();
 });
 it("recovers from a lost request when the same server run later completes",async()=>{
 let reject!:(reason:unknown)=>void;const generate=vi.fn(()=>new Promise<void>((_resolve,rejectPromise)=>{reject=rejectPromise;}));
 const view=render(testView(generate));await userEvent.click(screen.getByRole("button",{name:"Sinh lại tài nguyên"}));await userEvent.click(await screen.findByRole("button",{name:"Sinh lại"}));
 const progress:import("@e4s/contracts").MonthlyResourceGenerationProgress={runId:"observed-run",status:"running",phase:"expandedTerms",counts:{coreTerms:48,expandedTerms:26},startedAt:"2026-11-06T00:00:00Z",updatedAt:"2026-11-06T00:01:00Z"};
 const cp:import("../../api/operator.js").MonthlyResourceCheckpointView={state:"draft_checkpoint",draftOnly:true,publishable:false,retryOnlyMissing:true,generationId:"g",version:1,briefVersion:1,updatedAt:null,progress,categories:{coreTerms:{state:"complete",count:48,target:48},expandedTerms:{state:"missing",count:26,target:432},grammarTopics:{state:"missing",count:0,target:2},pronunciationTargets:{state:"missing",count:0,target:4}}};
 view.rerender(testView(generate,cp));expect(screen.getByText("Đang bổ sung và kiểm tra từ mở rộng…")).toBeInTheDocument();await act(async()=>reject(new Error("Connection lost")));
 view.rerender(testView(generate,{...cp,progress:{...progress,status:"completed",phase:"saving"}}));
 expect(screen.getByText("Đã hoàn tất tài nguyên tháng")).toBeInTheDocument();expect(screen.queryByText(/Chưa hoàn tất ở phần/)).toBeNull();expect(screen.getByRole("button",{name:"Sinh lại tài nguyên"})).toBeEnabled();
 });

});
