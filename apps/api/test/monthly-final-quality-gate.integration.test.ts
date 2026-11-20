import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {createCredentialHash} from "@e4s/domain";
import {DEMO_IDS,migrateDatabase,resetPublicSchema,seedDemo} from "@e4s/database";
import type {AiTaskRunner} from "@e4s/ai";
import {buildApi} from "../src/app.js";
import {assembleMonthlyFinalFromAi,buildMonthlyFinalGenerationInput} from "../src/modules/assessment/monthly-final-builder.js";
import {fakeMonthlyFinalAiOutput,frameworkRef,monthlyFinalContract} from "./support/monthly-final-fixture.js";

// Run only with the explicit disposable database supplied by the test harness.
describe.skipIf(!process.env.TEST_DATABASE_URL)("monthly final failed generation preserves the current draft",()=>{
  const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
  const contract=monthlyFinalContract("B1");
  const input=buildMonthlyFinalGenerationInput(contract,frameworkRef),ai=fakeMonthlyFinalAiOutput(input);
  const good=assembleMonthlyFinalFromAi(contract,frameworkRef,ai.receptive,ai.productive);
  const oldVersion=randomUUID(),definitionId=randomUUID();
  let calls=0,cookie="";
  const runner={runTask:async(taskId:string,raw:any)=>{
    if(taskId==="monthly_final_grammar_evidence_review")return {output:{items:raw.items.map((item:any)=>({key:item.key,matches:true,reason:"Matches selected component."}))},metadata:{}};
    calls++;
    const productive=structuredClone(ai.productive);productive.speakingA.text="The team is ready.";
    return {output:taskId==="monthly_final_listening_message_generation" ? ai.receptive.listening.messages.find(message=>message.label===raw.messageLabel) : taskId.includes("reading") ? {reading:ai.receptive.reading} : productive,metadata:{provider:"test",model:"fixture",traceId:randomUUID(),inputHash:"fixture",taskId,schemaValid:true,attempts:1,latencyMs:1,usage:{}}};
  }} as unknown as AiTaskRunner;
  const app=buildApi({pool,secureCookies:false,aiRunner:runner});
  beforeAll(async()=>{
    const client=await pool.connect();try {
      // Own clean schema: other suites leave credentials and months behind on the shared test database.
      await resetPublicSchema(client);await migrateDatabase(client);await seedDemo(client);
      await client.query("insert into user_credentials(user_id,credential_hash) values($1,$2)",[DEMO_IDS.operator,await createCredentialHash("operator-pass")]);
      await client.query("update organization_settings set configuration=configuration || '{\"simulatedSystemDate\":\"2026-11-06\"}'::jsonb where organization_id=$1",[DEMO_IDS.organization]);
      const monthId=randomUUID();
      await client.query("insert into program_months(id,organization_id,month,exam_date,lesson_count,brief_status) values($1,$2,'2026-11','2026-11-30',21,'approved')",[monthId,DEMO_IDS.organization]);
      await client.query("insert into month_frameworks(id,program_month_id,cefr,status,version,curriculum_contract,scope_hash,created_by) values($1,$2,'B1','approved',$3,$4::jsonb,$5,$6)",[frameworkRef.id,monthId,frameworkRef.version,JSON.stringify(contract),frameworkRef.scopeHash,DEMO_IDS.operator]);
      await client.query("insert into assessment_definitions(id,organization_id,assessment_key,kind,title) values($1,$2,$3,'final',$4)",[definitionId,DEMO_IDS.organization,good.key,good.title]);
      await client.query("insert into assessment_versions(id,definition_id,version,status,blueprint) values($1,$2,1,'draft',$3::jsonb)",[oldVersion,definitionId,JSON.stringify(good)]);
    }finally{client.release();}
    await app.ready();const login=await app.inject({method:"POST",url:"/api/auth/staff/login",payload:{email:"thu.ha.tran@e4s.local",password:"operator-pass"}});expect(login.statusCode,login.body).toBe(200);cookie=String(login.headers["set-cookie"]).split(";")[0]!;
  },30000);
  afterAll(async()=>{await app.close();await pool.end();});
  it("rejects proven content failures without replacing, retiring or editing the existing version",async()=>{
    const response=await app.inject({method:"POST",url:`/api/v1/month-frameworks/${frameworkRef.id}/monthly-final`,headers:{cookie}});
    expect(response.statusCode,response.body).toBe(422);
    expect(response.json()).toMatchObject({code:"MONTHLY_FINAL_GENERATION_QUALITY_FAILED",report:{checks:expect.arrayContaining([expect.objectContaining({code:"GEN11",status:"fail"})])}});
    expect(calls).toBe(4);
    const versions=await pool.query("select id,status,blueprint from assessment_versions where definition_id=$1",[definitionId]);
    expect(versions.rows).toEqual([{id:oldVersion,status:"draft",blueprint:good}]);
    const failed=await pool.query("select status,error_code from ai_runs where request_key like 'monthly-final:%'");
    expect(failed.rows).toEqual([{status:"failed",error_code:"MONTHLY_FINAL_GENERATION_QUALITY_FAILED"}]);
  });
});
