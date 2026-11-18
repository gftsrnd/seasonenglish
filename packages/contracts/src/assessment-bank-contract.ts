import type { AssessmentDefinitionView, AssessmentSectionView } from "./assessment-contract.js";
import type { CefrLevel } from "./domain-contract.js";

export type AssessmentBankScope = "placement" | "retake" | "pass_course" | Exclude<CefrLevel, "A1">;
export interface AssessmentBankPolicy {
  mode: "single" | "mixed";
  sourceCount: number;
  versionIds: string[];
}
export interface AssessmentBankFormSummary {
  versionId: string;
  title: string;
  version: number;
  status: "draft" | "published" | "archived";
  legacy: boolean;
  audioConfigured?: boolean;
  sectionCount?: number;
  totalMinutes?: number;
  totalScore?: number;
  used?: boolean;
  canDelete?: boolean;
  deleteReason?: string | null;
}
export interface AssessmentBankView {
  scope: AssessmentBankScope;
  desiredCount: number;
  forms: AssessmentBankFormSummary[];
  policy: AssessmentBankPolicy;
}
/** Authoring-only payload; never expose answer keys to the learner client. */
export interface AssessmentBankBlueprint extends Omit<AssessmentDefinitionView, "sections"> {
  targetLevel?: CefrLevel;
  sections: Array<Omit<AssessmentSectionView, "groups"> & {
    groups: Array<Omit<AssessmentSectionView["groups"][number], "tasks"> & {
      tasks: Array<AssessmentSectionView["groups"][number]["tasks"][number] & { correctAnswer?: string }>;
    }>;
  }>;
}
export interface AssessmentBankFormDetail extends AssessmentBankFormSummary {
  blueprint: AssessmentBankBlueprint;
  issues?: string[];
}
