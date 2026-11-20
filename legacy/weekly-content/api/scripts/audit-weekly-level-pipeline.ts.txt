import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  validateWeeklyLessonCrossLevelSet,
  validateWeeklyLessonPipelineState,
  type WeeklyLessonComponentInput,
  type WeeklyLessonPipelineCheckpoint
} from "../src/modules/content/weekly-generation.js";

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key?.startsWith("--") && value) args.set(key.slice(2), value);
}
const outputRoot = resolve(args.get("output-root") ?? ".artifacts/ai-generation-v2");
const reportPath = resolve(outputRoot, "pipeline-audit.json");
const levels = ["A1", "A2", "B1", "B2", "C1"] as const;
const levelReports: Array<{
  level: string;
  valid: boolean;
  days: Array<{ dayNumber: number; valid: boolean; findings: ReturnType<typeof validateWeeklyLessonPipelineState> }>;
}> = [];
const lessonsByLevel: Record<string, unknown[]> = {};

for (const level of levels) {
  const days = [];
  const lessons: unknown[] = [];
  for (let dayNumber = 1; dayNumber <= 5; dayNumber += 1) {
    const stored = JSON.parse(await readFile(resolve(outputRoot, level, `day${dayNumber}`, "09-assemble.json"), "utf8")) as {
      input: WeeklyLessonComponentInput;
      state: WeeklyLessonPipelineCheckpoint["state"];
    };
    const findings = validateWeeklyLessonPipelineState(stored.input, stored.state);
    days.push({ dayNumber, valid: findings.length === 0, findings });
    if (stored.state.lesson) lessons.push(stored.state.lesson);
  }
  lessonsByLevel[level] = lessons;
  levelReports.push({ level, valid: days.every((day) => day.valid) && lessons.length === 5, days });
}

const crossLevel = validateWeeklyLessonCrossLevelSet(lessonsByLevel as never);
const report = {
  auditedAt: new Date().toISOString(),
  valid: levelReports.every((level) => level.valid) && crossLevel.valid,
  levels: levelReports,
  crossLevel
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report)}\n`);
if (!report.valid) process.exitCode = 1;
