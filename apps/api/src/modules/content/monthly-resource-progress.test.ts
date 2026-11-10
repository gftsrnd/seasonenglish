import {describe,it,expect} from "vitest";
import {MonthlyResourceProgressStore} from "./monthly-resource-progress.js";
describe("resource generation progress", () => {
 it("keeps independent operators/levels isolated and ignores a superseded run's updates", () => {
 const store=new MonthlyResourceProgressStore();const first=store.start("operator:2026-11:A1");store.update("operator:2026-11:A1",first.runId,{phase:"expandedTerms",counts:{coreTerms:48,expandedTerms:26}});expect(store.read("other:2026-11:A1")).toBeNull();expect(store.read("operator:2026-11:B1")).toBeNull();
 const next=store.start("operator:2026-11:A1");store.update("operator:2026-11:A1",first.runId,{status:"completed"});expect(store.read("operator:2026-11:A1")?.runId).toBe(next.runId);expect(store.read("operator:2026-11:A1")?.status).toBe("running");
 });
 it("retains the failed stage and measured counts so a retry can explain where it stopped", () => {
 const store=new MonthlyResourceProgressStore();const run=store.start("key");store.update("key",run.runId,{phase:"pronunciationTargets",current:2,total:4,counts:{grammarTopics:2}});store.update("key",run.runId,{status:"failed"});expect(store.read("key")).toMatchObject({status:"failed",phase:"pronunciationTargets",current:2,total:4,counts:{grammarTopics:2}});
 });
});
