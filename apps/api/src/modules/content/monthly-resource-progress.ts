import {randomUUID} from "node:crypto";
import type {MonthlyResourceGenerationProgress} from "@e4s/contracts";
/** Request observer only: it neither starts AI calls nor changes generation/checkpoint decisions. */
export class MonthlyResourceProgressStore {
  private entries = new Map<string,MonthlyResourceGenerationProgress>();
  start(key:string): MonthlyResourceGenerationProgress {
    const now = new Date().toISOString();
    for (const [id,value] of this.entries) if (value.status !== "running" && Date.now()-Date.parse(value.updatedAt)>30*60_000) this.entries.delete(id);
    const value:MonthlyResourceGenerationProgress = {runId:randomUUID(),status:"running",phase:"preparing",counts:{},startedAt:now,updatedAt:now};
    this.entries.set(key,value); return structuredClone(value);
  }
  read(key:string):MonthlyResourceGenerationProgress|null {const value=this.entries.get(key);return value ? structuredClone(value) : null;}
  update(key:string,runId:string,patch:Partial<Omit<MonthlyResourceGenerationProgress,"counts">> & {counts?:MonthlyResourceGenerationProgress["counts"]}):void {
    const prior=this.entries.get(key);if(!prior || prior.runId!==runId)return;
    this.entries.set(key,{...prior,...patch,runId,counts:{...prior.counts,...patch.counts},updatedAt:new Date().toISOString()});
  }
}
