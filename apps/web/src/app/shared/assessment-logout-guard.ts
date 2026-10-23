export type AssessmentLogoutResult = "logout" | "auto_submitted";
export type AssessmentLogoutGuard = () => Promise<AssessmentLogoutResult>;

let activeGuard: AssessmentLogoutGuard | null = null;

export function registerAssessmentLogoutGuard(guard: AssessmentLogoutGuard): () => void {
  activeGuard = guard;
  return () => { if (activeGuard === guard) activeGuard = null; };
}

export function hasAssessmentLogoutGuard(): boolean {
  return activeGuard !== null;
}

export async function requestAssessmentLogout(): Promise<AssessmentLogoutResult | null> {
  return activeGuard ? activeGuard() : null;
}
