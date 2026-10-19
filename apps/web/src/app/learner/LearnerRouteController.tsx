import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type {
  AssessmentKind,
  AssessmentResponseView,
  AssessmentViolationInput,
  GameFinishInput,
  GameKey,
  LearnerAvatarData,
  LearnerProfileData,
  LearnerProfileView
} from "@e4s/contracts";
import { learnerApiClient as apiClient } from "../../api/learner.js";
import { useExperience } from "../../features/experience/Experience.js";
// This controller is lazy-loaded directly by the role router. Keep the
// Learner-only visual layer in the same chunk so its lesson/profile spacing
// rules are present when the first Learner screen mounts.
import "./learner.css";
import type { LearnerCallbacks } from "./contracts.js";
import type { LearnerContractBundle, LearnerUiState } from "./Router.js";
import { LearnerController } from "./Router.js";
import { Empty, Notice, PageTitle, AppLink } from "./ui.js";

type StaticRouteName = "home" | "onboard" | "coach" | "challenge" | "practice" | "survey" | "profile" | "games" | "arena";
export type ResolvedLearnerRoute =
  | { name: StaticRouteName; params: Record<string, never> }
  | { name: "assessment"; params: { kind: AssessmentKind | "levelup" } }
  | { name: "lesson" | "micro" | "duel"; params: { id: string } }
  | { name: "reward"; params: { mode: "preview" | "done" } }
  | { name: "game"; params: { game: GameKey } }
  | { name: "notFound"; params: Record<string, never> };

const gameKeys: readonly GameKey[] = ["scramble", "crossword", "eggs", "mario", "sort", "typing"];

type LearnerLoadFailureProps = {
  route: ResolvedLearnerRoute["name"];
  message: string;
  onRetry: () => void;
  navigate: (path: string) => void;
};

export function LearnerLoadFailure({ route, message, onRetry, navigate }: LearnerLoadFailureProps) {
  const recovery = loadRecovery(route);
  return <div className="app-learner-page">
    <PageTitle title="Chưa thể mở trang" />
    <Empty description={<Notice tone="danger">{message}</Notice>} action={<div className="row" style={{ flexWrap: "wrap" }}>
      <button className="btn" type="button" onClick={onRetry}>Thử lại</button>
      <AppLink className="btn btn-primary" href={recovery.href} navigate={navigate}>{recovery.label}</AppLink>
    </div>} />
  </div>;
}

/**
 * These are route guards in the canonical app, not API failures:
 * an approved placement and an unavailable level-up challenge both return the
 * learner to Home instead of leaving them on a dead-end route.
 */
export function shouldRedirectApprovedPlacement(kind: AssessmentKind | "levelup", status?: string | null) {
  return kind === "placement" && status === "approved";
}

export function shouldRedirectUnavailableChallenge(route: ResolvedLearnerRoute["name"], reason: unknown) {
  return route === "challenge" && reason instanceof Error && reason.message === "LEVEL_CHALLENGE_NOT_AVAILABLE";
}

function showLearnerToast(message: string) {
  if (typeof document === "undefined") return;
  const host = document.getElementById("toast");
  if (!host) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  host.replaceChildren(toast);
  window.setTimeout(() => {
    if (toast.parentElement === host) toast.remove();
  }, 3500);
}

export function resolveLearnerRoute(pathname: string): ResolvedLearnerRoute {
  const clean = (pathname.startsWith("#") ? pathname.slice(1) : pathname).split(/[?#]/, 1)[0] || "/";
  const segments = clean.split("/").filter(Boolean).map(safeDecode);
  if (segments.length === 1 && ["home", "onboard", "coach", "challenge", "practice", "survey", "profile", "games", "arena"].includes(segments[0]!)) return { name: segments[0] as StaticRouteName, params: {} };
  if (segments[0] === "test" && segments.length === 2) {
    const raw = segments[1];
    if (raw === "placement" || raw === "final") return { name: "assessment", params: { kind: raw } };
    if (raw === "levelup" || raw === "level-up") return { name: "assessment", params: { kind: "levelup" } };
  }
  if (segments[0] === "lesson" && segments.length === 2 && segments[1]) return { name: "lesson", params: { id: segments[1] } };
  if (segments[0] === "micro" && segments.length === 2 && segments[1]) return { name: "micro", params: { id: segments[1] } };
  if (segments[0] === "reward" && segments.length === 2 && (segments[1] === "preview" || segments[1] === "done")) return { name: "reward", params: { mode: segments[1] } };
  if (segments[0] === "games" && segments.length === 2 && gameKeys.includes(segments[1] as GameKey)) return { name: "game", params: { game: segments[1] as GameKey } };
  if (segments[0] === "duel" && segments.length === 2 && segments[1]) return { name: "duel", params: { id: segments[1] } };
  return { name: "notFound", params: {} };
}

function safeDecode(value: string) { try { return decodeURIComponent(value); } catch { return value; } }

const rewardPrintStyleId = "e4s-reward-print-style";

/**
 * The app reward screen uses the browser print dialog, but the page's
 * certificate needs a landscape A4 print context. Keep the rule scoped to the
 * action so it cannot change the print layout of unrelated learner screens.
 */
export function printLearnerReward() {
  if (typeof document === "undefined") return;
  document.getElementById(rewardPrintStyleId)?.remove();
  const style = document.createElement("style");
  style.id = rewardPrintStyleId;
  style.textContent = "@media print { @page { size: A4 landscape; margin: 10mm; } .reward-page .cert-doc { break-inside: avoid; } }";
  document.head.appendChild(style);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    style.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  try {
    window.print();
  } catch (reason) {
    cleanup();
    throw reason;
  }
}

/**
 * Full learner route integration. Mount once under the learner wildcard route;
 * it reads React Router location, fetches server contracts, and owns mutation refreshes.
 */
export function LearnerRouteController() {
  const location = useLocation();
  const navigate = useNavigate();
  const experience = useExperience();
  const route = useMemo(() => resolveLearnerRoute(location.pathname), [location.pathname]);
  const [contracts, setContracts] = useState<LearnerContractBundle>({});
  const [profileRecord, setProfileRecord] = useState<LearnerProfileView>();
  const [uiState, setUiState] = useState<LearnerUiState>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const coachPending = useRef<{ message: string; requestId: string } | undefined>(undefined);
  const challengePending = useRef<{ message: string; requestId: string } | undefined>(undefined);
  const practicePending = useRef<{ text: string; requestId: string } | undefined>(undefined);
  const gameSetPending = useRef<{ topic: string; requestId: string } | undefined>(undefined);
  const gamePending = useRef<{ input: GameFinishInput; requestId: string } | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setLoading(true); setError(""); setContracts({}); setUiState({});
    const accept = (bundle: LearnerContractBundle, profile?: LearnerProfileView, nextUiState?: LearnerUiState) => {
      if (!live) return;
      setContracts(bundle);
      if (profile) setProfileRecord(profile);
      if (nextUiState) setUiState(nextUiState);
      setLoading(false);
    };
    const reject = (reason: unknown) => {
      if (!live) return;
      // The canonical app sends learners back to Home when the
      // completion certificate is not unlocked yet. The API expresses that
      // normal gated state as REWARD_NOT_READY (403), so it must not become a
      // generic fatal error screen.
      if (route.name === "reward" && route.params.mode === "done" && reason instanceof Error && reason.message === "REWARD_NOT_READY") {
        navigate("/home", { replace: true });
        return;
      }
      if (shouldRedirectUnavailableChallenge(route.name, reason)) {
        showLearnerToast("Không có thử thách nào đang mở");
        navigate("/home", { replace: true });
        return;
      }
      setError(loadError(route.name)); setLoading(false);
    };
    const load = async () => {
      switch (route.name) {
        case "home": {
          const home = await apiClient.getHome();
          if (!home.onboardingRequired && home.learner.cefr === null) {
            try {
              const placement = await apiClient.getAssessment("placement");
              const status = placement.attempt?.status;
              accept({ home }, undefined, {
                home: {
                  placementDraft: status === "in_progress",
                  approvalPending: status === "submitted" || status === "pending_review" || status === "approved"
                }
              });
            } catch {
              // Keep the real Home contract usable while a placement definition
              // is being published; Home still exposes the stage-2 entry state.
              accept({ home });
            }
          } else {
            accept({ home });
          }
          break;
        }
        case "onboard": { const profile = await apiClient.getProfile(); accept({ onboard: profile }, profile, { onboard: { mode: profile.completed ? "edit" : "new" } }); break; }
        case "assessment": {
          const assessment = await apiClient.getAssessment(route.params.kind);
          if (shouldRedirectApprovedPlacement(route.params.kind, assessment.attempt?.status)) {
            navigate("/home", { replace: true });
            return;
          }
          accept({ assessment });
          break;
        }
        case "lesson": accept({ lesson: await apiClient.getLesson(route.params.id) }); break;
        case "micro": accept({ micro: await apiClient.getMicroLesson(route.params.id) }); break;
        case "coach": accept({ coach: await apiClient.getCoach() }); break;
        case "challenge": accept({ challenge: await apiClient.getLevelChallenge() }); break;
        case "practice": accept({ practice: await apiClient.getWeeklyPractice() }); break;
        case "survey": accept({ survey: await apiClient.getSurvey() }); break;
        case "profile": { const [progress, profile] = await Promise.all([apiClient.getProgress(), apiClient.getProfile()]); accept({ profile: progress }, profile, { profile: { profileMissing: !profile.completed } }); break; }
        case "reward": accept({ reward: await apiClient.getReward(route.params.mode) }); break;
        case "games":
        case "game": accept({ games: await apiClient.getGames() }); break;
        case "arena": accept({ arena: await apiClient.getArena() }); break;
        case "duel": { const [duel, games] = await Promise.all([apiClient.getDuel(route.params.id), apiClient.getGames()]); accept({ duel, games }); break; }
        case "notFound": setLoading(false); break;
      }
    };
    void load().catch(reject);
    return () => { live = false; };
  }, [route]);

  const saveProfileRecord = async (profile: LearnerProfileData, leave: boolean) => {
    if (!profileRecord) throw new Error("PROFILE_NOT_LOADED");
    setUiState((current) => ({ ...current, onboard: { ...current.onboard, saving: true } }));
    try {
      const saved = await apiClient.saveProfile(profile, profileRecord.version);
      setProfileRecord(saved);
      setContracts((current) => ({
        ...current,
        ...(route.name === "onboard" ? { onboard: saved } : {}),
        ...(current.profile ? { profile: { ...current.profile, learner: { ...current.profile.learner, profile: saved.profile } } } : {})
      }));
      if (leave) navigate(route.name === "onboard" && profileRecord.completed ? "/profile" : "/home");
    } catch (reason) {
      setUiState((current) => ({ ...current, onboard: { ...current.onboard, error: "Không lưu được hồ sơ. Dữ liệu trên màn hình vẫn được giữ để bạn thử lại." } }));
      throw reason;
    } finally {
      setUiState((current) => ({ ...current, onboard: { ...current.onboard, saving: false } }));
    }
  };

  const callbacks: LearnerCallbacks = {
    navigate: (path) => navigate(path),
    saveProfileDraft: (profile) => saveProfileRecord(profile, false),
    saveProfile: (profile) => saveProfileRecord(profile, true),
    startAssessment: async () => { if (route.name === "assessment") setContracts({ assessment: await apiClient.startAssessment(route.params.kind) }); },
    saveAssessmentResponse: async (section, taskKey, input) => {
      const attempt = contracts.assessment?.attempt;
      if (!attempt) throw new Error("ASSESSMENT_ATTEMPT_NOT_ACTIVE");
      const response = await apiClient.saveAssessmentResponse(attempt.id, section, taskKey, input);
      setContracts((current) => current.assessment?.attempt ? { assessment: { ...current.assessment, attempt: { ...current.assessment.attempt, responses: mergeResponse(current.assessment.attempt.responses, response) } } } : current);
    },
    completeAssessmentSection: async (section) => {
      const attempt = contracts.assessment?.attempt;
      if (!attempt) throw new Error("ASSESSMENT_ATTEMPT_NOT_ACTIVE");
      setContracts({ assessment: await apiClient.completeAssessmentSection(attempt.id, section) });
    },
    submitAssessment: async () => {
      const attempt = contracts.assessment?.attempt;
      if (!attempt) throw new Error("ASSESSMENT_ATTEMPT_NOT_ACTIVE");
      setContracts({ assessment: await apiClient.submitAssessment(attempt.id) });
    },
    recordAssessmentViolation: async (attemptId: string, input: AssessmentViolationInput) => {
      const runtime = await apiClient.recordAssessmentViolation(attemptId, input);
      // Keep the active app screen mounted while its five-second auto-submit
      // countdown is visible. The server has already persisted the final status;
      // the normal submit/complete callback refreshes the screen after the modal.
      if (runtime.autoSubmitted || runtime.status !== "in_progress") return runtime;
      setContracts((current) => {
        const assessment = current.assessment;
        if (!assessment?.attempt || assessment.attempt.id !== attemptId) return current;
        const attempt = {
          ...assessment.attempt,
          runtime
        };
        return {
          ...current,
          assessment: {
            ...assessment,
            runtime,
            attempt
          }
        };
      });
      return runtime;
    },
    uploadAssessmentAudio: async (file, filename) => (await apiClient.uploadAssessmentAudio(file, filename)).artifactKey,
    getAssessmentAudioReadUrl: (artifactKey) => apiClient.getAssessmentAudioReadUrl(artifactKey),
    recordAssessmentAudioPlay: async (section, groupKey) => {
      const attempt = contracts.assessment?.attempt;
      if (!attempt) throw new Error("ASSESSMENT_ATTEMPT_NOT_ACTIVE");
      const recorded = await apiClient.recordAssessmentAudioPlay(attempt.id, section, groupKey);
      setContracts((current) => current.assessment?.attempt ? { assessment: { ...current.assessment, attempt: { ...current.assessment.attempt, audioPlayCounts: { ...current.assessment.attempt.audioPlayCounts, [`${section}:${groupKey}`]: recorded.playCount } } } } : current);
      return recorded;
    },
    createAssessmentAppeal: async (reason) => {
      const attempt = contracts.assessment?.attempt;
      if (!attempt) throw new Error("ASSESSMENT_ATTEMPT_NOT_ACTIVE");
      const appeal = await apiClient.createAssessmentAppeal(attempt.id, reason);
      setContracts((current) => current.assessment ? { assessment: { ...current.assessment, appeal } } : current);
    },
    saveLessonProgress: async (progress) => {
      if (route.name !== "lesson") throw new Error("LESSON_ROUTE_NOT_ACTIVE");
      const saved = await apiClient.saveLessonProgress(route.params.id, progress);
      setContracts((current) => current.lesson ? { lesson: { ...current.lesson, progress: saved } } : current);
    },
    submitLessonPartAttempt: async (partCode, evidence) => {
      if (route.name !== "lesson") throw new Error("LESSON_ROUTE_NOT_ACTIVE");
      const result = await apiClient.submitLessonPartAttempt(route.params.id, partCode, crypto.randomUUID(), evidence);
      setContracts((current) => current.lesson ? { lesson: { ...current.lesson, progress: result.progress } } : current);
      return result;
    },
    appealLessonPart: async (partCode, reason) => {
      if (route.name !== "lesson") throw new Error("LESSON_ROUTE_NOT_ACTIVE");
      const result = await apiClient.appealLessonPart(route.params.id, partCode, reason);
      setContracts((current) => current.lesson ? { lesson: { ...current.lesson, progress: result.progress } } : current);
      return result;
    },
    submitMicroAnswer: async (answer) => {
      if (route.name !== "micro") throw new Error("MICRO_ROUTE_NOT_ACTIVE");
      setContracts({ micro: await apiClient.submitMicroAttempt(route.params.id, answer) });
    },
    completeMicroLesson: async () => {
      if (route.name !== "micro") throw new Error("MICRO_ROUTE_NOT_ACTIVE");
      setContracts({ micro: await apiClient.completeMicroLesson(route.params.id) });
    },
    regenerateMicroLesson: async () => {
      try {
        const lesson = await apiClient.generateMicroLesson(crypto.randomUUID(), true);
        navigate(`/micro/${lesson.id}`);
      } catch (reason) {
        setUiState((current) => ({
          ...current,
          micro: {
            ...current.micro,
            regenerateError: reason instanceof Error && reason.message === "AI_UNAVAILABLE"
              ? "Season chưa kết nối AI nên chưa thể tạo bài khác."
              : "Chưa tạo được bài mới. Bạn có thể thử lại sau."
          }
        }));
      }
    },
    acknowledgeRewardAnnouncement: async (announcementId) => {
      if (route.name !== "home") throw new Error("HOME_ROUTE_NOT_ACTIVE");
      await apiClient.acknowledgeRewardAnnouncement(announcementId);
      setContracts((current) => {
        const announcement = current.home?.rewardAnnouncement;
        if (!current.home || !announcement || announcement.announcementId !== announcementId) return current;
        const { announcementId: _ignoredId, source: _ignoredSource, rule: _ignoredRule, ...base } = announcement;
        return { ...current, home: { ...current.home, rewardAnnouncement: { ...base, kind: "normal" } } };
      });
    },
    sendCoachMessage: async (message) => {
      const pending = coachPending.current?.message === message ? coachPending.current : { message, requestId: crypto.randomUUID() };
      coachPending.current = pending;
      setUiState((current) => {
        const { error: _error, ...coach } = current.coach ?? {};
        return { ...current, coach: { ...coach, thinking: true } };
      });
      try { const coach = await apiClient.sendCoachMessage(pending); setContracts({ coach }); }
      catch { setUiState((current) => ({ ...current, coach: { ...current.coach, thinking: false, error: "Season chưa trả lời được lúc này. Hãy thử lại sau." } })); }
      finally { coachPending.current = undefined; setUiState((current) => ({ ...current, coach: { ...current.coach, thinking: false } })); }
    },
    changeCoachPersona: async (persona) => setContracts({ coach: await apiClient.setCoachPersona(persona) }),
    startNewCoachChat: async () => { coachPending.current = undefined; setContracts({ coach: await apiClient.clearCoach() }); },
    unlockCoachVocabulary: async (word) => setContracts({ coach: await apiClient.unlockCoachVocabulary(word) }),
    sendChallengeMessage: async (message) => {
      const pending = challengePending.current?.message === message ? challengePending.current : { message, requestId: crypto.randomUUID() };
      challengePending.current = pending; const challenge = await apiClient.sendLevelChallengeMessage(pending); challengePending.current = undefined; setContracts({ challenge });
    },
    submitWeeklyPractice: async (text) => {
      const pending = practicePending.current?.text === text ? practicePending.current : { text, requestId: crypto.randomUUID() };
      practicePending.current = pending; const practice = await apiClient.submitWeeklyPractice(pending); practicePending.current = undefined; setContracts({ practice });
    },
    appealWeeklyPractice: async (submissionId, reason) => setContracts({ practice: await apiClient.appealWeeklyPractice(submissionId, reason) }),
    submitSurvey: async (answers) => setContracts({ survey: await apiClient.submitSurvey(answers) }),
    saveAvatar: async (avatar: LearnerAvatarData) => {
      if (!profileRecord || !contracts.profile) throw new Error("PROFILE_NOT_LOADED");
      const saved = await apiClient.saveProfile({ ...profileRecord.profile, avatar }, profileRecord.version);
      setProfileRecord(saved); setContracts({ profile: { ...contracts.profile, learner: { ...contracts.profile.learner, profile: saved.profile } } });
    },
    printReward: printLearnerReward,
    speak: experience.speak,
    generateGameSet: async (topic) => {
      const pending = gameSetPending.current?.topic === topic ? gameSetPending.current : { topic, requestId: crypto.randomUUID() };
      gameSetPending.current = pending; const games = await apiClient.generateGameWordSet(pending); gameSetPending.current = undefined; setContracts({ games });
    },
    useWeeklyGameSet: async () => setContracts({ games: await apiClient.useWeeklyGameWordSet() }),
    deleteGameSet: async () => setContracts({ games: await apiClient.deleteGameWordSet() }),
    finishGame: async (input) => {
      if (route.name === "duel") {
        const duel = await apiClient.submitDuelResult(route.params.id, { requestId: crypto.randomUUID(), answers: input.answers });
        setContracts((current) => ({ ...current, duel }));
        return;
      }
      if (route.name !== "game") throw new Error("GAME_ROUTE_NOT_ACTIVE");
      const pending = gamePending.current?.input === input ? gamePending.current : { input, requestId: crypto.randomUUID() };
      gamePending.current = pending;
      const result = await apiClient.submitGameResult(route.params.game, { requestId: pending.requestId, answers: input.answers, ...(input.hintsUsed === undefined ? {} : { hintsUsed: input.hintsUsed }), ...(input.events?.length ? { events: input.events } : {}) });
      gamePending.current = undefined; setUiState((current) => ({ ...current, gameResult: result }));
    },
    resetGameResult: () => { gamePending.current = undefined; setUiState((current) => ({ ...current, gameResult: null })); },
    resolveGameWordImage: async (setId, wordId) => {
      const image = await apiClient.resolveGameWordImage(setId, wordId);
      return image.status === "available" ? image.imageUrl : null;
    },
    createDuel: async (opponentId, game) => navigate(`/duel/${(await apiClient.createDuel({ opponentId, game })).id}`)
  };

  if (loading) return <div className="app-learner-page"><section className="card" aria-live="polite">{loadingLabel(route.name)}…</section></div>;
  if (error) return <LearnerLoadFailure route={route.name} message={error} onRetry={() => navigate(0)} navigate={navigate} />;
  if (route.name === "notFound") return <div className="app-learner-page"><PageTitle title="Không tìm thấy trang." /><button type="button" onClick={() => navigate("/home")}>Về trang chủ</button></div>;
  return <LearnerController path={location.pathname} contracts={contracts} callbacks={callbacks} uiState={uiState} />;
}

function mergeResponse(responses: AssessmentResponseView[], response: AssessmentResponseView) {
  return [...responses.filter((item) => item.section !== response.section || item.taskKey !== response.taskKey), response];
}

function loadingLabel(route: ResolvedLearnerRoute["name"]) {
  const labels: Record<ResolvedLearnerRoute["name"], string> = {
    home: "Đang tải trang chủ", onboard: "Đang tải hồ sơ", assessment: "Đang tải bài test", lesson: "Đang tải bài học",
    micro: "Đang tải bài siêu ngắn", coach: "Đang mở cuộc trò chuyện", challenge: "Đang mở thử thách lên mức",
    practice: "Đang mở bài thực hành", survey: "Đang mở khảo sát", profile: "Đang tải tiến độ", reward: "Đang tạo chứng nhận",
    games: "Đang mở mini game", game: "Đang mở trò chơi", arena: "Đang mở đấu trường", duel: "Đang mở trận đấu", notFound: "Đang mở trang"
  };
  return labels[route];
}

function loadError(route: ResolvedLearnerRoute["name"]) {
  const labels: Record<ResolvedLearnerRoute["name"], string> = {
    home: "Không tải được trang chủ.", onboard: "Không tải được hồ sơ.", assessment: "Không tải được bài test.", lesson: "Không tải được bài học.",
    micro: "Không tải được bài siêu ngắn.", coach: "Không tải được cuộc trò chuyện với Season.", challenge: "Chưa có thử thách lên mức đang mở.",
    practice: "Không tải được bài thực hành tuần.", survey: "Không tải được khảo sát.", profile: "Không tải được tiến độ.", reward: "Chứng nhận chưa sẵn sàng.",
    games: "Chưa có bộ từ cho mini game.", game: "Chưa có bộ từ cho mini game.", arena: "Không tải được đấu trường.", duel: "Không tải được trận đấu.", notFound: "Không tìm thấy trang."
  };
  return labels[route];
}

function loadRecovery(route: ResolvedLearnerRoute["name"]) {
  if (route === "game" || route === "games") return { href: "/games", label: "Về Mini game" };
  if (route === "arena" || route === "duel") return { href: "/arena", label: "Về đấu trường" };
  return { href: "/home", label: "Về trang chủ" };
}
