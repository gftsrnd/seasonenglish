import type { ArenaView, AssessmentView, CoachView, DuelView, GameHubView, LearnerHomeView, LearnerProfileView, LearnerProgressView, LessonLockView, LessonView, LevelChallengeView, MicroLessonView, RewardView, SurveyView, WeeklyPracticeView } from "@e4s/contracts";
import type { LearnerCallbacks, LearnerScreen } from "./contracts.js";
import { LearnerAssessment } from "./Assessment.js";
import { LearnerChallenge, LearnerCoach, LearnerPractice } from "./CoachPractice.js";
import { LearnerArena, LearnerDuel, LearnerGame, LearnerGames } from "./Games.js";
import { LearnerHome } from "./Home.js";
import { LearnerLesson, LearnerMicro } from "./Learning.js";
import { LearnerOnboard } from "./Onboard.js";
import { LearnerProfile, LearnerReward, LearnerSurvey } from "./ProfileReward.js";
import { Empty, Notice, PageTitle, AppLink } from "./ui.js";

export function LearnerRouter({ screen, callbacks }: { screen: LearnerScreen; callbacks: LearnerCallbacks }) {
  switch (screen.kind) {
    case "home": return <LearnerHome view={screen.view} actions={callbacks} />;
    case "onboard": return <LearnerOnboard view={screen.view} actions={callbacks} />;
    case "assessment": return <LearnerAssessment view={screen.view} actions={callbacks} />;
    case "lesson": return <LearnerLesson view={screen.view} actions={callbacks} />;
    case "micro": return <LearnerMicro view={screen.view} actions={callbacks} />;
    case "coach": return <LearnerCoach view={screen.view} actions={callbacks} />;
    case "challenge": return <LearnerChallenge view={screen.view} actions={callbacks} />;
    case "practice": return <LearnerPractice view={screen.view} actions={callbacks} />;
    case "survey": return <LearnerSurvey view={screen.view} actions={callbacks} />;
    case "profile": return <LearnerProfile view={screen.view} actions={callbacks} />;
    case "reward": return <LearnerReward view={screen.view} actions={callbacks} />;
    case "games": return <LearnerGames view={screen.view} actions={callbacks} />;
    case "game": return <LearnerGame descriptor={screen.descriptor} wordSet={screen.wordSet} result={screen.result} actions={callbacks} />;
    case "arena": return <LearnerArena view={screen.view} actions={callbacks} />;
    case "duel": return <LearnerDuel view={screen.view} descriptor={screen.descriptor} actions={callbacks} />;
  }
}

export interface LearnerContractBundle { home?: LearnerHomeView; onboard?: LearnerProfileView | null; assessment?: AssessmentView; lesson?: LessonView; micro?: MicroLessonView; coach?: CoachView; challenge?: LevelChallengeView; practice?: WeeklyPracticeView; survey?: SurveyView; profile?: LearnerProgressView; reward?: RewardView; games?: GameHubView; arena?: ArenaView; duel?: DuelView; }
export interface LearnerUiState { aiAvailable?: boolean; onboard?: { mode?: "new" | "edit"; draftAvailable?: boolean; saving?: boolean; error?: string }; home?: { weekPhase?: "before_pilot" | "in_pilot" | "after_pilot"; approvalPending?: boolean; placementDraft?: boolean; reward?: { points: number; nextPoints: number | null; seasonName: string } }; assessment?: { timed?: boolean; warningLimit?: number; targetLevel?: string | null; microphoneSupported?: boolean; submitError?: string }; lessonLock?: LessonLockView | null; micro?: { regenerateAvailable?: boolean; regenerateError?: string }; coach?: { levelApproved?: boolean; thinking?: boolean; error?: string }; challenge?: { resume?: boolean; error?: string }; practice?: { appeal?: { status: "pending" | "accepted" | "rejected"; resolution?: string } | null }; profile?: { profileMissing?: boolean; surveyAvailable?: boolean }; gameResult?: { score: number; maxScore: number } | null; }
export interface LearnerControllerProps { path: string; contracts: LearnerContractBundle; callbacks: LearnerCallbacks; uiState?: LearnerUiState; }

export function LearnerController({ path, contracts, callbacks, uiState = {} }: LearnerControllerProps) {
  const cleanPath = normalizeLearnerPath(path);
  const parts = cleanPath === "/" ? [] : cleanPath.slice(1).split("/").map(decodeSegment);
  const missing = (message: string, href = "/home", label = "Về trang chủ") => <Missing route={cleanPath} message={message} href={href} label={label} actions={callbacks} />;
  if (cleanPath === "/" || (parts[0] === "home" && parts.length === 1)) return contracts.home ? <LearnerHome view={{ ...contracts.home, ...(uiState.home ?? {}), ...(uiState.aiAvailable === undefined ? {} : { aiAvailable: uiState.aiAvailable }) }} actions={callbacks} /> : missing("Trang chủ chưa có dữ liệu.");
  if (parts[0] === "onboard" && parts.length === 1) {
    if (contracts.onboard === undefined) return missing("Hồ sơ chưa sẵn sàng.");
    const state = uiState.onboard ?? {};
    return <LearnerOnboard view={{ profile: contracts.onboard?.profile ?? {}, mode: state.mode ?? (contracts.onboard ? "edit" : "new"), ...(state.draftAvailable === undefined ? {} : { draftAvailable: state.draftAvailable }), ...(state.saving === undefined ? {} : { saving: state.saving }), ...(state.error === undefined ? {} : { error: state.error }) }} actions={callbacks} />;
  }
  if (parts[0] === "test" && parts.length === 2 && ["placement", "final", "levelup", "level-up"].includes(parts[1]!)) return contracts.assessment ? <LearnerAssessment view={{ ...contracts.assessment, ...(uiState.assessment ?? {}) }} actions={callbacks} /> : missing("Bài test chưa sẵn sàng.");
  if (parts[0] === "lesson" && parts.length === 2 && parts[1]) return contracts.lesson ? <LearnerLesson view={{ lesson: contracts.lesson, lock: contracts.lesson.lock ?? uiState.lessonLock ?? null }} actions={callbacks} /> : missing("Bài học không tồn tại hoặc chưa mở.");
  if (parts[0] === "micro" && parts.length === 2 && parts[1]) return contracts.micro ? <LearnerMicro view={{ ...contracts.micro, ...(uiState.micro ?? {}) }} actions={callbacks} /> : missing("Bài siêu ngắn chưa sẵn sàng.");
  if (parts[0] === "coach" && parts.length === 1) return contracts.coach ? <LearnerCoach view={{ ...contracts.coach, ...(uiState.coach ?? {}) }} actions={callbacks} /> : missing("Cuộc trò chuyện với Season chưa sẵn sàng.");
  if (parts[0] === "challenge" && parts.length === 1) return contracts.challenge ? <LearnerChallenge view={{ ...contracts.challenge, ...(uiState.challenge ?? {}) }} actions={callbacks} /> : missing("Thử thách lên mức chưa mở.");
  if (parts[0] === "practice" && parts.length === 1) return contracts.practice ? <LearnerPractice view={{ ...contracts.practice, ...(uiState.aiAvailable === undefined ? {} : { aiAvailable: uiState.aiAvailable }) }} actions={callbacks} /> : missing("Bài thực hành tuần chưa sẵn sàng.");
  if (parts[0] === "survey" && parts.length === 1) return contracts.survey ? <LearnerSurvey view={contracts.survey} actions={callbacks} /> : missing("Khảo sát chưa sẵn sàng.");
  if (parts[0] === "profile" && parts.length === 1) return contracts.profile ? <LearnerProfile view={{ ...contracts.profile, ...(uiState.profile ?? {}) }} actions={callbacks} /> : missing("Tiến độ chưa sẵn sàng.");
  if (parts[0] === "reward" && parts.length === 2 && (parts[1] === "preview" || parts[1] === "done")) return contracts.reward ? <LearnerReward view={contracts.reward} actions={callbacks} /> : missing("Chứng nhận chưa sẵn sàng.");
  if (parts[0] === "games" && parts.length === 1) return contracts.games ? <LearnerGames view={contracts.games} actions={callbacks} /> : missing("Chưa có bộ từ cho mini game.");
  if (parts[0] === "games" && parts.length === 2) {
    if (!contracts.games) return missing("Chưa có bộ từ cho mini game.");
    const descriptor = contracts.games.games.find((item) => item.key === parts[1]);
    return descriptor ? <LearnerGame descriptor={descriptor} wordSet={contracts.games.wordSet} result={uiState.gameResult} actions={callbacks} /> : missing("Không tìm thấy trò chơi trong dữ liệu máy chủ.", "/games", "Về Mini game");
  }
  if (parts[0] === "arena" && parts.length === 1) return contracts.arena ? <LearnerArena view={contracts.arena} actions={callbacks} /> : missing("Đấu trường chưa sẵn sàng.", "/games", "Về Mini game");
  if (parts[0] === "duel" && parts.length === 2) {
    if (!contracts.duel || !contracts.games) return missing("Không tìm thấy trận đấu.", "/arena", "Về đấu trường");
    const descriptor = contracts.games.games.find((item) => item.key === contracts.duel?.game);
    return descriptor ? <LearnerDuel view={contracts.duel} descriptor={descriptor} actions={callbacks} /> : missing("Không tìm thấy luật trò chơi cho ván thách đấu.", "/arena", "Về đấu trường");
  }
  return missing("Không tìm thấy trang.");
}

export function normalizeLearnerPath(path: string) { const raw = path.startsWith("#") ? path.slice(1) : path; const noQuery = raw.split(/[?#]/, 1)[0] || "/"; const withSlash = noQuery.startsWith("/") ? noQuery : `/${noQuery}`; return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash; }
function decodeSegment(value: string) { try { return decodeURIComponent(value); } catch { return value; } }
function Missing({ route, message, href, label, actions }: { route: string; message: string; href: string; label: string; actions: LearnerCallbacks }) { return <div className="app-learner-page"><PageTitle {...(route === "/" ? {} : { eyebrow: route })} title={message === "Không tìm thấy trang." ? "Không tìm thấy trang" : "Chưa thể mở trang"} /><Empty description={<Notice tone="warn">{message}</Notice>} action={<AppLink className="btn" href={href} navigate={actions.navigate}>{label}</AppLink>} /></div>; }
