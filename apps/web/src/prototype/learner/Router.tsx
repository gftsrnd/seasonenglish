import type { ArenaView, AssessmentView, CoachView, DuelView, GameHubView, LearnerHomeView, LearnerProfileView, LearnerProgressView, LessonLockView, LessonView, LevelChallengeView, MicroLessonView, RewardView, SurveyView, WeeklyPracticeView } from "@e4s/contracts";
import type { LearnerPrototypeCallbacks, LearnerPrototypeScreen } from "./contracts.js";
import { PrototypeAssessment } from "./Assessment.js";
import { PrototypeChallenge, PrototypeCoach, PrototypePractice } from "./CoachPractice.js";
import { PrototypeArena, PrototypeDuel, PrototypeGame, PrototypeGames } from "./Games.js";
import { PrototypeHome } from "./Home.js";
import { PrototypeLesson, PrototypeMicro } from "./Learning.js";
import { PrototypeOnboard } from "./Onboard.js";
import { PrototypeProfile, PrototypeReward, PrototypeSurvey } from "./ProfileReward.js";
import { Empty, Notice, PageTitle, PrototypeLink } from "./ui.js";

export function LearnerPrototypeRouter({ screen, callbacks }: { screen: LearnerPrototypeScreen; callbacks: LearnerPrototypeCallbacks }) {
  switch (screen.kind) {
    case "home": return <PrototypeHome view={screen.view} actions={callbacks} />;
    case "onboard": return <PrototypeOnboard view={screen.view} actions={callbacks} />;
    case "assessment": return <PrototypeAssessment view={screen.view} actions={callbacks} />;
    case "lesson": return <PrototypeLesson view={screen.view} actions={callbacks} />;
    case "micro": return <PrototypeMicro view={screen.view} actions={callbacks} />;
    case "coach": return <PrototypeCoach view={screen.view} actions={callbacks} />;
    case "challenge": return <PrototypeChallenge view={screen.view} actions={callbacks} />;
    case "practice": return <PrototypePractice view={screen.view} actions={callbacks} />;
    case "survey": return <PrototypeSurvey view={screen.view} actions={callbacks} />;
    case "profile": return <PrototypeProfile view={screen.view} actions={callbacks} />;
    case "reward": return <PrototypeReward view={screen.view} actions={callbacks} />;
    case "games": return <PrototypeGames view={screen.view} actions={callbacks} />;
    case "game": return <PrototypeGame descriptor={screen.descriptor} wordSet={screen.wordSet} result={screen.result} actions={callbacks} />;
    case "arena": return <PrototypeArena view={screen.view} actions={callbacks} />;
    case "duel": return <PrototypeDuel view={screen.view} descriptor={screen.descriptor} actions={callbacks} />;
  }
}

export interface LearnerContractBundle { home?: LearnerHomeView; onboard?: LearnerProfileView | null; assessment?: AssessmentView; lesson?: LessonView; micro?: MicroLessonView; coach?: CoachView; challenge?: LevelChallengeView; practice?: WeeklyPracticeView; survey?: SurveyView; profile?: LearnerProgressView; reward?: RewardView; games?: GameHubView; arena?: ArenaView; duel?: DuelView; }
export interface LearnerPrototypeUiState { aiAvailable?: boolean; onboard?: { mode?: "new" | "edit"; draftAvailable?: boolean; saving?: boolean; error?: string }; home?: { weekPhase?: "before_pilot" | "in_pilot" | "after_pilot"; approvalPending?: boolean; placementDraft?: boolean; reward?: { points: number; nextPoints: number | null; seasonName: string } }; assessment?: { timed?: boolean; warningLimit?: number; targetLevel?: string | null; microphoneSupported?: boolean; submitError?: string }; lessonLock?: LessonLockView | null; micro?: { regenerateAvailable?: boolean; regenerateError?: string }; coach?: { levelApproved?: boolean; thinking?: boolean; error?: string }; challenge?: { resume?: boolean; error?: string }; practice?: { appeal?: { status: "pending" | "accepted" | "rejected"; resolution?: string } | null }; profile?: { profileMissing?: boolean; surveyAvailable?: boolean }; gameResult?: { score: number; maxScore: number } | null; }
export interface LearnerPrototypeControllerProps { path: string; contracts: LearnerContractBundle; callbacks: LearnerPrototypeCallbacks; uiState?: LearnerPrototypeUiState; }

export function LearnerPrototypeController({ path, contracts, callbacks, uiState = {} }: LearnerPrototypeControllerProps) {
  const cleanPath = normalizeLearnerPrototypePath(path);
  const parts = cleanPath === "/" ? [] : cleanPath.slice(1).split("/").map(decodeSegment);
  const missing = (message: string, href = "/home", label = "Về trang chủ") => <Missing route={cleanPath} message={message} href={href} label={label} actions={callbacks} />;
  if (cleanPath === "/" || (parts[0] === "home" && parts.length === 1)) return contracts.home ? <PrototypeHome view={{ ...contracts.home, ...(uiState.home ?? {}), ...(uiState.aiAvailable === undefined ? {} : { aiAvailable: uiState.aiAvailable }) }} actions={callbacks} /> : missing("Trang chủ chưa có dữ liệu.");
  if (parts[0] === "onboard" && parts.length === 1) {
    if (contracts.onboard === undefined) return missing("Hồ sơ chưa sẵn sàng.");
    const state = uiState.onboard ?? {};
    return <PrototypeOnboard view={{ profile: contracts.onboard?.profile ?? {}, mode: state.mode ?? (contracts.onboard ? "edit" : "new"), ...(state.draftAvailable === undefined ? {} : { draftAvailable: state.draftAvailable }), ...(state.saving === undefined ? {} : { saving: state.saving }), ...(state.error === undefined ? {} : { error: state.error }) }} actions={callbacks} />;
  }
  if (parts[0] === "test" && parts.length === 2 && ["placement", "final", "levelup", "level-up"].includes(parts[1]!)) return contracts.assessment ? <PrototypeAssessment view={{ ...contracts.assessment, ...(uiState.assessment ?? {}) }} actions={callbacks} /> : missing("Bài test chưa sẵn sàng.");
  if (parts[0] === "lesson" && parts.length === 2 && parts[1]) return contracts.lesson ? <PrototypeLesson view={{ lesson: contracts.lesson, lock: contracts.lesson.lock ?? uiState.lessonLock ?? null }} actions={callbacks} /> : missing("Bài học không tồn tại hoặc chưa mở.");
  if (parts[0] === "micro" && parts.length === 2 && parts[1]) return contracts.micro ? <PrototypeMicro view={{ ...contracts.micro, ...(uiState.micro ?? {}) }} actions={callbacks} /> : missing("Bài siêu ngắn chưa sẵn sàng.");
  if (parts[0] === "coach" && parts.length === 1) return contracts.coach ? <PrototypeCoach view={{ ...contracts.coach, ...(uiState.coach ?? {}) }} actions={callbacks} /> : missing("Cuộc trò chuyện với Season chưa sẵn sàng.");
  if (parts[0] === "challenge" && parts.length === 1) return contracts.challenge ? <PrototypeChallenge view={{ ...contracts.challenge, ...(uiState.challenge ?? {}) }} actions={callbacks} /> : missing("Thử thách lên mức chưa mở.");
  if (parts[0] === "practice" && parts.length === 1) return contracts.practice ? <PrototypePractice view={{ ...contracts.practice, ...(uiState.aiAvailable === undefined ? {} : { aiAvailable: uiState.aiAvailable }) }} actions={callbacks} /> : missing("Bài thực hành tuần chưa sẵn sàng.");
  if (parts[0] === "survey" && parts.length === 1) return contracts.survey ? <PrototypeSurvey view={contracts.survey} actions={callbacks} /> : missing("Khảo sát chưa sẵn sàng.");
  if (parts[0] === "profile" && parts.length === 1) return contracts.profile ? <PrototypeProfile view={{ ...contracts.profile, ...(uiState.profile ?? {}) }} actions={callbacks} /> : missing("Tiến độ chưa sẵn sàng.");
  if (parts[0] === "reward" && parts.length === 2 && (parts[1] === "preview" || parts[1] === "done")) return contracts.reward ? <PrototypeReward view={contracts.reward} actions={callbacks} /> : missing("Chứng nhận chưa sẵn sàng.");
  if (parts[0] === "games" && parts.length === 1) return contracts.games ? <PrototypeGames view={contracts.games} actions={callbacks} /> : missing("Chưa có bộ từ cho mini game.");
  if (parts[0] === "games" && parts.length === 2) {
    if (!contracts.games) return missing("Chưa có bộ từ cho mini game.");
    const descriptor = contracts.games.games.find((item) => item.key === parts[1]);
    return descriptor ? <PrototypeGame descriptor={descriptor} wordSet={contracts.games.wordSet} result={uiState.gameResult} actions={callbacks} /> : missing("Không tìm thấy trò chơi trong dữ liệu máy chủ.", "/games", "Về Mini game");
  }
  if (parts[0] === "arena" && parts.length === 1) return contracts.arena ? <PrototypeArena view={contracts.arena} actions={callbacks} /> : missing("Đấu trường chưa sẵn sàng.", "/games", "Về Mini game");
  if (parts[0] === "duel" && parts.length === 2) {
    if (!contracts.duel || !contracts.games) return missing("Không tìm thấy trận đấu.", "/arena", "Về đấu trường");
    const descriptor = contracts.games.games.find((item) => item.key === contracts.duel?.game);
    return descriptor ? <PrototypeDuel view={contracts.duel} descriptor={descriptor} actions={callbacks} /> : missing("Không tìm thấy luật trò chơi cho ván thách đấu.", "/arena", "Về đấu trường");
  }
  return missing("Không tìm thấy trang.");
}

export function normalizeLearnerPrototypePath(path: string) { const raw = path.startsWith("#") ? path.slice(1) : path; const noQuery = raw.split(/[?#]/, 1)[0] || "/"; const withSlash = noQuery.startsWith("/") ? noQuery : `/${noQuery}`; return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash; }
function decodeSegment(value: string) { try { return decodeURIComponent(value); } catch { return value; } }
function Missing({ route, message, href, label, actions }: { route: string; message: string; href: string; label: string; actions: LearnerPrototypeCallbacks }) { return <div className="prototype-learner-page"><PageTitle {...(route === "/" ? {} : { eyebrow: route })} title={message === "Không tìm thấy trang." ? "Không tìm thấy trang" : "Chưa thể mở trang"} /><Empty description={<Notice tone="warn">{message}</Notice>} action={<PrototypeLink className="btn" href={href} navigate={actions.navigate}>{label}</PrototypeLink>} /></div>; }
