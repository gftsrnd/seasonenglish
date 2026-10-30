export const ACCOUNT_ROLES = ["learner", "operator", "manager"] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const ASSESSMENT_KINDS = ["placement", "level-up", "monthly_exam", "course_pass"] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

declare const entityIdBrand: unique symbol;
export type EntityId<Entity extends string> = string & { readonly [entityIdBrand]: Entity };
