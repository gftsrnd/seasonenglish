/* =====================================================================================
   Season English – LOGIC V2 (headless)                                 useAppLogicV2.ts
   -------------------------------------------------------------------------------------
   Toàn bộ business logic, state management, AI calls và app flow của app hiện tại
   (index.html + core.js) được trích sang file này, KHÔNG phụ thuộc DOM/HTML/CSS của
   bản cũ. UI V2 chỉ cần gọi `createAppLogicV2()` (framework-agnostic) hoặc hook
   `useAppLogicV2()` (React) để nhận `state` + `actions`.

   Nguyên tắc chuyển đổi:
   - Mọi `actions['x']` đọc DOM trong core.js → hàm nhận tham số tường minh.
   - Mọi `openModal/confirmDlg/promptDlg` → UI V2 tự hiển thị; logic trả về kết quả
     hoặc nhận cờ `confirmed` / `reason` qua tham số.
   - `toast()` → sự kiện `notify` (`logic.on('notify', fn)`), UI tự render.
   - `render()` → `subscribe()` nhận thông báo state đổi (UI tự re-render).
   - localStorage key, sandbox (`?sandbox=1`), audio prefs… giữ nguyên để
     DỮ LIỆU CŨ DÙNG ĐƯỢC NGAY với UI V2 (cùng schema `aec:v1`).

   Biên dịch: TypeScript ≥ 5, khuyến nghị `"noImplicitAny": false` (dữ liệu từ app cũ
   là JS động; các interface public ở cuối file được khai báo đầy đủ).
   React hook ở cuối file; nếu UI V2 không dùng React, xoá 1 dòng import cuối cùng.
   ===================================================================================== */
import { useEffect, useMemo, useReducer } from 'react'; // chỉ dùng cho hook useAppLogicV2 ở cuối file

// ---------- primitive types ----------
export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
export type Role = 'learner' | 'operator' | 'manager';
export type Section = 'listening' | 'reading' | 'writing' | 'speaking';
export type TestKind = 'placement' | 'final' | 'levelup';
export type ThemeKey = 'summer' | 'spring' | 'autumn' | 'winter' | 'tet' | 'midautumn' | 'christmas';
export type Persona = 'formal' | 'informal';
export type PartCode = 'L' | 'R' | 'W' | 'C' | 'U' | 'S';
export type NotifyType = '' | 'ok' | 'err';
export type Dict<T = any> = Record<string, T>;

export interface LexItem { w: string; v: string }
export interface Umbrella { w: string; v: string; words: LexItem[] }
export interface LexNote { w: string; def?: string; example?: string; context?: string; note?: string; source?: string }
export interface VocabEntry {
  e: string; v: string; ipa?: string; phrases?: string[]; pos?: string;
  family?: { w: string; pos: string; v: string }[]; umbrella?: Umbrella | string | '';
  syn?: LexItem[]; ant?: LexItem[]; synAll?: { w: string; level: string; note: string }[];
  slang?: LexNote | string | ''; poetic?: LexNote | string | ''; word?: string; meaning?: string;
}
export interface Practice { type: 'write' | 'fill' | 'mcq' | 'say'; prompt: string; options: string[]; answer: string }
export interface McqPart { prompt: string; options: string[]; answer: string }
export interface Pron { sound: string; focus: string; tip: string; words: string[]; ipa: Dict<string>; verified: boolean; rejected: string[]; manual?: boolean }
export interface Lesson {
  id: string; day?: number; order?: number; title: string; objective?: string; theory?: string; examples?: string[];
  vocab: VocabEntry[]; pron?: Pron | null; listening?: (McqPart & { audio: string }) | null; reading?: (McqPart & { text: string }) | null;
  speaking?: { prompt: string; answer: string } | null; practice: Practice | string; wordclass?: McqPart | null; worduse?: McqPart | null;
  trans?: Dict<{ q: string; a: string }>; micro?: boolean; manual?: boolean; demo?: boolean; durationMin?: number; cefr?: Cefr; week?: number;
  explanationLang?: 'vi' | 'en'; explainLang?: string; levelWarn?: string; editedBy?: string | null; editedAt?: string; [k: string]: any;
}
export interface LessonSet { id: string; week: number; cefr: Cefr; status: 'draft' | 'approved'; lessons: Lesson[]; generatedAt: string; generatedBy?: string | null; approvedAt?: string | null; approvedBy?: string | null; editedAt?: string }
export interface Profile {
  department: string; position: string; email: string; contact: string; goals: string[]; envUse: string; familyUse: string; habits: string[];
  situations: string; styles: string[]; explain: string; duration: string; sessionsPerWeek: number; device: string; selfLevel: string;
  certs: { type: string; score: string; year: string }[]; experience: string; concerns: string; completedAt?: string; updatedAt?: string; timeOfDay?: string;
}
export interface User {
  id: string; name: string; role: Role; pin?: string; cefr: Cefr | null; cefrSuggested: Cefr | null; cefrApproved: boolean;
  sectionScores: any; monthlyGoal: string; createdAt: string; approvedAt?: string | null; approvedBy?: string | null;
  avatar?: { color: string; acc: string; bg: number }; profile?: Profile; profileDraft?: Partial<Profile>; persona?: Persona;
  cefrHistory?: { from: Cefr | null; to: Cefr; at: string; by: string | null; reason: string; evidence: string }[];
  pendingCefr?: { from: Cefr | null; to: Cefr; by: string; reason: string; evidence: string; effective: string } | null;
  badgesSeen?: string[]; levelSeen?: number; allBadgesAt?: string; studied?: Dict<string>; topicStrikes?: { input: string; reason: string; at: string }[]; gameSetId?: string | null;
}
export interface Week { n: number; topic: string; description: string; objectives: string; keyVocabHint: string; plan?: Dict<string[]> }
export interface Settings {
  provider: 'claude' | 'gemini' | 'openai'; apiKey: string; model: string; geminiKey: string; geminiModel: string; oaiBase: string; oaiKey: string; oaiModel: string; sttModel?: string;
  webhookUrl: string; webhookTemplate: string; minMinutesPerDay: number; pinOperator: string; pinManager: string; pilotStartDate: string; pilotWeeks: number;
  weekOverride: number; orgName: string; prompts: Dict<string>; testTimed: boolean; testTimes: Record<Section, number>; testWarnLimit: number;
  levelUp: Dict<number>; theme?: ThemeKey | 'auto'; courseTheme?: string; coachDailyLimit?: number; coachVoice?: boolean; imgSource?: string; pexelsKey?: string; pixabayKey?: string;
}
export interface SectionScore { points: number; max: number; pct: number; cefr: Cefr; heuristic?: boolean; words?: number }
export interface TestRecord {
  id: string; userId: string; kind: TestKind; form: string; target: Cefr | null; answers: Dict<any>; audio: Dict<any>; sectionScores: Record<Section, SectionScore>; total: number; rawLevel: Cefr;
  warnings: { at: string; section: string; reason: string }[]; timing: Dict<any>; autoSubmitted: boolean; autoReason: string; aiSuggestedCefr: Cefr | null; rationale: string; aiScored: boolean;
  submittedAt: string; startedAt?: string; writingRubric?: Dict<number>; speakingRubric?: Dict<number>; monthlyGoal?: string; gradedBy?: string; gradedAt?: string; outcome?: string; failedAt?: string; weakest?: Section;
}
export interface CoachTurn { at: string; userText: string; reply: string; rubric: { meaning: number; vocab: number; grammar: number }; suggestions: { original: string; corrected: string; explanation: string }[]; correctedText: string; offTopic?: boolean; relevanceNote?: string; persona?: Persona; usedWords?: string[]; checked?: boolean; checkedBy?: string }
export interface CoachSession { id: string; userId: string; week: number; startedAt: string; messages: { role: 'user' | 'assistant'; content: string }[]; turns: CoachTurn[]; challenge?: { target: Cefr; testId: string; result: 'pass' | 'fail' | null; mean?: number; off?: number; finishedAt?: string } }
export interface Submission { id: string; userId: string; week: number; type: 'writing' | 'dialogue'; task: string; text: string; rubric: any; total: number | null; feedback: string; suggestions: any[]; correctedText: string; aiGraded: boolean; operatorChecked: boolean; submittedAt: string; gradedAt?: string; checkedBy?: string; manualReview?: any }
export interface GameWord { e: string; v: string; def?: string; ipa?: string; pos?: string }
export interface GameSet { id: string; userId: string; topic: string; input?: string; week?: number; cefr: Cefr; words: GameWord[]; others: GameWord[]; createdAt: string }

/** Toàn bộ state lưu localStorage (schema `aec:v1`, giữ nguyên để tương thích dữ liệu cũ). */
export interface AppState {
  version: number; settings: Settings; users: User[]; weeks: Week[]; lessonSets: LessonSet[]; microLessons: any[]; practiceResults: Dict<any>;
  progress: any[]; activity: { userId: string; date: string; type: string; minutes: number; at: string }[]; coachSessions: CoachSession[]; submissions: Submission[];
  tests: TestRecord[]; surveys: any[]; reminders: any[]; levelForms: any[]; levelRequests: any[]; gameSets: GameSet[]; gameResults: any[]; topicReports: any[]; duels: any[];
  session: { userId: string | null; reviewTab?: string; testDraft?: any }; testDrafts?: Dict<any>; appeals?: any[]; deleteRequests?: any[]; trash?: any[]; pinReports?: any[];
  [k: string]: any;
}

// ---------- utils (pure) ----------
export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const pad = (n: number | string) => String(n).padStart(2, '0');
export const dateStr = (d: any) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
export const todayStr = () => dateStr(new Date());
export const addDays = (ds: string, n: number) => { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return dateStr(d); };
export const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
export const fmtDate = (ds?: string) => { if (!ds) return '—'; const d = new Date(ds.length > 10 ? ds : ds + 'T00:00:00'); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
export const fmtDateTime = (iso?: string) => { if (!iso) return '—'; const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const mondayOf = (ds: string) => { const d = new Date(ds + 'T00:00:00'); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return dateStr(d); };
export const nextMonday = (ds: string) => { const dow = new Date(ds + 'T00:00:00').getDay(); return addDays(ds, dow === 0 ? 1 : 8 - dow); };
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const pct = (a: number, b: number) => b ? Math.round(100 * a / b) : 0;
export const avg = (arr: number[]) => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
export const sum = (arr: number[]) => arr.reduce((s, x) => s + x, 0);
export const initials = (name?: string) => (name || '?').trim().split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase();
export const shuffle = <T,>(arr: T[]) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Dict<string>)[c]);
export const wordCount = (s?: string) => (s || '').trim().split(/\s+/).filter(Boolean).length;
export const fmtClock = (s: number) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
export const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** Tên không dấu, chữ thường – dùng để so "gần giống". */
export const normName = (s?: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
/** Tên đúng chữ HOA/thường và dấu (chỉ bỏ khoảng trắng thừa) – dùng khi đăng nhập học viên. */
export const exactName = (s?: string) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();
export const normAns = (s: any) => String(s || '').toLowerCase().replace(/[“”"'.,!?;:]/g, '').replace(/\s+/g, ' ').trim();
/** answer key có thể liệt kê nhiều đáp án: "buy / try" hoặc "buy, try" */
export const keyList = (key: any) => String(key || '').split(/\s*(?:\/|\||;)\s*|,\s+/).map(normAns).filter(Boolean);
export const matchesKey = (answer: string, key: string) => { const a = normAns(answer); return keyList(key).some(k => k === a); };
export const hasVi = (s?: string) => /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(s || '');
/** Văn bản dùng từ mục tiêu (nguyên từ, không phân biệt hoa thường, cho phép đuôi -s/-ed/-ing). */
export const usesWord = (text: string, w: string) => new RegExp('(^|[^a-z])' + w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '(s|es|d|ed|ing)?([^a-z]|$)', 'i').test(text || '');
export const download = (name: string, text: string, type = 'application/json') => { if (typeof document === 'undefined') return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
export const copyText = async (text: string) => { try { await navigator.clipboard.writeText(text); return true; } catch { try { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true; } catch { return false; } } };
export const DAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
export const DOW_FULL = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
export const dowIndex = (ds: string) => (new Date(ds + 'T00:00:00').getDay() + 6) % 7;
export const isStudyDay = (ds: string) => dowIndex(ds) < 5;
export const prevStudyDay = (ds: string) => { let d = addDays(ds, -1); while (!isStudyDay(d)) d = addDays(d, -1); return d; };

// ---------- tiny event emitter ----------
export type Listener = (...a: any[]) => void;
export class Emitter {
  private m = new Map<string, Set<Listener>>();
  on(ev: string, fn: Listener) { if (!this.m.has(ev)) this.m.set(ev, new Set()); this.m.get(ev)!.add(fn); return () => this.off(ev, fn); }
  off(ev: string, fn: Listener) { this.m.get(ev)?.delete(fn); }
  emit(ev: string, ...a: any[]) { this.m.get(ev)?.forEach(fn => { try { fn(...a); } catch (e) { console.error(e); } }); }
}

// ---------- constants ----------
export const LEVELS: Cefr[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
export const LEVEL_NAMES: Record<Cefr, string> = { A1: 'A1 – Mới bắt đầu', A2: 'A2 – Sơ cấp', B1: 'B1 – Trung cấp', B2: 'B2 – Trung cao', C1: 'C1 – Cao cấp' };
export const ROLE_NAMES: Record<Role, string> = { learner: 'Người học', operator: 'Người vận hành', manager: 'Quản lý' };
export const SECTIONS: Section[] = ['listening', 'reading', 'writing', 'speaking'];
export const SECTION_NAMES: Record<Section, string> = { listening: 'Nghe', reading: 'Đọc', writing: 'Viết', speaking: 'Nói' };
/** Thang CEFR của đề (tổng /100): 0–24 A1 · 25–44 A2 · 45–64 B1 · 65–84 B2 · 85–100 C1 */
export const pctCefr = (p: number): Cefr => p >= 85 ? 'C1' : p >= 65 ? 'B2' : p >= 45 ? 'B1' : p >= 25 ? 'A2' : 'A1';
export const skillCefr = (pts: number, max = 25) => pctCefr(max ? pts / max * 100 : 0);
export const totalCefr = (total: number) => pctCefr(total);
export const isLow = (lvl?: Cefr | null) => lvl === 'A1' || lvl === 'A2';
export const nextLevelOf = (cefr: Cefr | null): Cefr | null => (cefr && LEVELS[LEVELS.indexOf(cefr) + 1]) || null;
export const LESSONS_PER_WEEK = 5;
export const MAX_ATTEMPTS = 2;
export const LEVELUP_RETRY_DAYS = 14;
export const CHALLENGE_TURNS = 6;
export const LEVELUP_DEFAULTS = { lessons: 90, firstTry: 75, submission: 80, coach: 4, coachTurns: 6, wrong: 30, minParts: 4, days: 14 };
export const PART_NAMES: Record<PartCode, [string, string]> = { L: ['Nghe', 'Listening'], R: ['Đọc', 'Reading'], W: ['Viết', 'Writing'], C: ['Từ loại', 'Word class'], U: ['Dùng từ', 'Word use'], S: ['Nói', 'Speaking'] };
export const SKILL_CODES: PartCode[] = ['L', 'R', 'W', 'S'];
export const POS_VI: Dict<string> = { noun: 'danh từ', verb: 'động từ', adjective: 'tính từ', adverb: 'trạng từ', preposition: 'giới từ', phrase: 'cụm từ', 'phrasal verb': 'cụm động từ', pronoun: 'đại từ', conjunction: 'liên từ', determiner: 'từ hạn định', interjection: 'thán từ' };
export const posLabel = (pos?: string, vi = true) => pos ? (vi ? (POS_VI[String(pos).toLowerCase()] || pos) : pos) : '';
export const WRITING_CRITERIA: [string, string][] = [['task', 'Task achievement'], ['organization', 'Organization & coherence'], ['vocabulary', 'Vocabulary'], ['grammar', 'Grammar'], ['communication', 'Workplace communication']];
export const SPEAKING_CRITERIA: [string, string][] = [['fluency', 'Fluency & interaction'], ['grammar', 'Grammar'], ['vocabulary', 'Vocabulary'], ['communication', 'Professional communication']];
export const TEST_STEPS = ['intro', ...SECTIONS, 'done'];
export const DELREQ_STATUS: Dict<[string, string]> = { restored: ['ok', 'Đã khôi phục tài khoản'], pending: ['warn', 'Chờ Quản lý duyệt'], approved: ['ok', 'Đã duyệt xoá'], rejected: ['danger', 'Bị từ chối'], cancelled: ['', 'Đã rút'] };
export const APPEAL_STATUS: Dict<[string, string]> = { pending: ['warn', 'Chờ Người vận hành duyệt'], upheld: ['ok', 'Đã duyệt lại – chấp nhận'], rejected: ['danger', 'Giữ nguyên kết quả'] };
export const USER_DATA_KEYS = ['progress', 'activity', 'coachSessions', 'submissions', 'tests', 'surveys', 'reminders', 'microLessons', 'appeals', 'levelRequests', 'gameSets', 'gameResults', 'topicReports'];
export const IMG_SOURCES: Dict<string> = { pexels: 'Pexels (ảnh stock, cần key miễn phí)', pixabay: 'Pixabay (ảnh stock, cần key miễn phí)', openverse: 'Openverse (Creative Commons, không cần key)', wikimedia: 'Wikipedia / Wikimedia Commons (không cần key)', none: 'Tắt ảnh minh hoạ' };
export const IMG_CACHE_KEY = 'aec:img:';
export const OAI_PRESETS: Dict<{ label: string; base: string; model: string; keyUrl: string }> = {
  groq: { label: 'Groq (miễn phí, nhanh)', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys' },
  openrouter: { label: 'OpenRouter (model có đuôi :free)', base: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', keyUrl: 'https://openrouter.ai/keys' },
  cerebras: { label: 'Cerebras (miễn phí)', base: 'https://api.cerebras.ai/v1', model: 'llama-3.3-70b', keyUrl: 'https://cloud.cerebras.ai/' },
  ollama: { label: 'Ollama trên máy (không cần key)', base: 'http://localhost:11434/v1', model: 'llama3.1', keyUrl: 'https://ollama.com/download' },
  custom: { label: 'Tuỳ chỉnh', base: '', model: '', keyUrl: '' }
};

/** Form hồ sơ onboarding: các lựa chọn (key, nhãn tiếng Việt[, gợi ý]). */
export const PROFILE_OPTS: Dict<string[][]> = {
  goals: [['customer', 'Nói chuyện với khách hàng / đối tác'], ['email', 'Viết email, tin nhắn công việc'], ['meeting', 'Họp và trình bày'], ['docs', 'Đọc tài liệu, spec kỹ thuật'], ['career', 'Thăng tiến / phỏng vấn'], ['confidence', 'Tự tin hơn khi nói']],
  styles: [['reading', 'Đọc và ghi chú'], ['listening', 'Nghe và nhắc lại'], ['speaking', 'Nói / hội thoại'], ['quiz', 'Trắc nghiệm, điền từ'], ['writing', 'Viết câu, viết email'], ['examples', 'Ví dụ sát việc đang làm'], ['games', 'Thử thách ngắn, có điểm']],
  timeOfDay: [['morning', 'Sáng sớm'], ['noon', 'Giờ nghỉ trưa'], ['afternoon', 'Chiều'], ['evening', 'Tối']],
  duration: [['5', '5 phút'], ['10', '10 phút'], ['15', '15 phút'], ['20', '20+ phút']],
  device: [['phone', 'Điện thoại'], ['laptop', 'Máy tính'], ['both', 'Cả hai']],
  selfLevel: [['unknown', 'Không rõ'], ['A1', 'Mới bắt đầu (A1)'], ['A2', 'Sơ cấp (A2)'], ['B1', 'Trung cấp (B1)'], ['B2', 'Khá (B2)'], ['C1', 'Tốt (C1)']],
  envUse: [['daily', 'Hằng ngày'], ['weekly', 'Vài lần mỗi tuần'], ['monthly', 'Thỉnh thoảng (vài lần/tháng)'], ['rarely', 'Hiếm khi / chưa dùng']],
  familyUse: [['daily', 'Hằng ngày (người thân nói tiếng Anh)'], ['weekly', 'Vài lần mỗi tuần (con cái, bạn đời cùng học…)'], ['monthly', 'Thỉnh thoảng'], ['never', 'Không dùng']],
  habits: [['movies', 'Xem phim / video tiếng Anh'], ['music', 'Nghe nhạc / podcast'], ['reading', 'Đọc tin tức, tài liệu'], ['social', 'Mạng xã hội, chat tiếng Anh'], ['speak', 'Nói chuyện với người nước ngoài'], ['app', 'Học qua app / khoá học'], ['none', 'Chưa có thói quen nào']],
  explain: [['vi', 'Tiếng Việt'], ['en', 'Tiếng Anh'], ['auto', 'Theo trình độ (mặc định)']],
  certs: [['ielts', 'IELTS', 'band, VD 5.5'], ['toeic', 'TOEIC', 'điểm, VD 650'], ['toefl', 'TOEFL iBT', 'điểm, VD 72'], ['cambridge', 'Cambridge (KET/PET/FCE/CAE)', 'VD PET – Pass'], ['vstep', 'VSTEP', 'bậc, VD 3/6'], ['other', 'Khác', 'tên + kết quả']]
};
export const optLabel = (group: string, key: string) => (PROFILE_OPTS[group].find(o => o[0] === key) || [])[1] || key;
export const optLabels = (group: string, keys?: string[]) => (keys || []).map(k => optLabel(group, k)).join(', ');
export const certLabel = (c: { type: string; score?: string; year?: string }) => `${optLabel('certs', c.type)}${c.score ? ' ' + c.score : ''}${c.year ? ' (' + c.year + ')' : ''}`;

/** Avatar: màu nét, biểu tượng mùa, màu nền (ids giữ nguyên để avatar đã lưu hiển thị đúng). */
export const AVATAR_COLORS: [string, string, string][] = [['ink', '#1E1E1E', 'Mực'], ['brown', '#6E3B32', 'Nâu'], ['olive', '#4B6120', 'Ô liu'], ['taupe', '#7A7064', 'Xám nâu'], ['orange', '#F28C28', 'Cam'], ['rose', '#B4374B', 'Đỏ hồng']];
export const AVATAR_ACC: [string, string][] = [['none', 'Chữ cái đầu'], ['leaf', 'Lá'], ['sun', 'Nắng'], ['flower', 'Hoa'], ['cloud', 'Mây'], ['star', 'Sao'], ['drop', 'Giọt mưa'], ['snow', 'Tuyết']];
export const AVATAR_BG = ['#FBB829', '#F6D3CB', '#E3DCFB', '#DCE8C8', '#FFF4D9', '#D6CCBF'];
/** Đường nét SVG (viewBox 24) của từng biểu tượng avatar – UI vẽ với stroke = màu nét. */
export const AVATAR_PATHS: Dict<string> = {
  leaf: '<path d="M5 19C5 10 11 5 20 5c0 9-5 15-15 14z"/><path d="M5 19c3-5 7-8 11-10"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  flower: '<circle cx="12" cy="12" r="2.5"/><path d="M12 3.5a3 3 0 0 1 0 6 3 3 0 0 1 0-6zM12 14.5a3 3 0 0 1 0 6 3 3 0 0 1 0-6zM3.5 12a3 3 0 0 1 6 0 3 3 0 0 1-6 0zM14.5 12a3 3 0 0 1 6 0 3 3 0 0 1-6 0z"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z"/>',
  star: '<path d="M12 3.5l2.4 5.2 5.6.6-4.2 3.9 1.2 5.6L12 16l-5 2.8 1.2-5.6L4 9.3l5.6-.6z"/>',
  drop: '<path d="M12 3.5c3.5 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 2.5-6.5 6-11z"/>',
  snow: '<path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18"/><path d="M12 3l-2 2M12 3l2 2M12 21l-2-2M12 21l2-2M3 12l2-2M3 12l2 2M21 12l-2-2M21 12l-2 2"/>'
};
/** Mô tả avatar của user → UI tự vẽ (initials hoặc emblem + màu). */
export function avatarSpec(u?: Partial<User> | null) {
  const a = u?.avatar; const ini = initials(u?.name);
  if (!a) return { kind: 'initials' as const, text: ini, color: '#1E1E1E', bg: '' };
  const color = (AVATAR_COLORS.find(c => c[0] === a.color) || AVATAR_COLORS[0])[1]; const bg = AVATAR_BG[(+a.bg || 0) % AVATAR_BG.length] || AVATAR_BG[0];
  const emblem = AVATAR_ACC.some(x => x[0] === a.acc) && a.acc !== 'none' ? a.acc : 'none';
  return emblem === 'none' ? { kind: 'initials' as const, text: ini, color, bg } : { kind: 'emblem' as const, emblem, path: AVATAR_PATHS[emblem], color, bg, text: ini };
}

/** Huy hiệu: id, icon, tên, mô tả, điều kiện trên stats. */
export const BADGES: [string, string, string, string, (s: any) => boolean][] = [
  ['first', '🐣', 'Khởi động', 'Hoàn thành bài học đầu tiên', s => s.lessons >= 1],
  ['week', '📅', 'Tuần trọn vẹn', 'Xong tất cả bài của một tuần', s => s.fullWeeks >= 1],
  ['streak3', '🔥', 'Chuỗi 3 ngày', 'Học 3 ngày học liên tiếp (T2–T6)', s => s.bestStreak >= 3],
  ['streak7', '🌟', 'Chuỗi 5 ngày', 'Học 5 ngày học liên tiếp (T2–T6), không tính cuối tuần', s => s.bestStreak >= 5],
  ['sharp', '🎯', 'Chuẩn ngay lần đầu', 'Làm đúng cả 4 kỹ năng Nghe, Đọc, Viết, Nói của một bài ngay ở lần làm đầu tiên', s => s.perfectLessons >= 1],
  ['words', '🔑', 'Thợ mở khoá', 'Mở 10 ô từ bí mật khi chat với Season', s => s.words >= 10],
  ['chat', '💬', 'Bạn của Season', '10 lượt luyện với Season', s => s.turns >= 10],
  ['friday', '✍️', 'Đúng hẹn thứ Sáu', 'Nộp bài thực hành tuần', s => s.subs >= 1]
];
export const REWARD_RULES: [string, string][] = [['Hoàn thành 1 bài học', '+10'], ['Mỗi phần Nghe/Đọc/Viết/Nói làm đúng', '+5 nếu đúng lần 1, giảm 1 điểm mỗi lần làm lại'], ['1 lượt luyện với Season', '+2'], ['Mở 1 ô từ bí mật', '+2'], ['Nộp bài tuần (thứ Sáu)', '+15'], ['Xong trọn bài của một tuần', '+20']];
/** 4 mùa học (cấp thưởng): cần đủ điểm VÀ đủ huy hiệu của cấp. */
export const GOOSE_LEVELS = [
  { name: 'Mùa xuân – gieo hạt', short: 'Mùa xuân', icon: '🌱', min: 0, badges: [] as string[], color: 'var(--mint)', size: 64 },
  { name: 'Mùa hạ – đón nắng', short: 'Mùa hạ', icon: '☀️', min: 60, badges: ['first', 'streak3'], color: 'var(--primary)', size: 76 },
  { name: 'Mùa thu – gặt hái', short: 'Mùa thu', icon: '🍂', min: 180, badges: ['week', 'friday', 'chat'], color: 'var(--peach)', size: 88 },
  { name: 'Mùa đông – vững vàng', short: 'Mùa đông', icon: '❄️', min: 360, badges: ['streak7', 'sharp', 'words'], color: 'var(--lav)', size: 100 }
];
export const REWARD_LEVELS = GOOSE_LEVELS.map(l => [l.min, l.name] as [number, string]);
export const SIM_CASES: [string, number, string[]][] = [
  ['Mới bắt đầu', 0, []], ['Cấp 1 · đủ điểm, thiếu huy hiệu', 80, ['first']], ['Cấp 1 · đủ huy hiệu, thiếu điểm', 40, ['first', 'streak3']],
  ['Vừa lên cấp 2', 65, ['first', 'streak3']], ['Cấp 2 · điểm cao, kẹt vì huy hiệu', 400, ['first', 'streak3', 'week']], ['Vừa lên cấp 3', 190, ['first', 'streak3', 'week', 'friday', 'chat']],
  ['Cấp 3 · thiếu 1 huy hiệu cuối', 420, ['first', 'streak3', 'week', 'friday', 'chat', 'streak7', 'sharp']], ['Cấp cao nhất', 420, BADGES.map(b => b[0])], ['Có huy hiệu cấp cao nhưng thiếu cấp dưới', 400, ['first', 'streak7', 'sharp', 'words']]
];
/** Nhãn/điểm form soạn bài tay (key, nhãn, hướng dẫn). */
export const DOC_FIELDS: [string, string, string][] = [
  ['title', 'Tiêu đề bài', 'Tên ngắn của mẫu câu, bằng tiếng Anh. VD: I work as…'], ['objective', 'Mục tiêu bài học', 'Sau bài này học viên làm được gì (1 câu).'],
  ['theory', 'Ngữ pháp', 'Công thức + dùng khi nào + 2–3 câu ví dụ có dùng 3 từ vựng.'], ['examples', 'Câu ví dụ để đọc thành tiếng', '2–3 câu tiếng Anh, cách nhau bằng dấu ; (chỉ câu, không ghi công thức).'],
  ['vocab1', 'Từ vựng 1', 'từ | phiên âm | nghĩa | cụm 1; cụm 2; cụm 3'], ['vocab2', 'Từ vựng 2', 'từ | phiên âm | nghĩa | cụm 1; cụm 2; cụm 3'], ['vocab3', 'Từ vựng 3', 'từ | phiên âm | nghĩa | cụm 1; cụm 2; cụm 3'],
  ['sound', 'Âm mục tiêu', 'Một ký hiệu IPA. VD: ɜː'], ['tip', 'Mẹo phát âm', '1 câu hướng dẫn cách phát âm âm đó.'], ['words', '3 từ luyện âm', '3 từ đều chứa âm mục tiêu, cách nhau bằng dấu phẩy.'],
  ['l_audio', 'Nghe – đoạn audio', '1–2 câu tiếng Anh; máy sẽ đọc, học viên không thấy chữ.'], ['l_q', 'Nghe – câu hỏi', ''], ['l_opts', 'Nghe – lựa chọn', '4 lựa chọn, cách nhau bằng dấu |'], ['l_a', 'Nghe – đáp án', 'Chép nguyên văn lựa chọn đúng.'],
  ['r_text', 'Đọc – đoạn văn', '2–4 câu tiếng Anh.'], ['r_q', 'Đọc – câu hỏi', ''], ['r_opts', 'Đọc – lựa chọn', '4 lựa chọn, cách nhau bằng dấu |'], ['r_a', 'Đọc – đáp án', 'Chép nguyên văn lựa chọn đúng.'],
  ['w_type', 'Viết – dạng bài', 'điền từ / trắc nghiệm / tự viết'], ['w_q', 'Viết – đề bài', 'Điền từ: dùng ___ và ghi gợi ý nghĩa trong ngoặc.'], ['w_opts', 'Viết – lựa chọn', 'Chỉ khi trắc nghiệm; cách nhau bằng dấu |'], ['w_a', 'Viết – đáp án', 'Một đáp án đúng duy nhất.'],
  ['s_q', 'Nói – yêu cầu', 'VD: Nói to câu sau.'], ['s_a', 'Nói – câu mẫu', 'Câu tiếng Anh học viên phải nói (6–14 từ).']
];
export const docHint = (k: string) => (DOC_FIELDS.find(d => d[0] === k) || [])[2] || '';
export const docKey = (s: string) => normName(s).replace(/[^a-z0-9]+/g, ' ').trim();
export const OLD_DEMO_TITLES = ['My name, my job', 'Where are you from?', 'My working week', 'Introducing yourself at work', "Asking about someone's job", 'A short introduction email', 'Introducing yourself with impact', 'Small talk before a meeting', 'Positioning yourself in a kickoff'];

// ===== [DATA] Theme marks (SVG inner markup drawn with CSS vars) =====
const THEME_MARKS = {
  sun: '<g stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round"><path d="M16 2.5v3.5M16 26v3.5M2.5 16H6M26 16h3.5M6.5 6.5l2.4 2.4M23.1 23.1l2.4 2.4M6.5 25.5l2.4-2.4M23.1 8.9l2.4-2.4"/></g><circle cx="16" cy="16" r="7.5" fill="var(--accent)"/>',
  blossom: '<g fill="var(--accent)"><circle cx="16" cy="7.5" r="4.6"/><circle cx="24.1" cy="13.4" r="4.6"/><circle cx="21" cy="22.9" r="4.6"/><circle cx="11" cy="22.9" r="4.6"/><circle cx="7.9" cy="13.4" r="4.6"/></g><circle cx="16" cy="16" r="3.6" fill="var(--primary)"/>',
  leaf: '<path d="M6 26C6 13 14 6 27 6c0 13-7 21-21 20z" fill="var(--primary)"/><path d="M6 26c4-7 9-12 15-16" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"/>',
  snow: '<g fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round"><path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13"/><path d="M16 3l-3 3M16 3l3 3M16 29l-3-3M16 29l3-3M4.7 9.5l4 1M4.7 9.5l1-4M27.3 22.5l-4-1M27.3 22.5l-1 4M4.7 22.5l1 4M4.7 22.5l4-1M27.3 9.5l-1-4M27.3 9.5l-4 1"/></g>',
  mai: '<g fill="var(--primary)" stroke="var(--accent)" stroke-width="1.2"><path d="M16 4.5c2.6 0 4.2 2.4 3.4 5.2 2.9-.3 4.9 1.8 4.1 4.3 2.5 1.4 2.5 4.4 0 5.8.8 2.5-1.2 4.6-4.1 4.3.8 2.8-.8 5.2-3.4 5.2s-4.2-2.4-3.4-5.2c-2.9.3-4.9-1.8-4.1-4.3-2.5-1.4-2.5-4.4 0-5.8-.8-2.5 1.2-4.6 4.1-4.3-.8-2.8.8-5.2 3.4-5.2z"/></g><circle cx="16" cy="16" r="3.2" fill="var(--accent)"/>',
  lantern: '<path d="M16 3v3" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"/><rect x="11" y="6" width="10" height="3" rx="1.5" fill="var(--accent)"/><path d="M8 11c0-1.7 3.6-2.5 8-2.5s8 .8 8 2.5v9c0 1.7-3.6 2.5-8 2.5s-8-.8-8-2.5z" fill="var(--primary)"/><path d="M12.5 9v13.5M19.5 9v13.5" stroke="var(--accent)" stroke-width="1.4" opacity=".6"/><rect x="11" y="22" width="10" height="3" rx="1.5" fill="var(--accent)"/><path d="M14 25v4M18 25v4" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round"/>',
  star: '<path d="M16 3l3.6 7.6 8.3 1-6.1 5.7 1.6 8.2L16 21.4l-7.4 4.1 1.6-8.2-6.1-5.7 8.3-1z" fill="var(--primary)" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round"/>'
};
const THEMES = {
  summer: {name: 'Mùa hạ', mark: 'sun'}, spring: {name: 'Mùa xuân', mark: 'blossom'}, autumn: {name: 'Mùa thu', mark: 'leaf'}, winter: {name: 'Mùa đông', mark: 'snow'},
  tet: {name: 'Tết Nguyên đán', mark: 'mai'}, midautumn: {name: 'Trung thu', mark: 'lantern'}, christmas: {name: 'Giáng sinh – Năm mới', mark: 'star'}
};
// Lunar festival dates (Gregorian) for the years in reach; add a year here when needed. Tết window: 7 days before → 10 days after; Trung thu: ±5 days; Christmas/New Year: 15/12 → 2/1.
const TET_DATES = {2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26', 2029: '2029-02-13', 2030: '2030-02-03'};
const MIDAUTUMN_DATES = {2026: '2026-09-25', 2027: '2027-09-15', 2028: '2028-10-03', 2029: '2029-09-22', 2030: '2030-09-12'};

// ===== [DATA] AI system prompts =====
const PROMPTS = {
  base: `You are the AI engine of "Season English", an internal English-learning product for Vietnamese office staff at ${'GFT'}. Learners range from CEFR A1 to C1. Rules that always apply:
- Adapt vocabulary, sentence length and grammar strictly to the learner's CEFR level.
- For A1 and A2 learners, all explanations, instructions and error feedback are in Vietnamese (the English learning content itself stays in English). For B1 and above, use English only.
- Be warm but honest. Never over-praise. Point out real errors; prioritise the ones that block meaning.
- Keep everything workplace-relevant and culturally appropriate for a Vietnamese company.`,
  placement: `Task: grade the productive parts of the "Workplace English CEFR Placement Test" and suggest a CEFR level.
Listening and Reading/Grammar/Vocabulary are already scored automatically (their points and maxima are given). You grade WRITING – all writing tasks together, weighting the formal task more – with the official rubric (5 criteria, each 1-5: task achievement, organization & coherence, vocabulary, grammar, workplace communication; 5 = fully addresses the task with precise professional language, 3 = adequate but limited development with noticeable errors, 1 = very limited) and SPEAKING from the speech-to-text transcripts of all tasks with 4 criteria, each 1-5 (fluency & interaction judged from how developed and connected the answers are, grammar, vocabulary, professional communication; pronunciation is NOT assessed). Give 0 for a criterion when the text is empty. Ignore punctuation/casing noise typical of speech recognition.
Then suggest ONE overall CEFR level (A1-C1) using the test's conversion table (total /100: 0-24 A1, 25-44 A2, 45-64 B1, 65-84 B2, 85-100 C1) and your judgement of the productive skills; if your judgement differs from the table, say so in the rationale. Write the rationale in Vietnamese (3-5 sentences: strengths, the most important weaknesses with 1-2 quoted examples, and why this level). Suggest a realistic one-month goal in Vietnamese (1 sentence) tied to the learner's job.`,
  lesson: `Chỉ trả về JSON, không bọc markdown, không giải thích.
Nhiệm vụ: Tạo {n} bài học tiếng Anh siêu ngắn cho {n} ngày liên tiếp (day 1 = Thứ Hai), mỗi bài DẠY MỘT mẫu câu/cấu trúc khác nhau trong cùng chủ đề, đi từ dễ đến khó, không lặp mẫu câu.
- Trình độ: {cefr_level}
- Chủ đề tuần: {topic}
- Nghề nghiệp: {job}
- Phong cách học: {learning_style}
- Ngôn ngữ giảng giải: {explain_lang}

Mỗi bài:
"title" = tên ngắn của mẫu câu (tiếng Anh, ≤6 từ).
"theory" = NỘI DUNG DẠY, không phải mô tả hay kế hoạch, không nhắc tới bài tập. Gồm 3 phần viết liền:
1) Công thức mẫu câu, ghi rõ từng thành phần bằng {explain_lang} và liệt kê 2–3 từ có thể lắp vào (A1–A2: giải thích thuật ngữ, ví dụ "verb = động từ, như buy = mua").
2) Dùng khi nào, 1 câu.
3) 2–3 ví dụ tiếng Anh hoàn chỉnh gắn với {job} và {topic} (A1–A2 kèm nghĩa tiếng Việt), mỗi ví dụ dùng 1 từ trong vocab.
Tối đa 90 từ, giọng văn theo {learning_style}.
"examples" = danh sách 2–3 câu ví dụ TIẾNG ANH hoàn chỉnh, chép đúng các câu ví dụ trong theory (chỉ câu, không có công thức, không có nghĩa tiếng Việt). App dùng danh sách này để đọc thành tiếng.
"objective" = 1 câu bằng {explain_lang}: sau bài này người học LÀM ĐƯỢC gì (cụ thể, đo được).
"vocab" = đúng 3 từ CẦN để lắp vào mẫu câu (ưu tiên động từ/cụm từ của mẫu), mỗi từ phải xuất hiện trong ví dụ của theory; mỗi từ có "ipa" (phiên âm IPA) và "phrases" = ĐÚNG 3 cụm từ/collocation thông dụng CHỨA từ đó, gắn với {topic} và {job}, ngắn 2–5 từ, đúng mức {cefr_level}, là cụm người bản ngữ thật sự dùng chứ không ghép máy móc (ví dụ từ "meeting": "have a meeting", "join a meeting", "a team meeting"; SAI: "join a developer"). KHÔNG dùng tên riêng (tên người, tên công ty, địa danh) làm từ vựng hay làm đáp án bài tập.
Mỗi từ vựng còn có: "pos" = từ loại tiếng Anh (noun/verb/adjective/adverb/preposition/phrase…); "family" = 2–3 từ cùng gốc khác từ loại [{"w","pos","v"}] ("v" = nghĩa Việt ngắn); "umbrella" = {"w": 1 từ bao trùm / nhóm nghĩa rộng hơn (ví dụ "tester" → "job"), "v": nghĩa Việt, "words": 3–4 từ KHÁC cùng nằm dưới từ bao trùm đó [{"w","v"}] (ví dụ job → developer, designer, manager)}; "syn" = 1–2 từ đồng nghĩa CÙNG mức {cefr_level} [{"w","v"}], LUÔN kèm nghĩa Việt "v"; "ant" = từ trái nghĩa cùng mức [{"w","v"}] CHỈ KHI từ đó thật sự có từ trái nghĩa tự nhiên (new → old); không có thì để [] – KHÔNG gượng ép (ví dụ "meeting", "email" không có trái nghĩa). Nếu mức là B1 trở lên, thêm: "synAll" = 3–5 từ đồng nghĩa ở mọi mức [{"w","level":"A1|A2|B1|B2|C1","note":"sắc thái, 3–6 từ tiếng Anh"}], "slang" = cách nói lóng/thân mật tương đương {"w", "def": định nghĩa tiếng Anh ngắn, "example": 1 câu ví dụ, "context": bối cảnh dùng được / không dùng được (bằng {explain_lang}), "note": lưu ý (sắc thái, vùng miền, mức độ suồng sã)} – không có thì null; "poetic" = từ văn chương/thi ca tương đương {"w", "def", "example": 1 câu, "source": tác phẩm / tác giả THẬT có dùng từ đó theo nghĩa này (không chắc thì ghi "văn chương thế kỷ …")} – không có thì null. Mức A1–A2: để "synAll": [], "slang": null, "poetic": null.
"pron" = phát âm: "sound" = MỘT âm mục tiêu, chỉ ghi ký hiệu IPA, không kèm dấu gạch chéo (ví dụ "ɜː"); "focus" = tên gọi ngắn của âm đó bằng {explain_lang}; "tip" = 1 câu hướng dẫn cách phát âm bằng {explain_lang}; "words" = ĐÚNG 3 mục {"w": từ tiếng Anh, "ipa": phiên âm IPA đầy đủ của từ đó}. Phiên âm của CẢ 3 từ phải chứa đúng ký hiệu trong "sound" (ví dụ sound "ʌ": bug /bʌɡ/ đúng, could /kʊd/ SAI; sound "æ": cat /kæt/ đúng, automated /ˈɔːtəmeɪtɪd/ SAI). Tự soát từng từ trước khi trả lời; nếu không tìm đủ 3 từ chắc chắn đúng thì đổi sang âm khác. Ưu tiên từ của bài; câu mẫu ở "speaking" phải có ít nhất 1 trong 3 từ này.
Bốn kỹ năng, mỗi phần CHỈ CÓ MỘT ĐÁP ÁN ĐÚNG và chỉ dùng mẫu câu + từ của bài. MỌI câu trắc nghiệm có ĐÚNG 4 lựa chọn, tất cả lựa chọn và câu hỏi bằng TIẾNG ANH (không Việt hoá đáp án), các lựa chọn sai phải hợp ngữ cảnh nhưng sai rõ ràng. CẤM dùng địa danh, quốc gia, thành phố hay tên riêng làm lựa chọn/đáp án (Da Nang, Hanoi, Hue, Laos, Thailand, Vietnam, London…): người học đoán được từ tiếng Việt mà không cần hiểu tiếng Anh; hỏi về nghề, hành động, tính từ, thời gian… thay vì "đến từ đâu":
"listening" = "audio": 1–2 câu tiếng Anh (15–30 từ) sẽ được đọc thành tiếng, người học không thấy chữ; "prompt": 1 câu hỏi tiếng Anh về nội dung nghe; "options": 4 lựa chọn; "answer": nguyên văn lựa chọn đúng.
"reading" = "text": đoạn 2–4 câu tiếng Anh (25–50 từ), nội dung khác phần nghe; "prompt", "options" (4), "answer" như trên.
Mức B1 trở lên: câu hỏi nghe và đọc phải là câu hỏi SUY LUẬN (inference): đáp án không được nêu nguyên văn trong bài, người học phải suy ra từ ngữ cảnh (ví dụ: "What can we infer about…?", "Why most likely…?").
"speaking" = "prompt": yêu cầu nói to một câu bằng {explain_lang}; "answer": đúng 1 câu tiếng Anh mẫu (6–14 từ) người học cần nói.
"practice" = phần VIẾT: 1 bài tập áp dụng ĐÚNG mẫu câu của bài và dùng từ trong vocab, CHỈ CÓ MỘT ĐÁP ÁN ĐÚNG, không gây nhầm lẫn:
- "fill": điền 1 từ vào ___, đề PHẢI có gợi ý nghĩa trong ngoặc ngay sau chỗ trống để chỉ một từ đúng, ví dụ "I want to ___ (mua) a T-shirt."; answer = đúng 1 từ.
- "mcq": đúng 4 lựa chọn tiếng Anh, đúng 1 đáp án, các lựa chọn khác sai rõ ràng về ngữ pháp hoặc nghĩa; answer = nguyên văn lựa chọn đúng.
- "write": tự viết 1–2 câu theo mẫu; answer = 1 câu mẫu.
"wordclass" = bài tập TỪ LOẠI: "prompt" = 1 câu tiếng Anh của bài có chứa 1 từ vựng + câu hỏi tiếng Anh "What part of speech is '<từ>' in this sentence?"; "options" = 4 từ loại tiếng Anh (noun, verb, adjective, adverb, preposition…); "answer" = từ loại đúng.
"worduse" = bài tập CÁCH DÙNG TỪ: "prompt" = "Which sentence uses '<từ vựng>' correctly?"; "options" = 4 câu tiếng Anh ngắn, chỉ 1 câu dùng từ đó đúng nghĩa và đúng ngữ pháp, 3 câu kia sai cách dùng (sai từ loại, sai collocation, sai nghĩa); "answer" = nguyên văn câu đúng.
"trans" = bản dịch TIẾNG VIỆT, app hiện khi người học trả lời đúng. Với từng phần "L" (listening), "R" (reading), "W" (practice), "S" (speaking): "q" = đề bài/câu hỏi bằng tiếng Việt (đề đã là tiếng Việt thì chép lại; câu điền từ thì dịch cả câu đã điền đúng), "a" = NGHĨA TIẾNG VIỆT của đáp án đúng, không chép lại tiếng Anh (ví dụ answer "I work as a tester." → a "Tôi làm nhân viên kiểm thử."; answer "work" → a "làm việc").
Chọn dạng hợp {learning_style}. Đề bài bằng {explain_lang}; từ/câu tiếng Anh giữ nguyên. Bắt buộc đủ các key, không để trống.

JSON (đúng các key này):
{"lessons":[{"day":1,"title":"...","objective":"...","theory":"...","examples":["...","..."],"vocab":[{"e":"word","v":"nghĩa việt","ipa":"/wɜːd/","phrases":["...","...","..."],"pos":"noun","family":[{"w":"...","pos":"...","v":"..."}],"umbrella":{"w":"...","v":"...","words":[{"w":"...","v":"..."}]},"syn":[{"w":"...","v":"..."}],"ant":[],"synAll":[{"w":"...","level":"B2","note":"..."}],"slang":{"w":"...","def":"...","example":"...","context":"...","note":"..."},"poetic":{"w":"...","def":"...","example":"...","source":"..."}}],"pron":{"sound":"ɜː","focus":"...","tip":"...","words":[{"w":"work","ipa":"/wɜːk/"}]},"listening":{"audio":"...","prompt":"...","options":["...","...","...","..."],"answer":"..."},"reading":{"text":"...","prompt":"...","options":["...","...","...","..."],"answer":"..."},"speaking":{"prompt":"...","answer":"..."},"practice":{"type":"write|fill|mcq","prompt":"...","options":["chỉ dùng cho mcq, 4 lựa chọn"],"answer":"..."},"wordclass":{"prompt":"...","options":["noun","verb","adjective","adverb"],"answer":"noun"},"worduse":{"prompt":"...","options":["...","...","...","..."],"answer":"..."},"trans":{"L":{"q":"...","a":"..."},"R":{"q":"...","a":"..."},"W":{"q":"...","a":"..."},"S":{"q":"...","a":"..."}}}]}`,
  weeks: `Chỉ trả về JSON, không bọc markdown.
Đề xuất khung chủ đề tiếng Anh công sở cho {n} tuần (mỗi tuần 1 chủ đề chung cho cả nhóm, bài sẽ sinh riêng theo mức CEFR từng người). Với MỖI tuần đưa 3 phương án khác hẳn nhau để người vận hành chọn.
Nhóm học viên: {learners}
Các mức CEFR cần bài: {levels}
Chủ đề đã dùng (không lặp lại): {used}
Yêu cầu: chủ đề thiết thực với nghề và mục đích của nhóm, đi từ dễ đến khó, mỗi phương án một tình huống giao tiếp cụ thể. Viết bằng tiếng Việt, chủ đề (topic) bằng tiếng Anh ngắn gọn. Lịch học cố định 5 ngày/tuần (Thứ Hai → Thứ Sáu). Với mỗi phương án, lập kế hoạch 5 NGÀY cho TỪNG mức trong danh sách mức: "days" = đúng 5 mục theo thứ tự ngày, mỗi mục là tên mẫu câu hoặc kỹ năng của ngày đó (≤8 từ, tiếng Anh cho mẫu câu), đi từ dễ đến khó, không lặp.
JSON: {"weeks":[{"week":1,"options":[{"topic":"...","description":"tình huống cụ thể, 1–2 câu","objectives":"2–3 mục tiêu đo được, ngắn","keyVocabHint":"5–8 từ/cụm tiếng Anh, cách nhau bằng dấu phẩy","levels":[{"cefr":"A1","days":["T2 ...","T3 ...","T4 ...","T5 ...","T6 ..."]}]}]}]}`,
  mgrade: `Chỉ trả về JSON, không bọc markdown.
Chấm câu trả lời của người học trình độ {cefr_level} cho bài thực hành dưới đây. Giải thích bằng {explain_lang}, ngắn gọn, không khen quá tay.
Nguyên tắc: đáp án tham khảo CHỈ là tham khảo. Mọi câu trả lời đúng ngữ pháp, đúng mẫu câu trong lý thuyết và hợp nghĩa với đề đều được chấm ĐÚNG, kể cả khác đáp án tham khảo (ví dụ "try" và "buy" đều hợp "I want to ___ a T-shirt" khi đề không gợi ý nghĩa). Chỉ chấm sai khi sai ngữ pháp, sai mẫu câu, hoặc không hợp nghĩa.
Lý thuyết: {theory}
Từ vựng: {vocab}
Bài tập ({ptype}): {practice}
Đáp án tham khảo: {key}
Câu trả lời của người học: {answer}
JSON (đúng các key): {"score": 0-10, "ok": true/false, "feedback": "≤40 từ: vì sao đúng/sai so với lý thuyết và gợi ý hướng sửa; nếu SAI thì KHÔNG viết ra đáp án đúng vì người học sẽ làm lại; nếu đúng nhưng khác tham khảo, nói rõ cả hai đều được", "fix": "câu trả lời đúng hoàn chỉnh bằng tiếng Anh (giữ nguyên câu của người học nếu đã đúng)"}`,
  coach: `Task: you are "Season", the learner's friendly sun mascot and conversation coach for this week's topic (the app is "Season English": learning is a year of seasons). Refer to yourself as Season. Each turn:
1) Reply naturally in English as a conversation partner (2-4 sentences, strictly at the learner's level; for A1 use very short simple sentences). Ask one follow-up question to keep the conversation going.
2) Score the learner's LAST message with the rubric (0-5 each): meaning (did they express the idea clearly / answer the question), vocabulary (range and appropriateness for level), grammar (accuracy). 5 = excellent for their level, 3 = okay with noticeable issues, 1 = hard to understand.
3) Give at most 3 concrete suggestions (fewer if the message was good; zero is allowed). Each suggestion: quote the learner's phrase, give the corrected version, and a one-line explanation (Vietnamese for A1/A2, English for B1+).
4) Provide a fully corrected version of the learner's message in "correctedText" (empty string if already correct).
Do not correct spelling of names. Do not praise excessively; one short positive remark is enough.`,
  grade: `Task: grade a learner's weekly practice submission (short writing or dialogue) with the shared rubric. Scores 0-5 each for meaning, vocabulary, grammar, and an overall 0-100 (meaning 40%, vocabulary 30%, grammar 30%). Give feedback (3-5 sentences; Vietnamese for A1/A2, English for B1+) that names the strongest point and the most important fix, then at most 3 suggestions (original → corrected → one-line explanation). Provide a corrected version of the whole text. Be honest; a text full of errors should not score above 50.`,
  levelform: `Chỉ trả về JSON, không bọc markdown, không giải thích.
Tạo một ĐỀ THI NGẮN kiểm tra tiếng Anh công sở ở ĐÚNG mức CEFR {target} (người học đang ở mức thấp hơn và muốn lên {target}). Toàn bộ nội dung đề bằng tiếng Anh; hướng dẫn ngắn bằng tiếng Anh.
1) "listening": MỘT đoạn hội thoại hoặc thông báo nơi làm việc, ĐỘ DÀI BẮT BUỘC 120–180 từ (đếm tổng các "line"; 6–10 lượt nói, 2 người nói, ghi "who" và "line" cho từng lượt) + ĐÚNG 5 câu hỏi trắc nghiệm, mỗi câu 4 lựa chọn và chỉ 1 đáp án đúng ("answer" = chỉ số 0–3), hỏi cả chi tiết lẫn ý ngầm phù hợp mức {target}.
2) "reading": MỘT văn bản công sở (email, quy trình hoặc bài viết ngắn), ĐỘ DÀI BẮT BUỘC 150–220 từ, 2–3 đoạn + ĐÚNG 5 câu hỏi như trên.
3) "writing": "task" = bối cảnh 1 câu; "message" = tin nhắn của quản lý yêu cầu viết 80–120 từ nêu 1 vấn đề và 1 đề xuất.
4) "speaking": "title" ngắn; "prompt" = 1 tình huống để nói 2–3 phút (tiếng Anh); "hint" = 1 câu gợi ý bằng tiếng Việt.
KHÔNG dùng các chủ đề sau (đã có trong đề khác): họp nhóm, khiếu nại khách hàng, chính sách làm việc hybrid/từ xa, chia sẻ tri thức, chuyển văn phòng, giao hàng trễ, công cụ quản lý dự án, onboarding, thẻ khách, xin cấp thiết bị. Gợi ý chủ đề: đào tạo nội bộ, đi công tác, tuyển dụng, an toàn dữ liệu, sự kiện công ty, ngân sách phòng ban, đánh giá nhà cung cấp. Không dùng tên công ty thật. Các lựa chọn sai phải hợp lý nhưng sai rõ ràng.
JSON (đúng các key): {"title":"...","listening":{"title":"...","instruction":"...","audio":[{"who":"...","line":"..."}],"questions":[{"q":"...","options":["...","...","...","..."],"answer":0}]},"reading":{"title":"...","instruction":"...","text":"...","questions":[{"q":"...","options":["...","...","...","..."],"answer":0}]},"writing":{"task":"...","message":"..."},"speaking":{"title":"...","prompt":"...","hint":"..."}}`,
  gamevocab: `Chỉ trả về JSON, không bọc markdown, không giải thích.
Người học tiếng Anh công sở mức CEFR {cefr} nhập một chủ đề tự do để chơi trò chơi từ vựng: "{topic}".
1) Kiểm tra chủ đề. MỌI chủ đề đời thường hoặc công việc đều HỢP LỆ (ví dụ: coffee shop, du lịch, bóng đá, nấu ăn, sprint planning, email, sức khỏe, thời tiết, mua sắm…), kể cả viết bằng tiếng Việt. Từ chối ("valid": false, "reason" = 1 câu tiếng Việt, các mảng rỗng) khi: (a) chuỗi vô nghĩa / ký tự ngẫu nhiên không phải là chủ đề → "soft": false; (b) nội dung độc hại (bạo lực, tình dục, chất cấm, xúc phạm, chính trị nhạy cảm) → "soft": false; (c) chủ đề về một NHÓM NGƯỜI hay bản sắc (LGBT, giới tính, tôn giáo, dân tộc, khuyết tật, tuổi tác…) → KHÔNG coi là vi phạm tình dục hay xúc phạm: "soft": true và "reason" = "Chủ đề chưa hợp bối cảnh đời sống / học tập ở đây, bạn chọn chủ đề khác nhé". Khi hợp lệ: "soft": false.
2) Nếu hợp lệ: "topic" = tên chủ đề bằng tiếng Anh ngắn gọn (≤5 từ); "words" = ĐÚNG {n} từ/cụm từ tiếng Anh THUỘC chủ đề đó và ĐÚNG mức {cefr} (A1–A2: từ rất thông dụng, ngắn, cụ thể; B1: từ phổ biến nơi làm việc; B2–C1: từ ít gặp hơn, collocation tự nhiên). Không trùng nhau, không tên riêng, mỗi từ 1–3 tiếng, chỉ chữ cái a–z và dấu cách; trộn đủ từ loại (ít nhất 2 danh từ, 2 động từ, 1 tính từ). Mỗi từ: "e" (tiếng Anh, viết thường), "v" (nghĩa tiếng Việt ngắn), "def" (định nghĩa tiếng Anh ≤12 từ, dùng từ đơn giản hơn mức {cefr}, KHÔNG chứa chính từ đó), "ipa" (phiên âm), "pos" (từ loại tiếng Anh: noun / verb / adjective / adverb / preposition / phrase).
3) "others" = 8 từ tiếng Anh thông dụng cùng mức {cefr} nhưng KHÔNG liên quan chủ đề (mỗi từ có "e", "v"), dùng làm từ gây nhiễu.
JSON: {"valid":true,"soft":false,"reason":"","topic":"...","words":[{"e":"...","v":"...","def":"...","ipa":"...","pos":"noun"}],"others":[{"e":"...","v":"..."}]}`
};

// ===== [DATA] Grammar scope per CEFR level =====
const LEVEL_SCOPE = {
  A1: {max: 9, allow: 'thì hiện tại đơn (be, have, động từ thường), there is/are, can/can\'t, câu mệnh lệnh, this/that, tính từ sở hữu, giới từ cơ bản, want to / would like', ban: 'hiện tại hoàn thành, hoàn thành tiếp diễn, quá khứ tiếp diễn, bị động, câu điều kiện, mệnh đề quan hệ, câu gián tiếp'},
  A2: {max: 13, allow: 'các cấu trúc A1 cộng thêm quá khứ đơn, hiện tại tiếp diễn, be going to / will, so sánh hơn và nhất, should / have to, trạng từ tần suất, some/any', ban: 'hiện tại hoàn thành, hoàn thành tiếp diễn, bị động, câu điều kiện loại 2 và 3, câu gián tiếp'},
  B1: {max: 18, allow: 'các cấu trúc A2 cộng thêm hiện tại hoàn thành đơn, câu điều kiện loại 1, bị động thì đơn, mệnh đề quan hệ, used to, modal chỉ khả năng', ban: 'hoàn thành tiếp diễn, câu điều kiện loại 3 và hỗn hợp, đảo ngữ'},
  B2: {max: 25, allow: 'các cấu trúc B1 cộng thêm hoàn thành tiếp diễn, câu điều kiện loại 2 và 3, bị động mọi thì, câu gián tiếp, từ nối lập luận', ban: 'đảo ngữ nhấn mạnh và cấu trúc văn chương hiếm gặp'},
  C1: {max: 35, allow: 'mọi cấu trúc, chú trọng sắc thái và độ chính xác', ban: '(không)'}
};
const levelScopeNote = cefr => { const s = LEVEL_SCOPE[cefr]; return s ? `\n\nGIỚI HẠN BẮT BUỘC CỦA MỨC ${cefr} (áp dụng cho mẫu câu được dạy, mọi câu ví dụ, đoạn nghe, đoạn đọc, câu nói mẫu và đáp án):\n- Chỉ dùng: ${s.allow}.\n- TUYỆT ĐỐI KHÔNG dùng: ${s.ban}.\n- Mỗi câu tiếng Anh tối đa ${s.max} từ; từ vựng thuộc mức ${cefr} (từ chuyên ngành chỉ dùng khi rất thông dụng trong nghề của người học).\n- Nếu chủ đề gợi ra cấu trúc vượt mức, hãy diễn đạt lại bằng cấu trúc được phép (ví dụ A1: "I am a tester. I test software every day." thay cho "I have been testing software for 2 years").` : ''; };

// ===== [DATA] Pronunciation drill words / sound files =====
const SOUND_WORDS = {
  'iː': 'see:siː team:tiːm meet:miːt read:riːd week:wiːk', 'ɪ': 'it:ɪt in:ɪn big:bɪɡ this:ðɪs six:sɪks', 'e': 'ten:ten test:test yes:jes send:send desk:desk',
  'æ': 'cat:kæt bag:bæɡ plan:plæn thanks:θæŋks manager:ˈmænɪdʒə', 'ʌ': 'bus:bʌs cup:kʌp lunch:lʌntʃ bug:bʌɡ Monday:ˈmʌndeɪ', 'ɒ': 'job:dʒɒb hot:hɒt office:ˈɒfɪs stop:stɒp box:bɒks',
  'ɔː': 'call:kɔːl four:fɔː door:dɔː report:rɪˈpɔːt morning:ˈmɔːnɪŋ', 'ʊ': 'book:bʊk good:ɡʊd look:lʊk put:pʊt could:kʊd', 'uː': 'you:juː two:tuː new:njuː room:ruːm food:fuːd',
  'ɜː': 'work:wɜːk word:wɜːd first:fɜːst learn:lɜːn thirty:ˈθɜːti', 'ə': 'about:əˈbaʊt teacher:ˈtiːtʃə today:təˈdeɪ tester:ˈtestə computer:kəmˈpjuːtə', 'ɑː': 'car:kɑː start:stɑːt half:hɑːf class:klɑːs park:pɑːk',
  'eɪ': 'day:deɪ name:neɪm late:leɪt email:ˈiːmeɪl today:təˈdeɪ', 'aɪ': 'I:aɪ hi:haɪ time:taɪm price:praɪs write:raɪt', 'ɔɪ': 'boy:bɔɪ join:dʒɔɪn enjoy:ɪnˈdʒɔɪ point:pɔɪnt voice:vɔɪs',
  'aʊ': 'now:naʊ how:haʊ out:aʊt about:əˈbaʊt down:daʊn', 'əʊ': 'go:ɡəʊ no:nəʊ phone:fəʊn home:həʊm hello:həˈləʊ', 'ɪə': 'here:hɪə near:nɪə year:jɪə idea:aɪˈdɪə clear:klɪə', 'eə': 'where:weə chair:tʃeə share:ʃeə their:ðeə software:ˈsɒftweə',
  'θ': 'thank:θæŋk think:θɪŋk three:θriː month:mʌnθ thing:θɪŋ', 'ð': 'this:ðɪs that:ðæt they:ðeɪ with:wɪð the:ðə', 'ʃ': 'she:ʃiː shop:ʃɒp share:ʃeə finish:ˈfɪnɪʃ English:ˈɪŋɡlɪʃ',
  'tʃ': 'check:tʃek chair:tʃeə lunch:lʌntʃ much:mʌtʃ teacher:ˈtiːtʃə', 'dʒ': 'job:dʒɒb join:dʒɔɪn manager:ˈmænɪdʒə project:ˈprɒdʒekt message:ˈmesɪdʒ', 'ŋ': 'meeting:ˈmiːtɪŋ long:lɒŋ thing:θɪŋ morning:ˈmɔːnɪŋ testing:ˈtestɪŋ',
  's': 'six:sɪks send:send test:test office:ˈɒfɪs yes:jes', 'z': 'is:ɪz busy:ˈbɪzi please:pliːz bugs:bʌɡz zero:ˈzɪərəʊ', 'v': 'very:ˈveri five:faɪv have:hæv visit:ˈvɪzɪt seven:ˈsevn', 'w': 'work:wɜːk we:wiː week:wiːk well:wel one:wʌn',
  'r': 'read:riːd report:rɪˈpɔːt room:ruːm right:raɪt problem:ˈprɒbləm', 'l': 'late:leɪt look:lʊk call:kɔːl email:ˈiːmeɪl hello:həˈləʊ', 't': 'ten:ten test:test time:taɪm team:tiːm two:tuː', 'd': 'day:deɪ desk:desk do:duː send:send door:dɔː',
  'k': 'call:kɔːl cat:kæt book:bʊk check:tʃek work:wɜːk', 'p': 'plan:plæn put:pʊt park:pɑːk stop:stɒp price:praɪs', 'b': 'bag:bæɡ big:bɪɡ bus:bʌs book:bʊk job:dʒɒb', 'f': 'four:fɔː five:faɪv first:fɜːst food:fuːd office:ˈɒfɪs',
  'h': 'hi:haɪ how:haʊ hot:hɒt home:həʊm half:hɑːf', 'm': 'meet:miːt name:neɪm time:taɪm morning:ˈmɔːnɪŋ team:tiːm', 'n': 'no:nəʊ new:njuː name:neɪm ten:ten now:naʊ', 'j': 'you:juː yes:jes year:jɪə new:njuː use:juːz', 'g': 'go:ɡəʊ good:ɡʊd big:bɪɡ bag:bæɡ bug:bʌɡ'
};
/** Recordings of single sounds (Wikimedia Commons IPA samples, free licence, not AI). Diphthongs have no single recording, so the browser voice says a word that is exactly that sound. */
const SOUND_FILES = {'iː': 'Close_front_unrounded_vowel', 'ɪ': 'Near-close_near-front_unrounded_vowel', 'e': 'Open-mid_front_unrounded_vowel', 'æ': 'Near-open_front_unrounded_vowel', 'ʌ': 'PR-open-mid_back_unrounded_vowel2', 'ɒ': 'PR-open_back_rounded_vowel', 'ɔː': 'PR-open-mid_back_rounded_vowel', 'ʊ': 'Near-close_near-back_rounded_vowel', 'uː': 'Close_back_rounded_vowel', 'ɜː': 'Open-mid_central_unrounded_vowel', 'ə': 'Mid-central_vowel', 'ɑː': 'Open_back_unrounded_vowel',
  'θ': 'Voiceless_dental_fricative', 'ð': 'Voiced_dental_fricative', 'ʃ': 'Voiceless_palato-alveolar_sibilant', 'tʃ': 'Voiceless_palato-alveolar_affricate', 'dʒ': 'Voiced_palato-alveolar_affricate', 'ŋ': 'Velar_nasal', 's': 'Voiceless_alveolar_sibilant', 'z': 'Voiced_alveolar_sibilant', 'v': 'Voiced_labio-dental_fricative', 'w': 'Voiced_labio-velar_approximant', 'r': 'Alveolar_approximant', 'l': 'Alveolar_lateral_approximant',
  't': 'Voiceless_alveolar_plosive', 'd': 'Voiced_alveolar_plosive', 'k': 'Voiceless_velar_plosive', 'p': 'Voiceless_bilabial_plosive', 'b': 'Voiced_bilabial_plosive', 'f': 'Voiceless_labio-dental_fricative', 'h': 'Voiceless_glottal_fricative', 'm': 'Bilabial_nasal', 'n': 'Alveolar_nasal', 'j': 'Palatal_approximant', 'g': 'Voiced_velar_plosive_02'};
const SOUND_SPOKEN = {'eɪ': 'A', 'aɪ': 'eye', 'ɔɪ': 'oy', 'aʊ': 'ow', 'əʊ': 'oh', 'ɪə': 'ear', 'eə': 'air'};

// ===== [DATA] JSON schemas for AI structured output =====
const MCQ_SCHEMA = {type: 'object', additionalProperties: false, required: ['prompt', 'options', 'answer'], properties: {prompt: {type: 'string'}, options: {type: 'array', items: {type: 'string'}}, answer: {type: 'string'}}};
const VOCAB_SCHEMA = {type: 'object', additionalProperties: false, required: ['e', 'v'], properties: {e: {type: 'string'}, v: {type: 'string'}, ipa: {type: 'string'}, phrases: {type: 'array', items: {type: 'string'}}, pos: {type: 'string'},
  family: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['w', 'pos'], properties: {w: {type: 'string'}, pos: {type: 'string'}, v: {type: 'string'}}}},
  umbrella: {type: 'object', additionalProperties: false, required: ['w', 'v', 'words'], properties: {w: {type: 'string'}, v: {type: 'string'}, words: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['w', 'v'], properties: {w: {type: 'string'}, v: {type: 'string'}}}}}},
  syn: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['w', 'v'], properties: {w: {type: 'string'}, v: {type: 'string'}}}}, ant: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['w', 'v'], properties: {w: {type: 'string'}, v: {type: 'string'}}}},
  synAll: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['w', 'level'], properties: {w: {type: 'string'}, level: {type: 'string'}, note: {type: 'string'}}}},
  slang: {type: ['object', 'null'], additionalProperties: false, properties: {w: {type: 'string'}, def: {type: 'string'}, example: {type: 'string'}, context: {type: 'string'}, note: {type: 'string'}}},
  poetic: {type: ['object', 'null'], additionalProperties: false, properties: {w: {type: 'string'}, def: {type: 'string'}, example: {type: 'string'}, source: {type: 'string'}}}}};
const SCHEMAS = {
  placement: {type: 'object', additionalProperties: false, required: ['cefr', 'writing', 'speaking', 'rationale', 'monthlyGoal'],
    properties: {cefr: {type: 'string', enum: LEVELS},
      writing: {type: 'object', additionalProperties: false, required: ['task', 'organization', 'vocabulary', 'grammar', 'communication'], properties: {task: {type: 'integer', description: '1-5, 0 if no text'}, organization: {type: 'integer'}, vocabulary: {type: 'integer'}, grammar: {type: 'integer'}, communication: {type: 'integer'}}},
      speaking: {type: 'object', additionalProperties: false, required: ['fluency', 'grammar', 'vocabulary', 'communication'], properties: {fluency: {type: 'integer', description: '1-5 judged from transcript length/connectedness, 0 if no text'}, grammar: {type: 'integer'}, vocabulary: {type: 'integer'}, communication: {type: 'integer'}}},
      rationale: {type: 'string'}, monthlyGoal: {type: 'string'}}},
  weeks: {type: 'object', additionalProperties: false, required: ['weeks'], properties: {weeks: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['week', 'options'], properties: {week: {type: 'integer'}, options: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['topic', 'description', 'objectives', 'keyVocabHint', 'levels'], properties: {topic: {type: 'string'}, description: {type: 'string'}, objectives: {type: 'string'}, keyVocabHint: {type: 'string'}, levels: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['cefr', 'days'], properties: {cefr: {type: 'string'}, days: {type: 'array', items: {type: 'string'}}}}}}}}}}}}},
  mgrade: {type: 'object', additionalProperties: false, required: ['score', 'ok', 'feedback', 'fix'], properties: {score: {type: 'integer'}, ok: {type: 'boolean'}, feedback: {type: 'string'}, fix: {type: 'string'}}},
  gamevocab: {type: 'object', additionalProperties: false, required: ['valid', 'soft', 'reason', 'topic', 'words', 'others'], properties: {valid: {type: 'boolean'}, soft: {type: 'boolean'}, reason: {type: 'string'}, topic: {type: 'string'},
    words: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['e', 'v', 'def', 'ipa', 'pos'], properties: {e: {type: 'string'}, v: {type: 'string'}, def: {type: 'string'}, ipa: {type: 'string'}, pos: {type: 'string'}}}},
    others: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['e', 'v'], properties: {e: {type: 'string'}, v: {type: 'string'}}}}}},
  levelform: (() => { const Q = {type: 'array', items: {type: 'object', additionalProperties: false, required: ['q', 'options', 'answer'], properties: {q: {type: 'string'}, options: {type: 'array', items: {type: 'string'}}, answer: {type: 'integer'}}}};
    return {type: 'object', additionalProperties: false, required: ['title', 'listening', 'reading', 'writing', 'speaking'], properties: {title: {type: 'string'},
      listening: {type: 'object', additionalProperties: false, required: ['title', 'instruction', 'audio', 'questions'], properties: {title: {type: 'string'}, instruction: {type: 'string'}, audio: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['who', 'line'], properties: {who: {type: 'string'}, line: {type: 'string'}}}}, questions: Q}},
      reading: {type: 'object', additionalProperties: false, required: ['title', 'instruction', 'text', 'questions'], properties: {title: {type: 'string'}, instruction: {type: 'string'}, text: {type: 'string'}, questions: Q}},
      writing: {type: 'object', additionalProperties: false, required: ['task', 'message'], properties: {task: {type: 'string'}, message: {type: 'string'}}},
      speaking: {type: 'object', additionalProperties: false, required: ['title', 'prompt', 'hint'], properties: {title: {type: 'string'}, prompt: {type: 'string'}, hint: {type: 'string'}}}}}; })(),
  lesson: {type: 'object', additionalProperties: false, required: ['lessons'], properties: {lessons: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['day', 'title', 'theory', 'vocab', 'practice'], properties: {
    day: {type: 'integer'}, title: {type: 'string'}, objective: {type: 'string'}, theory: {type: 'string'}, examples: {type: 'array', items: {type: 'string'}}, vocab: {type: 'array', items: VOCAB_SCHEMA},
    wordclass: MCQ_SCHEMA, worduse: MCQ_SCHEMA,
    pron: {type: 'object', additionalProperties: false, required: ['sound', 'focus', 'tip', 'words'], properties: {sound: {type: 'string'}, focus: {type: 'string'}, tip: {type: 'string'}, words: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['w', 'ipa'], properties: {w: {type: 'string'}, ipa: {type: 'string'}}}}}},
    listening: {type: 'object', additionalProperties: false, required: ['audio', 'prompt', 'options', 'answer'], properties: {audio: {type: 'string'}, prompt: {type: 'string'}, options: {type: 'array', items: {type: 'string'}}, answer: {type: 'string'}}},
    reading: {type: 'object', additionalProperties: false, required: ['text', 'prompt', 'options', 'answer'], properties: {text: {type: 'string'}, prompt: {type: 'string'}, options: {type: 'array', items: {type: 'string'}}, answer: {type: 'string'}}},
    speaking: {type: 'object', additionalProperties: false, required: ['prompt', 'answer'], properties: {prompt: {type: 'string'}, answer: {type: 'string'}}},
    trans: {type: 'object', additionalProperties: false, properties: Object.fromEntries(['L', 'R', 'W', 'S'].map(c => [c, {type: 'object', additionalProperties: false, required: ['q', 'a'], properties: {q: {type: 'string'}, a: {type: 'string'}}}]))},
    practice: {type: 'object', additionalProperties: false, required: ['type', 'prompt', 'options', 'answer'], properties: {type: {type: 'string', enum: ['write', 'fill', 'mcq']}, prompt: {type: 'string'}, options: {type: 'array', items: {type: 'string'}}, answer: {type: 'string'}}}}}}}},
  coach: {type: 'object', additionalProperties: false, required: ['relevant', 'relevanceNote', 'reply', 'rubric', 'suggestions', 'correctedText', 'usedWords'],
    properties: {relevant: {type: 'boolean'}, relevanceNote: {type: 'string'}, reply: {type: 'string'}, usedWords: {type: 'array', items: {type: 'string'}}, rubric: {type: 'object', additionalProperties: false, required: ['meaning', 'vocab', 'grammar'], properties: {meaning: {type: 'integer'}, vocab: {type: 'integer'}, grammar: {type: 'integer'}}},
      suggestions: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['original', 'corrected', 'explanation'], properties: {original: {type: 'string'}, corrected: {type: 'string'}, explanation: {type: 'string'}}}}, correctedText: {type: 'string'}}},
  grade: {type: 'object', additionalProperties: false, required: ['rubric', 'total', 'feedback', 'suggestions', 'correctedText'],
    properties: {rubric: {type: 'object', additionalProperties: false, required: ['meaning', 'vocab', 'grammar'], properties: {meaning: {type: 'integer'}, vocab: {type: 'integer'}, grammar: {type: 'integer'}}}, total: {type: 'integer'}, feedback: {type: 'string'},
      suggestions: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['original', 'corrected', 'explanation'], properties: {original: {type: 'string'}, corrected: {type: 'string'}, explanation: {type: 'string'}}}}, correctedText: {type: 'string'}}}
};

// ===== [DATA] Placement test forms A / B =====
const mcq = (q, options, answer, pts) => ({q, options, answer, pts});
const TEST_FORMS = {
  A: {
    title: 'Workplace English CEFR Placement Test',
    listening: {
      intro: 'Mỗi phần nghe được phát tối đa 2 lần (giọng đọc của trình duyệt). Nghe xong chọn đáp án.',
      parts: [
        {key: 'LA', title: 'Part A – Thông báo của quản lý', instruction: 'Listen to the manager\'s announcement and answer questions 1–5.', audio: [['Manager', 'Good morning, everyone. Just a quick reminder about tomorrow\'s team meeting. It will start at 9:30, not 9:00 as originally planned. We\'ll meet in Room 210. Please bring the latest sales report because we\'ll discuss our results from last month. If you have any questions, please speak to Sarah before the meeting.'], ['Employee', 'Why has the time changed?'], ['Manager', 'The client has asked us to move our morning call, so we needed to change the meeting time.']],
          questions: [mcq('What time is the team meeting?', ['9:00', '9:30', '10:00', '10:30'], 1, 1), mcq('Where is the meeting?', ['Room 201', 'Room 210', 'Room 220', 'Online'], 1, 1), mcq('What should employees bring?', ['Their laptops', 'Their ID cards', 'The sales report', 'Their notebooks'], 2, 1), mcq('Who should Maria contact?', ['David', 'Sarah', 'Tom', 'James'], 1, 1), mcq('Why has the meeting changed?', ['The manager is sick.', 'The room is unavailable.', 'The client has changed the schedule.', 'The company is having technical problems.'], 2, 1)]},
        {key: 'LB', title: 'Part B – Hội thoại với cấp trên', instruction: 'Listen to a conversation between a supervisor and an employee and answer questions 6–10.', audio: [['Employee', 'Hi, James. Do you have a minute? I\'m working on the customer report, but I\'m not sure how to handle one part of it.'], ['Supervisor', 'Sure. What\'s the problem?'], ['Employee', 'The customer is asking for a refund, but the situation is a little unusual. I\'m not sure which procedure applies.'], ['Supervisor', 'Have you checked the previous customer cases?'], ['Employee', 'No, not yet.'], ['Supervisor', 'I\'d start there. We had a very similar case last month, and the report might show you which procedure we followed.'], ['Employee', 'Okay. I\'ll check those records first.'], ['Supervisor', 'Good. If you still can\'t find the answer, come back to me. We have to send the report today, but there may be some flexibility with the exact time.'], ['Employee', 'That\'s helpful. Thanks.']],
          questions: [mcq('What problem does the employee have?', ['She cannot access the company website.', 'She is having difficulty completing a report.', 'She does not understand the customer\'s request.', 'She cannot contact her manager.'], 2, 1), mcq('What does the supervisor suggest first?', ['Asking another department for help', 'Checking previous customer records', 'Calling the customer', 'Sending the report immediately'], 1, 1), mcq('Why does the supervisor suggest checking previous records?', ['They may contain a similar case.', 'They contain the customer\'s personal information.', 'They are required by company policy.', 'They are easier to understand.'], 0, 1), mcq('What will the employee do next?', ['Contact the customer', 'Check previous cases', 'Rewrite the whole report', 'Ask the IT department'], 1, 1), mcq('What does the supervisor say about the deadline?', ['It cannot be changed.', 'It has already passed.', 'There may be some flexibility.', 'The report is no longer necessary.'], 2, 1)]},
        {key: 'LC', title: 'Part C – Thảo luận về chính sách hybrid', instruction: 'Listen to a short discussion between two employees about a new hybrid-work policy and answer questions 11–15.', audio: [['Anna', 'So, what do you think about the new hybrid-work policy?'], ['Mark', 'I think there are some advantages. People can probably concentrate better when they\'re working on tasks that require a lot of individual focus. But I\'m concerned about communication.'], ['Anna', 'What do you mean?'], ['Mark', 'When people aren\'t in the office, they may not hear about decisions that are made informally. Someone might have an important conversation in a meeting, for example, but another team member working remotely doesn\'t know about it.'], ['Anna', 'That\'s true. But I don\'t think that means the policy can\'t work. We probably need clearer communication procedures.'], ['Mark', 'Such as?'], ['Anna', 'Important decisions could be documented in one shared system instead of relying on conversations or messages between individual employees.'], ['Mark', 'Yes. That could make the system more reliable.']],
          questions: [mcq('What is the main concern discussed?', ['Employee salaries', 'Office space', 'Communication between teams', 'Employee training'], 2, 2), mcq('What does Anna believe is one advantage of the new system?', ['Employees can work fewer hours.', 'Employees can concentrate better on individual tasks.', 'Managers can reduce staff numbers.', 'Meetings will become unnecessary.'], 1, 2), mcq('What concern does Mark raise?', ['Some employees may receive less information.', 'Employees may work too many hours.', 'The office will become more expensive.', 'Customers may complain about the policy.'], 0, 2), mcq('What does Anna suggest?', ['Cancelling the policy', 'Increasing the number of meetings', 'Establishing clearer communication procedures', 'Requiring everyone to work in the office'], 2, 2), mcq('What can be inferred about both speakers?', ['They completely disagree with the policy.', 'They think the policy has potential but needs adjustments.', 'They believe remote work is impossible.', 'They think communication is not important.'], 1, 2)]}
      ]
    },
    // Part 2 – Reading, Grammar & Vocabulary: 40 single items (1 point each), graded A1 → C1 in blocks of 10. Short texts sit inside the question stem.
    reading: {
      intro: '40 câu, mỗi câu 1 điểm. Chọn một đáp án đúng cho mỗi câu; một số câu có đoạn văn ngắn ngay trong câu hỏi.',
      parts: [
        {key: 'R1', title: 'Questions 1–10 · Basic (A1–A2)', instruction: 'Choose the best answer.', text: '', questions: [
          mcq('Priya ____ a customer service agent.', ['are', 'am', 'is', 'be'], 2, 1),
          mcq('Marco needs to ____ the customer\'s problem.', ['sleep', 'swim', 'solve', 'cook'], 2, 1),
          mcq('Read this notice: "The help desk is open from 9 to 5." – When is the help desk open?', ['From 9 to 5', 'From 5 to 9', 'Only on Monday', 'It is closed'], 0, 1),
          mcq('The company has three ____ this week.', ['complaint', 'complaint\'s', 'complaints\'', 'complaints'], 3, 1),
          mcq('Read this chat message: Customer: "Hi, I have a problem with my refund." Agent: "____"', ['Hello! How can I help you?', 'Hello! Where are you from originally?', 'Hello! What is your favorite color?', 'Hello! Goodbye and have a very nice day.'], 0, 1),
          mcq('The support office is closed on ____.', ['Twelve', 'Angry', 'Sunday', 'Green'], 2, 1),
          mcq('Samuel ____ the manager about his refund yesterday.', ['call', 'called', 'calling', 'calls'], 1, 1),
          mcq('The support team will ____ the complaint carefully before responding.', ['look after', 'look for', 'look out for', 'look into'], 3, 1),
          mcq('Read this email: "Dear Ana, your refund of $45 will arrive in 5 business days. Thank you for your patience." – How much is the refund?', ['$54', '$45', '5 days', '45 days'], 1, 1),
          mcq('This month we received ____ complaints than last month.', ['few', 'fewer', 'less', 'more little'], 1, 1)]},
        {key: 'R2', title: 'Questions 11–20 · Intermediate (A2–B1)', instruction: 'Choose the best answer.', text: '', questions: [
          mcq('Read this chat: Agent: "Your order number, please?" Customer: "Sorry, ____?"', ['could you repeat that', 'I am doing fine today thank you', 'see you later', 'it is Tuesday afternoon today'], 0, 1),
          mcq('Marco could not fix the problem, so he asked his ____ for help.', ['customer', 'supervisor', 'invoice', 'deadline'], 1, 1),
          mcq('Read these instructions: "First, open the refund form. Next, enter your order number. Finally, click submit." – What should you do after opening the form?', ['click submit and finish now', 'enter your order number', 'close the form', 'call the manager on the phone'], 1, 1),
          mcq('Nadia ____ three emails about her refund, but nobody has replied yet.', ['sent', 'is sending', 'send', 'has sent'], 3, 1),
          mcq('The manager decided to ____ a complaint seriously and offer a refund.', ['make', 'do', 'take', 'have'], 2, 1),
          mcq('Read this paragraph: "Tomas ordered a laptop online, but it arrived with a cracked screen. He contacted customer support the same day and explained the problem. The company apologized, offered a full refund, and arranged for a courier to collect the damaged laptop the next morning. Tomas was satisfied with how quickly the issue was resolved." – What is this paragraph mainly about?', ['A customer who forgot to pay', 'A company resolving a customer\'s complaint quickly', 'A courier company changing delivery schedule', 'A laptop factory with quality problems'], 1, 1),
          mcq('If the item arrives damaged, customers ____ contact support within 48 hours.', ['would', 'should', 'were', 'did'], 1, 1),
          mcq('Read this reply: "Unfortunately, we ____ offer a refund after 30 days, but we can send a replacement part."', ['are unable to', 'are happy to', 'never wanted to', 'always refuse to'], 0, 1),
          mcq('The refund was approved; ____, it will take five days to appear in your account.', ['however', 'otherwise', 'as a result', 'in order that'], 0, 1),
          mcq('Read this paragraph: "Priya called the support line four times this week about the same billing error. Each time, a different agent asked her to repeat the whole story from the beginning. By Friday, she asked to speak to a manager and canceled her subscription." – What can you infer about Priya?', ['She was happy', 'She never contacted', 'She fixed it herself', 'She was frustrated by having to repeat her problem repeatedly'], 3, 1)]},
        {key: 'R3', title: 'Questions 21–30 · Upper-intermediate (B1–B2)', instruction: 'Choose the best answer.', text: '', questions: [
          mcq('Diego said that the refund ____ already been processed.', ['has', 'had', 'have', 'was'], 1, 1),
          mcq('Read this paragraph: "Chen\'s email began politely, thanking the support team for their quick reply. However, by the third paragraph, his tone shifted: he listed every delay in bullet points and ended with, \'I trust this will finally be resolved, as I have already spent considerable time on this matter.\' He did not use any angry words, but the message left little doubt about his patience running out." – What does the passage suggest about Chen\'s attitude?', ['He is losing patience despite his polite wording', 'He is completely satisfied', 'He does not care', 'He is thanking the team sincerely throughout'], 0, 1),
          mcq('Which sentence is the most diplomatic way to reject a refund request?', ['No, you cannot have a refund.', 'You should have read the policy before buying.', 'We refuse your request.', 'We understand your frustration, but unfortunately this falls outside our refund policy.'], 3, 1),
          mcq('The agent finally managed ____ the source of the billing error.', ['finding', 'find', 'to find', 'founded'], 2, 1),
          mcq('The support team will ____ the customer by email once the refund is complete.', ['notice', 'note', 'know', 'notify'], 3, 1),
          mcq('Read this paragraph: "Lena\'s complaint email was forwarded to three different departments before anyone replied. When the reply finally came, it apologized for the delay and explained that the ticket had been mislabeled from the start. This explanation, while accurate, did little to change how Lena felt about the overall experience, since the damage to her trust in the company had already been done." – What does \'this explanation\' refer to?', ['Lena\'s original complaint', 'The three different departments', 'The explanation that the ticket had been mislabeled', 'The refund policy'], 2, 1),
          mcq('Which reply is appropriate for a formal complaint from a corporate client?', ['Oops, sorry about that, my bad!', 'Yeah, we\'ll sort it out soon', 'We sincerely apologize for the inconvenience and will resolve this promptly.', 'Chill, it happens sometimes'], 2, 1),
          mcq('____ had the refund been processed than the customer called to complain again.', ['As soon', 'Not until', 'Hardly ever', 'No sooner'], 3, 1),
          mcq('Read this paragraph: "The company claims that its new complaint-handling system has reduced resolution time by half. Internal data shows that the average ticket now closes in two days rather than four. However, customer satisfaction scores have barely moved, suggesting that speed alone has not addressed the underlying issue: many customers report receiving faster replies that still fail to solve their actual problem." – What does the evidence in the passage actually support?', ['The system has completely failed', 'Faster replies have not made customers meaningfully more satisfied', 'Satisfaction scores have doubled', 'Tickets now take four days to close'], 1, 1),
          mcq('Which phrasing best de-escalates an angry customer without conceding fault prematurely?', ['I hear how frustrating this has been, and I want to understand exactly what happened.', 'Calm down', 'That\'s not our fault', 'I don\'t see why you\'re upset'], 0, 1)]},
        {key: 'R4', title: 'Questions 31–40 · Advanced (B2–C1)', instruction: 'Choose the best answer.', text: '', questions: [
          mcq('____ the complaint himself, Samuel understood why the customer was upset.', ['Handled', 'To handle', 'Having handled', 'Handling having'], 2, 1),
          mcq('Management announced that refund delays would be addressed ____ the board, not just for a few customers.', ['over', 'across', 'along', 'through'], 1, 1),
          mcq('Read this paragraph: "Aisha filed her complaint on Monday, expecting a reply within 24 hours as promised. When Thursday arrived with still no response, she escalated the matter to a regional manager, who admitted that the promise had never been realistic given current staffing levels. It was this admission, more than the original delay, that convinced her to leave." – What does \'this admission\' refer to?', ['Aisha\'s decision', 'The original delay', 'The website policy', 'The manager\'s statement that the 24-hour promise was never realistic'], 3, 1),
          mcq('The refund offered was purely ____, meaning the company was not obligated to provide it.', ['mandatory', 'contractual', 'statutory', 'discretionary'], 3, 1),
          mcq('By the time the manager arrived, the customer ____ for over an hour, growing visibly more frustrated.', ['had been waiting', 'was waiting', 'has waited', 'waited'], 0, 1),
          mcq('Read this passage: "Complaint-resolution metrics are frequently treated as proxies for customer trust, yet the two are only loosely correlated. What the data conceals is not the outcome itself but the customer\'s subjective sense of having been heard." – Which statement does the passage actually support?', ['Fast ticket closure does not guarantee that a customer feels genuinely heard', 'Companies should stop measuring resolution time', 'Trust is highest when tickets close quickly', 'Current systems accurately measure trust'], 0, 1),
          mcq('Which reply implies a refund without ever explicitly promising one?', ['We\'re reviewing your case, and I expect you\'ll be pleased with the outcome by Friday.', 'You will get a full refund within five days.', 'We cannot offer a refund in this case.', 'There is no possibility of compensation.'], 0, 1),
          mcq('The customer\'s complaint was ultimately deemed ____, meaning it had no basis in the company\'s actual policy.', ['unfinished', 'unfamiliar', 'unfounded', 'unforeseen'], 2, 1),
          mcq('Read this line from an internal memo: "The rollout of the new refund system was, shall we say, not without its complications." – What does this sentence actually imply?', ['The rollout went perfectly', 'The system was canceled', 'The writer is certain about the outcome', 'The rollout had significant problems'], 3, 1),
          mcq('Neither the manager nor the agents ____ aware that the refund policy had changed overnight.', ['was', 'is', 'were', 'has been'], 2, 1)]}
      ]
    },
    // Part 3 – Writing: two tasks (7 + 13 points), one rubric for the section (5 criteria × 1–5, scaled to 20)
    writing: {
      points: 20,
      tasks: [
        {key: 'writing', title: 'Task 1 – Phản hồi nhanh (7 phút · 7 điểm · A2–B1)', task: 'You receive this message from a colleague:', message: 'Hi! I need to take tomorrow morning off urgently for a family matter. Could you help me monitor the customer support inbox from 9 AM to 12 PM? I owe you one!', requirement: 'Write a short reply (50–80 words): agree to help and ask whether there are any important tickets you should pay special attention to.', minWords: 50, maxWords: 80, points: 7},
        {key: 'writing2', title: 'Task 2 – Báo cáo / đề xuất (13 phút · 13 điểm · B2–C1)', task: 'You work for a company that is updating its customer-service procedures. Your manager has sent you this message:', message: 'Hi,\nSeveral employees have said that they are sometimes unsure which customer-service procedure is the most recent one.', requirement: 'Write a formal email (120–150 words) replying to your manager: explain one serious problem this confusion could cause (for example, giving a customer the wrong refund information) and propose a solution that makes it easy for the team to find and use the latest documents.', minWords: 120, maxWords: 150, points: 13}
      ]
    },
    // Part 4 – Speaking: four tasks, one rubric for the section (4 criteria × 1–5 = 20 points)
    speaking: {
      points: 20,
      tasks: [
        {key: 'S1', title: 'Task 1 – Warm-up (3 phút · A1–A2)', prompt: 'The examiner asks:\n1. What do you do?\n2. What are your main responsibilities?\n3. What English do you use at work?\n4. What is one situation in which you find English difficult?', hint: 'Trả lời lần lượt 4 câu hỏi, mỗi câu 2–4 câu nói.'},
        {key: 'S2', title: 'Task 2 – Data description (4 phút · B1–B2)', prompt: 'You are in a team meeting. The table shows the number of customer complaints in the last three quarters. You have 30 seconds to look at the data. Then speak for 1–2 minutes:\n1. Summarise the main trend in the numbers.\n2. Point out the biggest change in Q3.\n3. Suggest one short-term action the team should take to deal with the Q3 problem.', table: {head: ['Quarter', 'Total complaints', 'Most common issue'], rows: [['Q1', '120', 'Delayed shipping'], ['Q2', '115', 'Delayed shipping'], ['Q3', '280', 'Software bugs']]}, hint: 'Dùng từ vựng mô tả số liệu: increase, decrease, remain stable, the biggest change…'},
        {key: 'S3', title: 'Task 3 – Roleplay (4 phút · B2–C1)', prompt: 'You are a Customer Care Specialist. The examiner plays a customer who is very upset because the refund has not arrived, although the promised deadline of 5 business days has passed. Your job: listen and calm the customer politely; explain tactfully that the accounting system has a technical error so the transfer is stuck; commit to a clear solution (for example, manual processing within the next 24 hours and a confirmation email).\n\nThe examiner starts: "Excuse me, I am extremely frustrated. I was promised my refund would be in my account by last Friday, and it is still not here! What is going on?"', hint: 'Xoa dịu → giải thích khéo → cam kết giải pháp rõ ràng. Ghi âm phần trả lời của bạn như đang nói với khách hàng.'},
        {key: 'S4', title: 'Task 4 – Monologue (4 phút · B2–C2)', prompt: 'Your company is considering creating a centralized internal knowledge platform where employees can find procedures, FAQs and examples of previous cases. You have 1 minute to prepare and 2–3 minutes to present your view on the benefits and the challenges of this new system.', hint: 'Nêu ít nhất 2 lợi ích và 2 thách thức, có ví dụ; kết luận quan điểm của bạn.'}
      ]
    }
  },
  // Form B: parallel to A (same structure, points and difficulty curve, different content). The final test uses the form the learner did not get at placement.
  B: {
    title: 'Workplace English CEFR Placement Test (Form B)',
    listening: {
      intro: 'Mỗi phần nghe được phát tối đa 2 lần (giọng đọc của trình duyệt). Nghe xong chọn đáp án.',
      parts: [
        {key: 'LA', title: 'Part A – Thông báo chuyển văn phòng', instruction: 'Listen to the office manager\'s announcement and answer questions 1–5.', audio: [['Office manager', 'Hello everyone. As you know, our team is moving to the fourth floor next Monday. Please pack your things on Friday afternoon and put a label with your name on every box. The IT team will move the computers on Saturday, so please shut down your computer before you leave on Friday. If you need more boxes, ask Linh at reception.'], ['Employee', 'Will we have the same desks?'], ['Office manager', 'No, the new floor has an open plan, so you can choose any desk in our area.']],
          questions: [mcq('When is the team moving?', ['This Friday', 'Next Monday', 'Next Friday', 'Saturday'], 1, 1), mcq('Which floor is the team moving to?', ['The second floor', 'The third floor', 'The fourth floor', 'The fifth floor'], 2, 1), mcq('What should employees put on each box?', ['A number', 'The floor name', 'A label with their name', 'The date'], 2, 1), mcq('Who should employees ask for more boxes?', ['The IT team', 'Linh', 'The office manager', 'Their team leader'], 1, 1), mcq('What is different about the new floor?', ['It has no windows.', 'It is an open plan.', 'It has fewer desks.', 'It is on the ground floor.'], 1, 1)]},
        {key: 'LB', title: 'Part B – Hội thoại về đơn hàng bị trễ', instruction: 'Listen to a conversation between a team leader and an employee and answer questions 6–10.', audio: [['Employee', 'Hi Minh, do you have a moment? The supplier just told me the equipment will arrive two weeks late.'], ['Team leader', 'Two weeks? That is a problem. The client expects the installation on the fifteenth.'], ['Employee', 'I know. Should I tell the client now, or wait until we have a new date?'], ['Team leader', 'Tell them today. Clients accept a delay much more easily when they hear about it early. But before you call, check whether another supplier can deliver sooner.'], ['Employee', 'I asked one this morning. They can deliver in five days, but the price is about ten percent higher.'], ['Team leader', 'Then send me the two options with the costs, and I will decide this afternoon. In the meantime, prepare a short message for the client explaining the situation.'], ['Employee', 'Okay, I will have it ready by two.']],
          questions: [mcq('What is the problem?', ['The client has cancelled the order.', 'The equipment will arrive late.', 'The installation team is not available.', 'The price has increased.'], 1, 2), mcq('When does the client expect the installation?', ['On the fifth', 'On the tenth', 'On the fifteenth', 'In two weeks'], 2, 2), mcq('What does the team leader say about informing the client?', ['Wait until there is a new date.', 'Tell the client as soon as possible.', 'Let the supplier contact the client.', 'Only tell the client if the delay is confirmed.'], 1, 2), mcq('What is the disadvantage of the second supplier?', ['It is slower.', 'It is more expensive.', 'It is not reliable.', 'It is in another country.'], 1, 2), mcq('What will the team leader do this afternoon?', ['Call the client', 'Visit the supplier', 'Decide between the two options', 'Cancel the order'], 2, 2)]},
        {key: 'LC', title: 'Part C – Thảo luận về công cụ quản lý dự án mới', instruction: 'Listen to a short discussion between two colleagues about a new project-management tool and answer questions 11–15.', audio: [['Hoa', 'Have you tried the new project-management tool yet?'], ['David', 'I have. The dashboard is useful because everyone can see who is working on what, and the client can follow progress without asking us for updates all the time.'], ['Hoa', 'That is true, but I worry that people will spend more time updating the tool than doing the actual work. On my last project, the team stopped updating it after two weeks because it took too long.'], ['David', 'That happens when the tool is too detailed. If we only track the tasks that matter to the client and keep the rest in our team notes, the updates should take a few minutes a day.'], ['Hoa', 'So you are suggesting we agree on what goes into the tool before we start?'], ['David', 'Exactly. And we should review it after the first month. If the team is not using it, the tool is not helping anyone.']],
          questions: [mcq('What is the main topic of the discussion?', ['Hiring a new project manager', 'How to use a new project-management tool well', 'Problems with the client', 'The cost of software'], 1, 2), mcq('What advantage does David mention?', ['The tool is free.', 'The client can follow progress directly.', 'The team can work fewer hours.', 'Meetings are no longer needed.'], 1, 2), mcq('What concern does Hoa raise?', ['The tool may be too expensive.', 'The client may see confidential data.', 'Updating the tool may take too much time.', 'The team may not understand the tool.'], 2, 2), mcq('What does David suggest?', ['Tracking every task in detail', 'Tracking only the tasks that matter to the client', 'Replacing the tool with team notes', 'Asking the client to update the tool'], 1, 2), mcq('What can be inferred about both speakers?', ['They refuse to use the tool.', 'They think the tool can work if it is used carefully.', 'They believe the client should choose the tool.', 'They think the old tool was better.'], 1, 2)]}
      ]
    },
    reading: {
      parts: [
        {key: 'RA', title: 'Part A – Thông báo nội bộ', instruction: 'Read the notice and answer questions 1–5.', text: 'Subject: New Visitor Badges\n\nHi all,\n\nFrom next Monday, all visitors must wear a visitor badge while they are in the building. You can collect badges at reception before your guest arrives. Please return the badge to reception when your visitor leaves.\n\nIf your visitor stays for more than one day, please send their name and the dates to security@company.com at least one day in advance.\n\nThanks,\nMai (Office Services)',
          questions: [mcq('When does the new rule start?', ['Today', 'Next Monday', 'Next month', 'Next Friday'], 1, 1), mcq('Where can employees collect the badges?', ['At security', 'At reception', 'From Mai', 'From their manager'], 1, 1), mcq('What should employees do when the visitor leaves?', ['Keep the badge', 'Email security', 'Return the badge to reception', 'Sign a form'], 2, 1), mcq('What must employees do for a visitor who stays more than one day?', ['Pay a fee', 'Email security in advance', 'Ask Mai for permission', 'Give the visitor a key'], 1, 1), mcq('Who wrote the notice?', ['The security team', 'The reception', 'Mai from Office Services', 'The IT department'], 2, 1)]},
        {key: 'RB', title: 'Part B – Quy trình', instruction: 'Read the procedure and answer questions 6–10.', text: 'Requesting Equipment\n\nEmployees who need new equipment, such as a laptop, monitor or headset, should first check the shared equipment list to see whether a spare item is available. If a spare item is available, employees can book it directly in the list and collect it from the IT room.\n\nIf no spare item is available, employees should submit a request form to their team leader. The team leader checks that the request is necessary for the employee\'s work and forwards it to the IT department. The IT department orders standard items within three working days. Non-standard items require approval from the department head and may take longer.\n\nAll equipment remains the property of the company and must be returned when the employee changes role or leaves.',
          questions: [mcq('What should employees do first?', ['Submit a request form', 'Ask the IT department', 'Check the shared equipment list', 'Contact the department head'], 2, 2), mcq('Who checks that a request is necessary?', ['The IT department', 'The team leader', 'The department head', 'The employee'], 1, 2), mcq('How long does it take to order a standard item?', ['One day', 'Three working days', 'One week', 'It depends on the supplier'], 1, 2), mcq('What is different about non-standard items?', ['They are free.', 'They need approval from the department head.', 'They cannot be ordered.', 'They are delivered faster.'], 1, 2), mcq('Which statement best summarizes the procedure?', ['Employees may buy their own equipment.', 'Equipment requests go through checks before they are ordered and the items stay company property.', 'Only team leaders can use company equipment.', 'All equipment must be returned every month.'], 1, 2)]},
        {key: 'RC', title: 'Part C – Bài viết', instruction: 'Read the following text and answer questions 11–15.', text: 'Onboarding New Colleagues Remotely\n\nWhen new employees join a company, the first weeks shape how quickly they become productive and how connected they feel to the team. In an office, much of this happens informally: a new colleague overhears how a problem is solved, asks a quick question at the next desk, or joins a lunch conversation. When onboarding takes place remotely, these informal moments largely disappear, and organizations have to recreate them deliberately.\n\nSeveral practices help. Assigning a "buddy" who is not the manager gives the newcomer someone to ask the small questions they might not want to raise with their boss. Short, scheduled check-ins during the first month replace the casual conversations that would otherwise happen naturally. Clear written documentation of tools, processes and expectations reduces the number of questions in the first place. However, documentation alone is not enough: newcomers also need opportunities to observe how experienced colleagues actually work, for example by joining meetings as observers before they take on tasks themselves.\n\nThe common thread is intention. Remote onboarding fails not because the distance is too great, but because teams assume that what happened by itself in the office will also happen by itself online.',
          questions: [mcq('Why are the first weeks important according to the text?', ['New employees decide their salary then.', 'They influence productivity and the feeling of belonging.', 'Managers evaluate employees then.', 'Training budgets are set then.'], 1, 2), mcq('What is lost when onboarding is remote?', ['Access to documentation', 'Informal learning moments', 'Scheduled meetings', 'Technical equipment'], 1, 2), mcq('Why should the buddy not be the manager?', ['Managers are too busy.', 'Newcomers may hesitate to ask their boss small questions.', 'Managers do not know the tools.', 'Buddies are paid extra.'], 1, 2), mcq('What does "documentation alone is not enough" imply?', ['Documentation should be removed.', 'Newcomers also need to see real work in practice.', 'Documentation is too expensive.', 'Only managers should write documentation.'], 1, 2), mcq('What is the author\'s main argument?', ['Remote onboarding cannot succeed.', 'Remote onboarding works when teams deliberately recreate what the office provided naturally.', 'Offices are no longer necessary.', 'New employees should onboard themselves.'], 1, 2)]}
      ]
    },
    writing: {
      task: 'Your team has many meetings every week, and several colleagues say they do not have enough time for focused work. Your manager has sent you this message:',
      message: 'Hi,\nI have heard that the number of meetings is becoming a problem for the team. Could you write a short message describing one problem the meetings cause and suggesting what we could change to give people more time for focused work?',
      requirement: 'Please write 150–200 words.', minWords: 150, maxWords: 200
    },
    speaking: {
      tasks: [
        {key: 'S1', title: 'Task 1 – Interview (3 phút)', prompt: 'The examiner asks:\n1. What do you do?\n2. What does a typical week look like for you?\n3. Who do you speak or write English with at work?\n4. What would you like to do better in English?', hint: 'Trả lời lần lượt 4 câu hỏi, mỗi câu 2–4 câu nói.'},
        {key: 'S2', title: 'Task 2 – Scenario (5 phút)', prompt: 'A client asks you to finish a piece of work by Friday, but you know your team cannot finish it before the following Wednesday. Your manager is in a meeting all day. Explain what you would say to the client and what you would do next.', hint: 'Nêu các bước bạn sẽ làm và lý do.'},
        {key: 'S3', title: 'Task 3 – Discussion (7 phút)', prompt: 'Your company is considering letting employees choose their own working hours, as long as they are available for team meetings between 10:00 and 15:00. Discuss the possible benefits and challenges of this policy for the team and for clients.', hint: 'Nêu ít nhất 2 lợi ích và 2 thách thức, có ví dụ.'}
      ]
    }
  }
};

// ===== [DATA] Season personas (formal / informal) and relevance rules =====
const PERSONAS = {informal: ['Thân thiện', 'Informal', 'Giọng đồng nghiệp thân ở bàn bên: câu ngắn, dạng rút gọn (I\'m, don\'t), mở đầu bằng phản ứng tự nhiên, 1 emoji/lượt, hỏi ngắn kiểu "What about you?". Tình huống: trò chuyện hằng ngày, tin nhắn nhanh, giờ nghỉ. Vẫn yêu cầu bạn viết câu đầy đủ – thân thiện không phải cộc lốc.'], formal: ['Trang trọng', 'Formal', 'Giọng chuyên viên đào tạo lịch sự: câu đầy đủ, không rút gọn, không emoji / dấu chấm than, khen ngắn gọn khách quan ("That is correct."), hỏi bằng "Could you…?". Tình huống: email khách hàng, họp, báo cáo, nói với quản lý.']};
const personaOf = u => u?.persona === 'formal' ? 'formal' : 'informal';
// The persona block is written as hard MUST / MUST NOT rules with an example reply, and it is placed first and repeated last in the prompt: a one-line hint at the end was too weak to change the model's tone.
const personaNote = p => p === 'formal'
  ? `\n=== PERSONA: FORMAL (this overrides every other tone instruction, including "friendly") ===
Season speaks like a courteous corporate trainer talking to a colleague in a client meeting.
REGISTER – MUST: complete sentences of 8–20 words; NO contractions (write "I am", "do not", "that is", "you are"); open with a neutral acknowledgement ("Thank you, Lan.", "I see.", "Understood."); questions as indirect requests ("Could you tell me…?", "Would you mind describing…?", "May I ask…?"); praise measured and specific ("That is correct.", "That is a clear explanation of your role."); corrections introduced politely ("One small point:", "A more natural way to say this is…"); vocabulary of formal work: colleague (not buddy), supervisor/manager (not boss), confirm, schedule, inform, discuss, propose; situations: emails to clients, meetings, status reports, speaking with a manager or a partner.
MUST NOT: emoji, exclamation marks, slang or idioms ("no worries", "stuff", "cool", "awesome", "gonna", "kind of"), interjections ("Hey", "Hi there", "Wow", "Oh"), jokes, nicknames, questions tagged on with "right?" / "huh?", more than one question per reply.
Address: the learner's first name once per reply at most, never "dear" or "my friend".
Vietnamese text (explanations, feedback, relevanceNote): trang trọng, xưng "bạn", dùng "vui lòng", "xin lưu ý", "nên"; KHÔNG dùng "nhé", "nha", "nè", "nhen", "ok", "siêu", emoji.
Example reply 1: "Thank you, Lan. That is a clear introduction. Could you tell me which team you work with and what your main responsibilities are?"
Example reply 2 (correction): "I see. One small point: we say "responsible for testing", not "responsible of testing". Could you describe a typical task in your week?"
=== END PERSONA ===`
  : `\n=== PERSONA: INFORMAL (this overrides every other tone instruction) ===
Season speaks like a cheerful teammate chatting at the next desk during a coffee break.
REGISTER – MUST: short sentences (4–14 words); contractions everywhere ("I'm", "that's", "don't", "you're", "we've"); open with a short warm reaction ("Nice!", "Oh cool,", "Got it!", "Same here –"); exactly ONE emoji per reply, placed after the first sentence or at the end; casual questions ("What about you?", "How's that going?", "Anything fun this week?"); everyday vocabulary: teammate, boss, stuff, a lot, pretty (= quite), grab lunch, catch up; situations: desk chat, quick messages, lunch, Friday plans, small wins and annoyances at work.
MUST NOT: stiff phrases ("Could you please", "Thank you for your answer", "I would like to", "May I ask", "Kindly"), formal connectors ("furthermore", "therefore", "in addition"), long paragraphs, more than one emoji, more than one question per reply.
Address: the learner's first name in roughly every second reply, no titles.
Vietnamese text (explanations, feedback, relevanceNote): thân mật, xưng "bạn/mình", dùng "nhé", "nha", "nè", "ok"; không dùng "vui lòng", "xin lưu ý".
Informal does NOT excuse the learner's curtness: friendly means relaxed, COMPLETE sentences; one-word or bare-keyword replies are impolite and must be flagged, not praised.
Example reply 1: "Nice, Lan! So you're a tester 😊 Who do you work with most days?"
Example reply 2 (correction): "Got it! Tiny fix: it's "responsible for testing" 🙂 What's the trickiest thing you tested this week?"
=== END PERSONA ===`;
/** Last line of defence for the formal persona: remove emoji and exclamation marks the model may still produce. */
const personaText = (text, p) => p === 'formal' ? String(text || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/!+/g, '.').replace(/\s{2,}/g, ' ').replace(/\s+([.,?])/g, '$1').trim() : String(text || '');
/** Appended by code (so it also applies to an edited prompt): an answer that does not address the question must be caught, not graded as if it were fine. */
const RELEVANCE_RULE_COACH = `\n\nRELEVANCE CHECK (do this first): decide whether the learner's LAST message really responds to your previous message and is a genuine attempt in English. Set "relevant": false when it is off-topic, ignores your question, answers something else, is random or meaningless text, is filler only ("ok", "yes", "I don't know", "asdf"), or is not written in English. When "relevant" is false: rubric.meaning must be 0 or 1; "reply" must NOT continue the conversation as if the answer were fine – say in one short sentence that the message does not answer the question, then ask the same question again in simpler words; "relevanceNote" = the reason in the explanation language (max 20 words); "suggestions" may be empty. When "relevant" is true, "relevanceNote" is an empty string.
CURT ANSWERS ARE IMPOLITE, NOT "INFORMAL": a single word, a bare keyword, a list of words, "ok" / "yes" / "fine", or anything that is not at least one real sentence is rude in a work conversation whatever the persona. Treat it as "relevant": false, rubric.meaning = 0, and in "reply" ask (in the persona's tone) for a full sentence, giving a short example sentence. "Informal" means friendly, relaxed COMPLETE sentences – never curtness.
"usedWords": list the target vocabulary words (from the target list) that the learner used CORRECTLY in the last message – inside a real sentence, with the right meaning and grammar. A bare keyword, a word dropped into a list, slang, or a wrong usage does NOT count; when "relevant" is false the list is empty.`;
const RELEVANCE_RULE_GRADE = '\nKiểm tra trước tiên: câu trả lời có đúng yêu cầu của đề không. Nếu lạc đề, trả lời một câu hỏi khác, là chuỗi vô nghĩa, chỉ chép lại đề, hoặc không phải tiếng Anh thì ok = false, score tối đa 2, và feedback phải nói rõ câu trả lời chưa đúng yêu cầu của đề (kể cả khi câu đó đúng ngữ pháp).';

// ===== [DATA] Demo lessons & dictionaries =====
const DEMO_LESSONS = {
  A1: [
    {t: "I am + name / job", o: "Nói được tên và nghề của mình bằng 2 câu.", g: "1) Công thức: I am + tên / I am a + nghề (am = là; a = một). 2) Dùng khi tự giới thiệu. 3) Ví dụ: My name is Lan. (Tên tôi là Lan.) I am a tester. (Tôi là nhân viên kiểm thử.) This is my job. (Đây là công việc của tôi.)", ex: ["My name is Lan.", "I am a tester.", "This is my job."],
      v: [["job", "/dʒɒb/", "công việc", "my job", "a new job", "a good job", "noun", "work", "work, position", "", "jobless|adjective|thất nghiệp"], ["name", "/neɪm/", "tên", "my name", "first name", "your name", "noun", "word", "first name", "", "name|verb|đặt tên;nameless|adjective|không tên"], ["tester", "/ˈtestə/", "nhân viên kiểm thử", "a software tester", "a new tester", "work as a tester", "noun", "job", "QA engineer", "", "test|verb|kiểm thử;test|noun|bài kiểm thử"]], s: ["eɪ", "âm /eɪ/ như trong 'name'", "Mở miệng nói 'e' rồi lướt nhanh sang 'i'."],
      L: ["Hello. My name is Lan. I am a tester at GFT.", "What is Lan's job?", ["tester", "driver", "teacher", "designer"], 0], R: ["Hi, I am Nam. I am a designer. My job is fun.", "What is Nam's job?", ["designer", "tester", "manager", "driver"], 0], W: ["fill", "My ___ (tên) is Lan.", "name"], S: ["Nói to câu sau:", "My name is Lan and I am a tester."], U: ["job", "I have a new job.", "I job at GFT.", "I have a new jobs.", "She is a very job.", "Tôi có một công việc mới."],
      tr: ["Lan làm nghề gì?", "nhân viên kiểm thử", "Nam làm nghề gì?", "nhà thiết kế", "Tên tôi là Lan.", "tên", "Nói to câu sau.", "Tên tôi là Lan và tôi là nhân viên kiểm thử."]},
    {t: "I am from + place", o: "Hỏi và trả lời được mình đến từ đâu.", g: "1) Công thức: Where are you from? – I am from + nơi (from = từ, đến từ). 2) Dùng khi làm quen. 3) Ví dụ: I am from Hue. (Tôi đến từ Huế.) Nice to meet you. (Rất vui được gặp bạn.) I am new here. (Tôi là người mới ở đây.)", ex: ["I am from Hue.", "Nice to meet you.", "I am new here."],
      v: [["new", "/njuː/", "mới", "new here", "a new job", "a new team", "adjective", "time", "fresh", "old", "newly|adverb|vừa mới;news|noun|tin tức"], ["nice", "/naɪs/", "vui, dễ chịu", "nice to meet you", "a nice team", "a nice day", "adjective", "good", "good, kind", "bad", "nicely|adverb|một cách dễ chịu"], ["from", "/frɒm/", "từ, đến từ", "from Hue", "from Vietnam", "from my team", "preposition", "", "out of", "to", ""]], s: ["aɪ", "âm /aɪ/ như trong 'nice'", "Mở rộng miệng nói 'a' rồi lướt sang 'i'."],
      L: ["Hi, I am Mai. I am from a small town. I am new here and I am a tester.", "What is Mai's job?", ["She is a tester.", "She is a manager.", "She is a designer.", "She is a driver."], 0], R: ["Tom is new here. He is from a big city. He is nice to everyone.", "What is Tom like?", ["nice", "angry", "busy", "old"], 0], W: ["mcq", "Chọn câu đúng:", "I am from a small town.", ["I am from a small town.", "I from am a small town.", "I am a small town from.", "I am from in a small town."]], S: ["Nói to câu sau:", "I am new here. Nice to meet you."], U: ["new", "I am new here.", "I am a new.", "I new here.", "I am new to here work.", "Tôi là người mới ở đây."],
      tr: ["Mai làm nghề gì?", "Cô ấy là nhân viên kiểm thử.", "Tom là người thế nào?", "dễ chịu, tốt bụng", "Chọn câu đúng.", "Tôi đến từ một thị trấn nhỏ.", "Nói to câu sau.", "Tôi là người mới ở đây. Rất vui được gặp bạn."]},
    {t: "I work at / in", o: "Nói được mình làm ở đâu và trong nhóm nào.", g: "1) Công thức: I work at + công ty / I work in + phòng ban (work = làm việc). 2) Dùng khi nói nơi làm việc. 3) Ví dụ: I work at GFT. (Tôi làm ở GFT.) I work in the sales team. (Tôi làm trong nhóm bán hàng.) My office is big. (Văn phòng của tôi lớn.)", ex: ["I work at GFT.", "I work in the sales team.", "My office is big."],
      v: [["work", "/wɜːk/", "làm việc", "work at GFT", "work in a team", "work with you", "verb", "activity", "do a job", "rest", "worker|noun|người lao động;work|noun|công việc"], ["team", "/tiːm/", "nhóm", "my team", "the sales team", "a small team", "noun", "group", "group", "", "teammate|noun|đồng đội;teamwork|noun|làm việc nhóm"], ["office", "/ˈɒfɪs/", "văn phòng", "my office", "in the office", "a big office", "noun", "place", "workplace", "", "officer|noun|viên chức"]], s: ["ɜː", "âm /ɜː/ như trong 'work'", "Môi thả lỏng, kéo dài âm 'ơ', không cong lưỡi."],
      L: ["I work at GFT. I work in the test team. My team is small.", "Which team does the speaker work in?", ["the test team", "the sales team", "the design team", "the support team"], 0], R: ["Hoa works at GFT. She works in the sales team. Her office is big.", "What is Hoa's office like?", ["big", "small", "new", "old"], 0], W: ["fill", "I ___ (làm việc) at GFT.", "work"], S: ["Nói to câu sau:", "I work at GFT in the test team."], U: ["work", "I work at GFT.", "I am work at GFT.", "I work a GFT.", "I works at GFT.", "Tôi làm việc ở GFT."],
      tr: ["Người nói làm trong nhóm nào?", "nhóm kiểm thử", "Văn phòng của Hoa thế nào?", "lớn", "Tôi làm việc ở GFT.", "làm việc", "Nói to câu sau.", "Tôi làm ở GFT trong nhóm kiểm thử."]},
    {t: "on + day, at + time", o: "Nói được lịch làm việc với thứ và giờ.", g: "1) Công thức: on + thứ, at + giờ (on Monday = vào thứ Hai; at 9 = lúc 9 giờ). 2) Dùng khi nói lịch làm việc. 3) Ví dụ: I start at 8. (Tôi bắt đầu lúc 8 giờ.) We have a meeting on Monday. (Chúng tôi có cuộc họp vào thứ Hai.) I write a report on Friday. (Tôi viết báo cáo vào thứ Sáu.)", ex: ["I start at 8.", "We have a meeting on Monday.", "I write a report on Friday."],
      v: [["meeting", "/ˈmiːtɪŋ/", "cuộc họp", "have a meeting", "a team meeting", "a short meeting", "noun", "event", "call", "", "meet|verb|gặp"], ["start", "/stɑːt/", "bắt đầu", "start work", "start at 8", "start a meeting", "verb", "action", "begin", "stop, finish", "start|noun|sự bắt đầu;starter|noun|người khởi đầu"], ["report", "/rɪˈpɔːt/", "báo cáo", "write a report", "a short report", "send a report", "noun", "document", "update", "", "report|verb|báo cáo;reporter|noun|phóng viên"]], s: ["iː", "âm /iː/ như trong 'meeting'", "Kéo dài âm 'i', môi căng sang hai bên như đang cười."],
      L: ["We have a team meeting on Monday at 9.", "What time is the meeting?", ["at 9", "at 8", "at 10", "at 11"], 0], R: ["Work starts at 8. On Friday I write a short report.", "What does the writer do on Friday?", ["write a report", "have a meeting", "start a new job", "send an email"], 0], W: ["fill", "We have a meeting ___ (vào) Monday.", "on"], S: ["Nói to câu sau:", "We have a meeting on Monday at nine."], U: ["meeting", "We have a meeting on Monday.", "We meeting on Monday.", "We have a meet on Monday.", "We have meeting at on Monday.", "Chúng tôi có cuộc họp vào thứ Hai."],
      tr: ["Cuộc họp vào lúc mấy giờ?", "lúc 9 giờ", "Người viết làm gì vào thứ Sáu?", "viết báo cáo", "Chúng tôi có cuộc họp vào thứ Hai.", "vào", "Nói to câu sau.", "Chúng tôi có cuộc họp vào thứ Hai lúc chín giờ."]},
    {t: "I can / Can you…?", o: "Đề nghị giúp đỡ và nhờ người khác làm một việc.", g: "1) Công thức: I can + động từ / Can you + động từ? (can = có thể). 2) Dùng khi nói việc mình làm được hoặc nhờ ai đó. 3) Ví dụ: I can help you. (Tôi có thể giúp bạn.) Can you send the email? (Bạn gửi email được không?) I can check it today. (Tôi có thể kiểm tra nó hôm nay.)", ex: ["I can help you.", "Can you send the email?", "I can check it today."],
      v: [["help", "/help/", "giúp đỡ", "help you", "help the team", "need help", "verb", "action", "support", "", "helper|noun|người giúp;helpful|adjective|hữu ích"], ["send", "/send/", "gửi", "send an email", "send a report", "send it today", "verb", "action", "email", "receive", "sender|noun|người gửi"], ["check", "/tʃek/", "kiểm tra", "check the email", "check it today", "check the report", "verb", "action", "look at", "", "check|noun|sự kiểm tra;checklist|noun|danh sách kiểm tra"]], s: ["e", "âm /e/ như trong 'help'", "Miệng mở vừa, nói âm 'e' ngắn và dứt khoát."],
      L: ["Hi Lan. Can you send the report today? Thank you.", "What does the speaker ask Lan to do?", ["send the report", "check the email", "start a meeting", "help a customer"], 0], R: ["I am busy today. Can you help me? Can you check the email?", "What does the writer ask you to check?", ["the email", "the report", "the office", "the meeting"], 0], W: ["mcq", "Chọn câu đúng:", "I can help you.", ["I can help you.", "I can helps you.", "I can to help you.", "I can helping you."]], S: ["Nói to câu sau:", "I can help you with the report."], U: ["help", "Can you help me?", "Can you helps me?", "Can you help to me?", "Can you me help?", "Bạn giúp tôi được không?"],
      tr: ["Người nói nhờ Lan làm gì?", "gửi báo cáo", "Người viết nhờ kiểm tra cái gì?", "email", "Chọn câu đúng.", "Tôi có thể giúp bạn.", "Nói to câu sau.", "Tôi có thể giúp bạn làm báo cáo."]}
  ],
  A2: [
    {t: "I work in… as…", o: "Giới thiệu vai trò của mình bằng 3–4 câu.", g: "1) Công thức: I work in + phòng ban + as + a/an + nghề; I am in charge of + việc (in charge of = phụ trách). 2) Dùng khi giới thiệu vai trò với người mới. 3) Ví dụ: I work in sales as an executive. (Tôi làm ở phòng kinh doanh, vị trí chuyên viên.) I am in charge of customer emails. (Tôi phụ trách email khách hàng.) This is my colleague, Mai. (Đây là đồng nghiệp của tôi, Mai.)", ex: ["I work in sales as an executive.", "I am in charge of customer emails.", "This is my colleague, Mai."],
      v: [["colleague", "/ˈkɒliːɡ/", "đồng nghiệp", "a new colleague", "my colleague", "help a colleague", "noun", "person", "co-worker", "", "collegial|adjective|thân thiện như đồng nghiệp"], ["in charge of", "/ɪn tʃɑːdʒ əv/", "phụ trách", "in charge of testing", "in charge of the team", "in charge of sales", "phrase", "", "responsible for", "", ""], ["customer", "/ˈkʌstəmə/", "khách hàng", "a new customer", "customer emails", "help a customer", "noun", "person", "client", "seller", ""]], s: ["tʃ", "âm /tʃ/ như trong 'charge'", "Đặt lưỡi như âm 't' rồi bật hơi thành 'ch'."],
      L: ["Good morning. I am Binh. I work in sales and I am in charge of customer emails.", "What is Binh in charge of?", ["customer emails", "the budget", "testing", "the website"], 0], R: ["This is my colleague, Mai. She works in marketing as a designer. She is in charge of our website.", "What is Mai in charge of?", ["the website", "customer emails", "the sales team", "the budget"], 0], W: ["fill", "I am in ___ (phụ trách) of testing.", "charge"], S: ["Nói to câu sau:", "I work in sales and I am in charge of customer emails."], U: ["colleague", "This is my colleague, Mai.", "This is my colleague Mai is.", "I colleague with Mai.", "Mai is very colleague.", "Đây là đồng nghiệp của tôi, Mai."],
      tr: ["Bình phụ trách việc gì?", "email khách hàng", "Mai phụ trách cái gì?", "trang web", "Tôi phụ trách việc kiểm thử.", "phụ trách", "Nói to câu sau.", "Tôi làm ở phòng kinh doanh và phụ trách email khách hàng."]},
    {t: "Past simple: I joined…", o: "Kể ngắn về quá trình làm việc bằng thì quá khứ đơn.", g: "1) Công thức: chủ ngữ + động từ thêm -ed + thời gian (joined = đã gia nhập; worked = đã làm). 2) Dùng cho việc đã xong trong quá khứ. 3) Ví dụ: I joined GFT in 2024. (Tôi vào GFT năm 2024.) I worked on a big project last year. (Năm ngoái tôi làm một dự án lớn.) We finished it in May. (Chúng tôi hoàn thành nó vào tháng Năm.)", ex: ["I joined GFT in 2024.", "I worked on a big project last year.", "We finished it in May."],
      v: [["join", "/dʒɔɪn/", "gia nhập", "join the team", "join a meeting", "join the company", "verb", "action", "become part of", "leave", ""], ["project", "/ˈprɒdʒekt/", "dự án", "a big project", "a new project", "work on a project", "noun", "work", "assignment", "", "projector|noun|máy chiếu"], ["finish", "/ˈfɪnɪʃ/", "hoàn thành", "finish the project", "finish a report", "finish on time", "verb", "action", "complete", "start", "finished|adjective|đã xong"]], s: ["dʒ", "âm /dʒ/ như trong 'join'", "Giống âm 'ch' nhưng rung cổ họng."],
      L: ["I joined GFT in 2023. Last year I worked on a banking project.", "When did the speaker join GFT?", ["in 2023", "in 2022", "in 2024", "in 2021"], 0], R: ["Hoa joined the team in March. She worked on a new project and finished it in June.", "When did Hoa finish the project?", ["in June", "in March", "in May", "in April"], 0], W: ["fill", "I ___ (đã gia nhập) GFT in 2024.", "joined"], S: ["Nói to câu sau:", "I joined GFT in 2024 and worked on a big project."], U: ["join", "I joined the team in May.", "I joined in the team in May.", "I was join the team in May.", "The team joined me very.", "Tôi gia nhập nhóm vào tháng Năm."],
      tr: ["Người nói vào GFT năm nào?", "năm 2023", "Hoa hoàn thành dự án khi nào?", "vào tháng Sáu", "Tôi đã vào GFT năm 2024.", "đã gia nhập", "Nói to câu sau.", "Tôi vào GFT năm 2024 và đã làm một dự án lớn."]},
    {t: "What do you do?", o: "Hỏi được về công việc của người khác.", g: "1) Công thức: What do you do? / Do you + động từ? / Who do you report to? (report to = báo cáo cho). 2) Dùng khi hỏi về công việc của người khác. 3) Ví dụ: What do you do? (Bạn làm nghề gì?) I report to the sales manager. (Tôi báo cáo cho trưởng phòng kinh doanh.) The deadline is Friday. (Hạn chót là thứ Sáu.)", ex: ["What do you do?", "I report to the sales manager.", "The deadline is Friday."],
      v: [["deadline", "/ˈdedlaɪn/", "hạn chót", "meet the deadline", "a tight deadline", "miss a deadline", "noun", "time", "due date", "", ""], ["manager", "/ˈmænɪdʒə/", "quản lý, trưởng phòng", "the sales manager", "a new manager", "ask the manager", "noun", "job", "boss", "employee", "manage|verb|quản lý;management|noun|ban quản lý"], ["report to", "/rɪˈpɔːt tuː/", "báo cáo cho", "report to the manager", "report to her", "report to the team lead", "phrase", "", "work under", "", ""]], s: ["æ", "âm /æ/ như trong 'manager'", "Mở miệng rộng, nói âm lai giữa 'a' và 'e'."],
      L: ["What do you do? I am in sales. I report to the sales manager.", "Who does the speaker report to?", ["the sales manager", "the customer", "the tester", "the designer"], 0], R: ["Minh is a tester. He reports to the QA manager. His deadline is Friday.", "When is Minh's deadline?", ["Friday", "Monday", "Sunday", "Wednesday"], 0], W: ["mcq", "Chọn câu hỏi đúng:", "What do you do?", ["What do you do?", "What you do?", "What does you do?", "What do you does?"]], S: ["Nói to câu sau:", "I report to the sales manager."], U: ["deadline", "The deadline is Friday.", "The deadline are Friday.", "We deadline on Friday.", "Friday is very deadline.", "Hạn chót là thứ Sáu."],
      tr: ["Người nói báo cáo cho ai?", "trưởng phòng kinh doanh", "Hạn chót của Minh là khi nào?", "thứ Sáu", "Chọn câu hỏi đúng.", "Bạn làm nghề gì?", "Nói to câu sau.", "Tôi báo cáo cho trưởng phòng kinh doanh."]},
    {t: "I am working on…", o: "Nói được việc mình đang làm lúc này.", g: "1) Công thức: am/is/are + động từ thêm -ing (am working = đang làm). 2) Dùng cho việc đang diễn ra lúc này hoặc trong giai đoạn này. 3) Ví dụ: I am working on a new website. (Tôi đang làm một trang web mới.) We are testing the app this week. (Tuần này chúng tôi đang kiểm thử ứng dụng.) She is writing an update. (Cô ấy đang viết bản cập nhật.)", ex: ["I am working on a new website.", "We are testing the app this week.", "She is writing an update."],
      v: [["update", "/ˈʌpdeɪt/", "bản cập nhật", "a short update", "send an update", "a weekly update", "noun", "document", "status report", "", "update|verb|cập nhật;updated|adjective|đã cập nhật"], ["website", "/ˈwebsaɪt/", "trang web", "a new website", "our website", "update the website", "noun", "product", "site", "", ""], ["app", "/æp/", "ứng dụng", "a mobile app", "test the app", "a new app", "noun", "product", "application", "", ""]], s: ["ŋ", "âm /ŋ/ ở cuối 'working'", "Âm 'ng' phát ra từ mũi, không bật âm 'g' ở cuối."],
      L: ["Hi team. This week I am testing the mobile app. Nam is writing the update.", "Who is writing the update?", ["Nam", "Lan", "the manager", "Mai"], 0], R: ["We are working on a new website. This week Mai is testing it.", "What is Mai doing this week?", ["testing the website", "writing an update", "joining a meeting", "calling a client"], 0], W: ["fill", "I am ___ (đang làm) on a new website.", "working"], S: ["Nói to câu sau:", "I am working on a new website this week."], U: ["update", "She is writing a short update.", "She is update a short.", "She updates is short.", "She is writing an update short very.", "Cô ấy đang viết một bản cập nhật ngắn."],
      tr: ["Ai đang viết bản cập nhật?", "Nam", "Tuần này Mai đang làm gì?", "kiểm thử trang web", "Tôi đang làm một trang web mới.", "đang làm", "Nói to câu sau.", "Tuần này tôi đang làm một trang web mới."]},
    {t: "be going to + verb", o: "Nói được kế hoạch công việc sắp tới.", g: "1) Công thức: am/is/are going to + động từ (going to = sẽ, dự định). 2) Dùng cho kế hoạch đã định. 3) Ví dụ: I am going to call the client tomorrow. (Ngày mai tôi sẽ gọi cho khách hàng.) We are going to plan the next week. (Chúng tôi sẽ lên kế hoạch cho tuần tới.) She is going to visit the office. (Cô ấy sẽ đến thăm văn phòng.)", ex: ["I am going to call the client tomorrow.", "We are going to plan the next week.", "She is going to visit the office."],
      v: [["client", "/ˈklaɪənt/", "khách hàng (doanh nghiệp)", "call the client", "a new client", "meet the client", "noun", "person", "customer", "supplier", ""], ["plan", "/plæn/", "lên kế hoạch", "plan the week", "plan a meeting", "a good plan", "verb", "action", "prepare", "", "plan|noun|kế hoạch;planner|noun|người lập kế hoạch"], ["visit", "/ˈvɪzɪt/", "đến thăm", "visit the office", "visit a client", "a short visit", "verb", "action", "go to", "leave", "visitor|noun|khách đến thăm;visit|noun|chuyến thăm"]], s: ["əʊ", "âm /əʊ/ như trong 'going'", "Bắt đầu bằng 'ơ' rồi tròn môi lướt sang 'u'."],
      L: ["Tomorrow I am going to call the client. Then we are going to plan the week.", "Who is the speaker going to call tomorrow?", ["the client", "the manager", "the tester", "the designer"], 0], R: ["Next week our client is going to visit the office. We are going to plan a short meeting.", "Who is going to visit the office next week?", ["the client", "the manager", "a new colleague", "the tester"], 0], W: ["mcq", "Chọn câu đúng:", "I am going to call the client.", ["I am going to call the client.", "I going to call the client.", "I am going call the client.", "I am go to call the client."]], S: ["Nói to câu sau:", "I am going to call the client tomorrow."], U: ["client", "I am going to meet the client tomorrow.", "I am going to client tomorrow.", "The client is very clienting.", "I am going to meet to the client tomorrow.", "Ngày mai tôi sẽ gặp khách hàng."],
      tr: ["Ngày mai người nói sẽ gọi cho ai?", "khách hàng", "Tuần tới ai sẽ đến văn phòng?", "khách hàng", "Chọn câu đúng.", "Tôi sẽ gọi cho khách hàng.", "Nói to câu sau.", "Ngày mai tôi sẽ gọi cho khách hàng."]}
  ],
  B1: [
    {t: "I have worked… since / for", o: "Say how long you have been in your role, using since and for.", g: "1) Pattern: have/has + past participle + since (a starting point) / for (a period). 2) Use it for a situation that started in the past and is still true. 3) Examples: I have worked at GFT since 2022. I have had this role for two years. My background is in accounting, and I have experience with banks.", ex: ["I have worked at GFT since 2022.", "I have had this role for two years.", "My background is in accounting."],
      v: [["role", "/rəʊl/", "vai trò", "my current role", "a new role", "a key role", "noun", "job", "position, duty", "", "role model|noun|hình mẫu", "job:A1;position:B1;function:B2;capacity:C1", "gig", ""], ["background", "/ˈbækɡraʊnd/", "nền tảng học vấn, kinh nghiệm", "a background in accounting", "my professional background", "a technical background", "noun", "experience", "history, training", "", "", "past:A2;history:B1;track record:B2;pedigree:C1", "", ""], ["experience", "/ɪkˈspɪəriəns/", "kinh nghiệm", "work experience", "three years of experience", "gain experience", "noun", "knowledge", "practice, skill", "inexperience", "experienced|adjective|có kinh nghiệm;experience|verb|trải qua", "practice:A2;know-how:B2;expertise:C1", "chops", ""]], s: ["əʊ", "the /əʊ/ sound in 'role'", "Start with a relaxed 'uh' and glide to a rounded 'oo'."],
      L: ["Hi, I am Chi. I have worked at GFT since 2022, and I have had my current role for one year.", "What can we infer about Chi's time at GFT?", ["She changed roles after joining the company.", "She joined GFT one year ago.", "She has had the same role since 2022.", "She has left GFT."], 0], R: ["Dung has a background in accounting. He has worked in software for five years and has a lot of experience with banks.", "What most likely explains Dung's experience with banks?", ["His accounting background suits banking clients.", "He studied software at a bank.", "He has worked in software for only one year.", "He has never worked with clients."], 0], W: ["fill", "I have worked here ___ (từ mốc thời gian) 2022.", "since"], S: ["Say this sentence aloud:", "I have worked at GFT since 2022."], U: ["role", "I have a new role in the team.", "I role the team now.", "My role is very roled.", "I have a new role of at the team.", "Tôi có vai trò mới trong nhóm."],
      tr: ["Có thể suy ra điều gì về thời gian Chi ở GFT?", "Cô ấy đã đổi vai trò sau khi vào công ty.", "Điều gì giải thích hợp lý nhất kinh nghiệm với ngân hàng của Dũng?", "Nền tảng kế toán của anh ấy hợp với khách hàng ngân hàng.", "Tôi đã làm ở đây từ năm 2022.", "từ (một mốc thời gian)", "Nói to câu sau.", "Tôi đã làm ở GFT từ năm 2022."]},
    {t: "I am responsible for…", o: "Describe your responsibilities clearly in a first meeting.", g: "1) Pattern: be responsible for + noun / verb-ing; deal with + noun. 2) Use it to explain what you take care of at work. 3) Examples: I am responsible for planning the tests. I deal with client questions every day. I keep every stakeholder informed.", ex: ["I am responsible for planning the tests.", "I deal with client questions every day.", "I keep every stakeholder informed."],
      v: [["responsible", "/rɪˈspɒnsəbl/", "chịu trách nhiệm", "responsible for testing", "responsible for the budget", "the person responsible", "adjective", "duty", "in charge, accountable", "irresponsible", "responsibility|noun|trách nhiệm;responsibly|adverb|một cách có trách nhiệm", "in charge:A2;accountable:B2;answerable:C1", "", ""], ["stakeholder", "/ˈsteɪkhəʊldə/", "bên liên quan", "a key stakeholder", "update every stakeholder", "a stakeholder meeting", "noun", "person", "partner, party", "", "", "partner:A2;party:B2;interested party:C1", "", ""], ["deal with", "/diːl wɪð/", "xử lý, giải quyết", "deal with questions", "deal with a problem", "deal with clients", "phrasal verb", "action", "handle, manage", "ignore", "", "handle:A2;manage:B1;tackle:B2;address:C1", "sort out", ""]], s: ["ɒ", "the /ɒ/ sound in 'responsible'", "Open your mouth and make a short, rounded 'o'."],
      L: ["I am the QA lead. I am responsible for planning the tests, and I deal with questions from the client.", "What can we infer about the speaker's job?", ["The client contacts the speaker directly.", "The speaker writes the application code.", "The speaker reports to the client's manager.", "The speaker never talks to the client."], 0], R: ["Hanh is responsible for the budget. She deals with suppliers and keeps the stakeholders informed every Friday.", "Why most likely does Hanh contact the stakeholders on Fridays?", ["To give a weekly update on spending.", "To hire new suppliers every week.", "Because she is a supplier herself.", "Because the budget changes daily."], 0], W: ["fill", "I am responsible ___ (về, cho) planning the tests.", "for"], S: ["Say this sentence aloud:", "I am responsible for planning the tests."], U: ["responsible", "She is responsible for the budget.", "She responsible the budget.", "She is responsible of the budget.", "She is responsibility for the budget.", "Cô ấy chịu trách nhiệm về ngân sách."],
      tr: ["Có thể suy ra điều gì về công việc của người nói?", "Khách hàng liên hệ trực tiếp với người nói.", "Vì sao Hạnh thường liên hệ các bên liên quan vào thứ Sáu?", "Để cập nhật hằng tuần về chi tiêu.", "Tôi chịu trách nhiệm lên kế hoạch kiểm thử.", "về, cho", "Nói to câu sau.", "Tôi chịu trách nhiệm lên kế hoạch kiểm thử."]},
    {t: "How is… going?", o: "Open and keep a short small-talk conversation going before a meeting.", g: "1) Pattern: How is + noun + going? / How was + noun? Then add a follow-up question. 2) Use it as a friendly opener before the meeting starts. 3) Examples: How is the new project going? It has been a hectic week since the launch. We can catch up after the call.", ex: ["How is the new project going?", "It has been a hectic week since the launch.", "We can catch up after the call."],
      v: [["hectic", "/ˈhektɪk/", "bận rộn, tất bật", "a hectic week", "a hectic schedule", "pretty hectic", "adjective", "busy", "busy, frantic", "calm, quiet", "", "busy:A1;full-on:B2;frenetic:C1", "crazy", ""], ["catch up", "/kætʃ ʌp/", "trò chuyện cập nhật", "catch up after the call", "catch up with a colleague", "catch up on emails", "phrasal verb", "talk", "chat, update each other", "", "", "talk:A1;chat:A2;touch base:B2", "hang out", ""], ["launch", "/lɔːntʃ/", "ra mắt", "launch a product", "a product launch", "launch the first version", "verb", "action", "release, start", "cancel", "launch|noun|buổi ra mắt", "start:A1;release:B1;roll out:B2;unveil:C1", "", ""]], s: ["ʌ", "the /ʌ/ sound in 'up'", "Keep your mouth relaxed and make a short 'uh'."],
      L: ["How is the new project going? Pretty hectic. We launched the first version on Monday.", "What can we infer about the speaker's week?", ["The launch made the week very busy.", "The project has not started yet.", "The team is on holiday.", "The launch was cancelled."], 0], R: ["It has been a hectic week for Chi. Her team launched a new app, so she wants to catch up with Dung after the call.", "Why most likely does Chi want to talk to Dung after the call?", ["She has had no time to update him during the launch.", "She wants to cancel the app.", "Dung launched the app without her.", "She is leaving the team."], 0], W: ["mcq", "Choose the correct question:", "How is the project going?", ["How is the project going?", "How the project is going?", "How does the project going?", "How is going the project?"]], S: ["Say this sentence aloud:", "How is the new project going?"], U: ["hectic", "It has been a hectic week.", "It has been a hectic.", "I hectic every day.", "The week was very hecticly.", "Tuần vừa rồi thật bận rộn."],
      tr: ["Có thể suy ra điều gì về tuần của người nói?", "Buổi ra mắt khiến tuần rất bận.", "Vì sao Chi muốn nói chuyện với Dũng sau cuộc gọi?", "Cô ấy chưa có thời gian cập nhật cho anh ấy trong lúc ra mắt.", "Chọn câu hỏi đúng.", "Dự án tiến triển thế nào rồi?", "Nói to câu sau.", "Dự án mới tiến triển thế nào rồi?"]},
    {t: "If…, I will…", o: "Make a clear commitment that depends on a condition.", g: "1) Pattern: If + present simple, will + verb. 2) Use it for a real possibility and what you will do about it. 3) Examples: If the client agrees, we will start on Monday. If there is a delay, I will let you know. We will confirm the schedule tomorrow.", ex: ["If the client agrees, we will start on Monday.", "If there is a delay, I will let you know.", "We will confirm the schedule tomorrow."],
      v: [["confirm", "/kənˈfɜːm/", "xác nhận", "confirm the schedule", "confirm a meeting", "confirm by email", "verb", "action", "verify, check", "cancel, deny", "confirmation|noun|sự xác nhận;confirmed|adjective|đã xác nhận", "check:A1;verify:B2;corroborate:C1", "", ""], ["delay", "/dɪˈleɪ/", "sự chậm trễ", "a short delay", "cause a delay", "without delay", "noun", "problem", "hold-up, postponement", "", "delay|verb|làm chậm;delayed|adjective|bị trễ", "wait:A1;hold-up:B2;setback:C1", "", ""], ["schedule", "/ˈʃedjuːl/", "lịch trình", "a tight schedule", "on schedule", "change the schedule", "noun", "plan", "timetable, plan", "", "schedule|verb|lên lịch;scheduled|adjective|đã lên lịch", "plan:A1;timetable:A2;agenda:B2;itinerary:C1", "", ""]], s: ["eɪ", "the /eɪ/ sound in 'delay'", "Start with 'e' and glide quickly to 'i'."],
      L: ["If there is a delay, I will let you know. We will confirm the schedule tomorrow.", "What can we infer about the schedule?", ["It is not final yet.", "It was confirmed yesterday.", "There has already been a delay.", "The speaker will not share any news."], 0], R: ["If the client agrees, the team will start on Monday. If there is a delay, Chi will confirm a new schedule by email.", "What does the start date depend on?", ["the client's decision", "Chi's email", "the weather on Monday", "the team's holiday"], 0], W: ["fill", "If there is a delay, I ___ (sẽ) let you know.", "will"], S: ["Say this sentence aloud:", "If there is a delay, I will let you know."], U: ["confirm", "Please confirm the meeting by email.", "Please confirmation the meeting.", "Please confirm to the meeting.", "The meeting is confirm by email.", "Vui lòng xác nhận cuộc họp qua email."],
      tr: ["Có thể suy ra điều gì về lịch trình?", "Lịch chưa chốt.", "Ngày bắt đầu phụ thuộc vào điều gì?", "quyết định của khách hàng", "Nếu có chậm trễ, tôi sẽ báo cho bạn.", "sẽ", "Nói to câu sau.", "Nếu có chậm trễ, tôi sẽ báo cho bạn."]},
    {t: "Passive: The report is sent…", o: "Describe a process without saying who does each step.", g: "1) Pattern: is/are + past participle (present simple passive). 2) Use it when the action matters more than the person. 3) Examples: The report is sent every Friday. Bugs are found in the review. The release is approved by the manager, so nobody else can approve it.", ex: ["The report is sent every Friday.", "Bugs are found in the review.", "The release is approved by the manager."],
      v: [["approve", "/əˈpruːv/", "phê duyệt", "approve the release", "approve a request", "approve the budget", "verb", "action", "accept, agree to", "reject", "approval|noun|sự phê duyệt;approved|adjective|đã duyệt", "agree:A1;accept:A2;sign off:B2;sanction:C1", "give the green light", ""], ["review", "/rɪˈvjuː/", "rà soát, xem xét", "review the report", "a code review", "review a request", "verb", "action", "check, examine", "ignore", "review|noun|bài đánh giá;reviewer|noun|người rà soát", "check:A1;examine:B2;scrutinise:C1", "", ""], ["release", "/rɪˈliːs/", "bản phát hành", "a new release", "the next release", "release notes", "noun", "product", "version, launch", "", "release|verb|phát hành", "version:A2;launch:B1;rollout:B2;deployment:C1", "", ""]], s: ["uː", "the /uː/ sound in 'review'", "Round your lips and hold a long 'oo'."],
      L: ["Every bug is reviewed by the QA team. Then the release is approved by the manager.", "What can we infer about the release process?", ["Nothing is released before the manager agrees.", "The QA team approves the release.", "Bugs are fixed after the release.", "The client reviews every bug."], 0], R: ["The weekly report is sent every Friday. It is reviewed by the team lead before it goes to the client.", "Why most likely does the team lead review the report first?", ["To check it before the client sees it.", "Because the client does not read reports.", "Because the report is sent on Monday.", "To write the report himself."], 0], W: ["mcq", "Choose the correct sentence:", "The report is sent every Friday.", ["The report is sent every Friday.", "The report is send every Friday.", "The report sent is every Friday.", "The report is sending every Friday."]], S: ["Say this sentence aloud:", "The release is approved by the manager."], U: ["approve", "The manager approved the release.", "The manager approval the release.", "The manager approved to the release.", "The release was approve by the manager.", "Người quản lý đã phê duyệt bản phát hành."],
      tr: ["Có thể suy ra điều gì về quy trình phát hành?", "Không có gì được phát hành trước khi quản lý đồng ý.", "Vì sao trưởng nhóm rà soát báo cáo trước?", "Để kiểm tra trước khi khách hàng xem.", "Chọn câu đúng.", "Báo cáo được gửi mỗi thứ Sáu.", "Nói to câu sau.", "Bản phát hành được người quản lý phê duyệt."]}
  ],
  B2: [
    {t: "I oversee… / I liaise with…", o: "Position your role and set expectations with a new client.", g: "1) Pattern: I oversee + noun; I liaise with + person + on + topic. 2) Use these verbs to describe senior coordination work precisely. 3) Examples: I oversee the delivery of three products. I liaise with your IT team on infrastructure. The scope covers web and mobile.", ex: ["I oversee the delivery of three products.", "I liaise with your IT team on infrastructure.", "The scope covers web and mobile."],
      v: [["oversee", "/ˌəʊvəˈsiː/", "giám sát, phụ trách chung", "oversee the delivery", "oversee a team", "oversee the budget", "verb", "manage", "supervise, manage", "", "oversight|noun|sự giám sát;overseer|noun|người giám sát", "lead:A2;supervise:B2;superintend:C1", "run the show", ""], ["liaise with", "/liˈeɪz wɪð/", "làm đầu mối trao đổi với", "liaise with the client", "liaise with suppliers", "liaise with your IT team", "phrasal verb", "communicate", "coordinate with, work with", "", "liaison|noun|đầu mối liên lạc", "talk to:A1;coordinate with:B2;interface with:C1", "", ""], ["scope", "/skəʊp/", "phạm vi", "the project scope", "within the scope", "out of scope", "noun", "plan", "range, extent", "", "scope|verb|xác định phạm vi", "size:A1;range:B1;extent:B2;remit:C1", "", "compass"]], s: ["iː", "the /iː/ sound in 'oversee'", "Stretch your lips and hold a long 'ee'."],
      L: ["Thanks for joining. I am Duc, and I will oversee this project. I liaise with your IT team every week.", "What can we infer about Duc's role?", ["He coordinates the project rather than doing every task himself.", "He is a member of the client's IT team.", "He joined the project only this week.", "He writes the code for the IT team."], 0], R: ["Duc oversees the delivery of three products. The scope of this project covers the web and mobile apps, but not the data migration.", "What can we infer about the data migration?", ["Someone else, or a later project, will handle it.", "It is the main deliverable of this project.", "Duc has already finished it.", "It is part of the mobile app."], 0], W: ["fill", "I liaise ___ (với) your IT team on infrastructure.", "with"], S: ["Say this sentence aloud:", "I will oversee this project from start to finish."], U: ["oversee", "She oversees the delivery of three products.", "She oversees to the delivery.", "She is oversee the delivery.", "The delivery oversees her.", "Cô ấy giám sát việc bàn giao ba sản phẩm."],
      tr: ["Có thể suy ra điều gì về vai trò của Đức?", "Anh ấy điều phối dự án chứ không tự làm mọi việc.", "Có thể suy ra điều gì về việc chuyển đổi dữ liệu?", "Người khác, hoặc một dự án sau, sẽ lo việc đó.", "Tôi là đầu mối trao đổi với nhóm IT của bạn về hạ tầng.", "với", "Nói to câu sau.", "Tôi sẽ phụ trách dự án này từ đầu đến cuối."]},
    {t: "If we had…, we would…", o: "Discuss a hypothetical option and its consequence.", g: "1) Pattern: If + past simple, would + verb. 2) Use it for an unlikely or imagined situation. 3) Examples: If we had a bigger budget, we would add a feature. If we had more testers, we would finish earlier. That would reduce the risk.", ex: ["If we had a bigger budget, we would add a feature.", "If we had more testers, we would finish earlier.", "That would reduce the risk."],
      v: [["risk", "/rɪsk/", "rủi ro", "reduce the risk", "a high risk", "take a risk", "noun", "danger", "danger, threat", "safety", "risky|adjective|rủi ro;risk|verb|liều", "danger:A2;threat:B2;hazard:B2;exposure:C1", "", "peril"], ["budget", "/ˈbʌdʒɪt/", "ngân sách", "a bigger budget", "within budget", "over budget", "noun", "money", "funds, allocation", "", "budget|verb|lập ngân sách;budgetary|adjective|thuộc ngân sách", "money:A1;funds:B1;allocation:B2;appropriation:C1", "", ""], ["feature", "/ˈfiːtʃə/", "tính năng", "add a feature", "a key feature", "a new feature", "noun", "function", "function, capability", "", "feature|verb|có (tính năng);featured|adjective|nổi bật", "part:A1;function:B1;capability:B2;functionality:C1", "", ""]], s: ["ʌ", "the /ʌ/ sound in 'budget'", "Keep your mouth relaxed and make a short 'uh'."],
      L: ["If we had two more testers, we would finish a week earlier. That would reduce the risk.", "What can we infer about the current situation?", ["The team does not have enough testers.", "The team has already finished.", "Two testers joined last week.", "There is no risk in the project."], 0], R: ["If the budget were bigger, the team would add a payment feature. For now, it stays out of scope to keep the risk low.", "What can we infer about the budget?", ["It is not big enough for the payment feature.", "It was increased last month.", "It only covers testing.", "It was spent on the payment feature."], 0], W: ["mcq", "Choose the correct sentence:", "If we had more time, we would test it again.", ["If we had more time, we would test it again.", "If we have more time, we would test it again.", "If we had more time, we will test it again.", "If we would have more time, we tested it again."]], S: ["Say this sentence aloud:", "If we had more testers, we would finish earlier."], U: ["risk", "That would reduce the risk.", "That would risk the reduce.", "That would reduce the risky.", "That is very risk.", "Điều đó sẽ giảm rủi ro."],
      tr: ["Có thể suy ra điều gì về tình hình hiện tại?", "Nhóm không có đủ kiểm thử viên.", "Có thể suy ra điều gì về ngân sách?", "Ngân sách không đủ cho tính năng thanh toán.", "Chọn câu đúng.", "Nếu có thêm thời gian, chúng tôi sẽ kiểm thử lại.", "Nói to câu sau.", "Nếu có thêm kiểm thử viên, chúng tôi sẽ xong sớm hơn."]},
    {t: "The client said that…", o: "Report what a client said accurately in a status update.", g: "1) Pattern: said (that) + clause, with the verb moved one step back in time. 2) Use it to pass on what someone told you. 3) Examples: The client said that the deadline was fixed. She told us that the feedback was positive. They said they would raise a concern on Friday.", ex: ["The client said that the deadline was fixed.", "She told us that the feedback was positive.", "They said they would raise a concern on Friday."],
      v: [["concern", "/kənˈsɜːn/", "mối lo ngại", "raise a concern", "a major concern", "address a concern", "noun", "problem", "worry, issue", "confidence", "concerned|adjective|lo lắng;concerning|adjective|đáng lo", "worry:A2;issue:B1;reservation:B2;apprehension:C1", "", "disquiet"], ["feedback", "/ˈfiːdbæk/", "phản hồi", "positive feedback", "give feedback", "client feedback", "noun", "information", "comments, response", "", "", "comments:A2;response:B1;input:B2;critique:C1", "", ""], ["deadline", "/ˈdedlaɪn/", "hạn chót", "a fixed deadline", "meet the deadline", "extend the deadline", "noun", "time", "due date, cut-off", "", "", "date:A1;due date:B1;cut-off:B2;time limit:B2", "crunch time", ""]], s: ["ɜː", "the /ɜː/ sound in 'concern'", "Relax your lips and hold a long 'er' without curling your tongue."],
      L: ["The client said that the feedback was positive. However, she told us that the deadline was fixed.", "What does the word 'however' suggest about the deadline?", ["The team had hoped to move it.", "The client extended it.", "The feedback was negative.", "The deadline was missed."], 0], R: ["In the call, the product owner said they had one concern: the checkout page was too slow. She said they would send detailed feedback by Friday.", "What can we infer about the product owner's overall view?", ["She is mostly satisfied apart from one issue.", "She wants to cancel the project.", "She has many serious complaints.", "She has not tested the checkout page."], 0], W: ["fill", "The client said that the deadline ___ (dạng quá khứ của 'is') fixed.", "was"], S: ["Say this sentence aloud:", "The client said that the feedback was positive."], U: ["concern", "She raised a concern about the deadline.", "She concerned a raise about the deadline.", "She is very concern about it.", "She raised concern a deadline.", "Cô ấy nêu một mối lo ngại về hạn chót."],
      tr: ["Từ 'however' gợi ý điều gì về hạn chót?", "Nhóm đã hy vọng dời được hạn.", "Có thể suy ra điều gì về cái nhìn chung của chủ sản phẩm?", "Cô ấy khá hài lòng, chỉ trừ một vấn đề.", "Khách hàng nói rằng hạn chót là cố định.", "là (ở thì quá khứ)", "Nói to câu sau.", "Khách hàng nói rằng phản hồi là tích cực."]},
    {t: "I would suggest + -ing", o: "Make a diplomatic recommendation and justify it.", g: "1) Pattern: I would suggest + verb-ing; I recommend that we + verb. 2) Use it to propose a change politely. 3) Examples: I would suggest that we postpone the release. I recommend that we prioritise the login fix. That is the safest alternative.", ex: ["I would suggest that we postpone the release.", "I recommend that we prioritise the login fix.", "That is the safest alternative."],
      v: [["postpone", "/pəʊstˈpəʊn/", "hoãn lại", "postpone the release", "postpone a meeting", "postpone until Monday", "verb", "action", "delay, put off", "bring forward", "postponement|noun|sự trì hoãn", "move:A1;delay:A2;put off:B1;defer:C1", "push back", ""], ["prioritise", "/praɪˈɒrɪtaɪz/", "ưu tiên", "prioritise the fix", "prioritise tasks", "prioritise quality", "verb", "action", "rank, put first", "neglect", "priority|noun|ưu tiên;prioritisation|noun|việc sắp xếp ưu tiên", "choose:A1;put first:B1;rank:B2;triage:C1", "", ""], ["alternative", "/ɔːlˈtɜːnətɪv/", "phương án thay thế", "a safer alternative", "an alternative plan", "no alternative", "noun", "option", "option, choice", "", "alternative|adjective|thay thế;alternatively|adverb|hoặc là", "choice:A1;option:A2;substitute:B2;fallback:C1", "plan B", ""]], s: ["aɪ", "the /aɪ/ sound in 'prioritise'", "Open your mouth for 'a' and glide to 'i'."],
      L: ["I would suggest postponing the release by one week. I recommend that we prioritise the login fix first.", "What can we infer about the login fix?", ["It is not ready yet and blocks the release.", "It was finished last week.", "It is not important to the speaker.", "The client asked to remove it."], 0], R: ["Releasing on Friday is risky. A safer alternative is to postpone the release until Monday and prioritise the two critical bugs.", "What can we infer about the two critical bugs?", ["They are not fixed yet.", "They were fixed on Friday.", "They are not related to the release.", "They were reported by the client on Monday."], 0], W: ["mcq", "Choose the correct sentence:", "I would suggest postponing the release.", ["I would suggest postponing the release.", "I would suggest to postpone the release.", "I would suggest postpone the release.", "I would suggest that postponing the release."]], S: ["Say this sentence aloud:", "I would suggest postponing the release by one week."], U: ["postpone", "We decided to postpone the release.", "We decided to postpone to the release.", "We decided the release postpone.", "The release was postponement by us.", "Chúng tôi quyết định hoãn bản phát hành."],
      tr: ["Có thể suy ra điều gì về bản sửa lỗi đăng nhập?", "Nó chưa xong và đang chặn bản phát hành.", "Có thể suy ra điều gì về hai lỗi nghiêm trọng?", "Chúng chưa được sửa.", "Chọn câu đúng.", "Tôi đề nghị hoãn bản phát hành.", "Nói to câu sau.", "Tôi đề nghị hoãn bản phát hành một tuần."]},
    {t: "We have been working on…", o: "Summarise ongoing work and its current status.", g: "1) Pattern: have/has been + verb-ing + for/since. 2) Use it for an activity that started earlier and is still in progress. 3) Examples: We have been working on the migration for three weeks. The team has been tracking a performance issue. We have reached the first milestone.", ex: ["We have been working on the migration for three weeks.", "The team has been tracking a performance issue.", "We have reached the first milestone."],
      v: [["issue", "/ˈɪʃuː/", "vấn đề", "a performance issue", "track an issue", "resolve the issue", "noun", "problem", "problem, bug", "solution", "issue|verb|phát hành, đưa ra", "problem:A1;bug:B1;defect:B2;anomaly:C1", "glitch", ""], ["migration", "/maɪˈɡreɪʃn/", "việc chuyển đổi (dữ liệu, hệ thống)", "data migration", "the migration plan", "complete the migration", "noun", "process", "transfer, move", "", "migrate|verb|chuyển đổi;migrated|adjective|đã chuyển", "move:A1;transfer:B1;transition:B2;porting:C1", "", ""], ["milestone", "/ˈmaɪlstəʊn/", "cột mốc", "reach a milestone", "the first milestone", "a key milestone", "noun", "goal", "target, checkpoint", "", "", "goal:A2;target:B1;checkpoint:B2;landmark:C1", "", ""]], s: ["ʃ", "the /ʃ/ sound in 'issue'", "Round your lips slightly and push air out: 'sh'."],
      L: ["We have been working on the data migration for three weeks. Yesterday we reached the first milestone.", "What can we infer about the migration?", ["It is still in progress with more milestones ahead.", "It was completed yesterday.", "It started yesterday.", "It has been cancelled."], 0], R: ["The team has been tracking a performance issue since Monday. It does not block the next milestone, but it needs to be resolved before the release.", "What can we infer about the performance issue?", ["It is important but not urgent for the next milestone.", "It has already been resolved.", "It will delay the next milestone.", "It was found after the release."], 0], W: ["fill", "We have been ___ (làm việc, dạng -ing) on the migration for three weeks.", "working"], S: ["Say this sentence aloud:", "We have been working on the migration for three weeks."], U: ["issue", "We are tracking a performance issue.", "We are issue a performance tracking.", "The performance is very issue.", "We are tracking an issue performance.", "Chúng tôi đang theo dõi một vấn đề về hiệu năng."],
      tr: ["Có thể suy ra điều gì về việc chuyển đổi?", "Nó vẫn đang tiến hành, còn các cột mốc phía trước.", "Có thể suy ra điều gì về vấn đề hiệu năng?", "Quan trọng nhưng chưa gấp với cột mốc tiếp theo.", "Chúng tôi đã làm việc chuyển đổi được ba tuần.", "làm việc", "Nói to câu sau.", "Chúng tôi đã làm việc chuyển đổi được ba tuần."]}
  ]
};
// Vietnamese meanings of the synonyms / antonyms used in the demo lessons
const DEMO_VI = {work: 'làm việc', position: 'vị trí', 'first name': 'tên', 'QA engineer': 'kỹ sư kiểm thử', fresh: 'mới mẻ', good: 'tốt', kind: 'tử tế', 'out of': 'từ, ra khỏi', 'do a job': 'làm một công việc', group: 'nhóm', workplace: 'nơi làm việc', call: 'gọi, cuộc gọi', begin: 'bắt đầu', update: 'cập nhật', support: 'hỗ trợ', email: 'thư điện tử', 'look at': 'xem xét', 'co-worker': 'đồng nghiệp', 'responsible for': 'chịu trách nhiệm về', client: 'khách hàng', 'become part of': 'trở thành một phần của', assignment: 'nhiệm vụ được giao', complete: 'hoàn thành', 'due date': 'ngày đến hạn', boss: 'sếp', 'work under': 'làm việc dưới quyền', 'status report': 'báo cáo tiến độ', site: 'địa điểm', application: 'ứng dụng', customer: 'khách hàng', prepare: 'chuẩn bị', 'go to': 'đi đến, tham dự', duty: 'nhiệm vụ', history: 'quá trình, lịch sử', training: 'đào tạo', practice: 'thực hành', skill: 'kỹ năng', 'in charge': 'phụ trách', accountable: 'chịu trách nhiệm', partner: 'đối tác', party: 'bên tham gia', handle: 'xử lý', manage: 'quản lý', busy: 'bận', frantic: 'tất bật', chat: 'trò chuyện', 'update each other': 'cập nhật cho nhau', release: 'phát hành', start: 'bắt đầu', verify: 'xác minh', check: 'kiểm tra', 'hold-up': 'sự trì hoãn', postponement: 'sự hoãn lại', timetable: 'thời gian biểu', plan: 'kế hoạch', accept: 'chấp nhận', 'agree to': 'đồng ý với', examine: 'xem xét kỹ', version: 'phiên bản', launch: 'ra mắt', supervise: 'giám sát', 'coordinate with': 'phối hợp với', 'work with': 'làm việc cùng', range: 'phạm vi', extent: 'mức độ', danger: 'nguy hiểm', threat: 'mối đe doạ', funds: 'nguồn tiền', allocation: 'khoản phân bổ', function: 'chức năng', capability: 'khả năng', worry: 'lo lắng', issue: 'vấn đề', comments: 'nhận xét', response: 'phản hồi', 'cut-off': 'hạn chót', delay: 'trì hoãn', 'put off': 'hoãn lại', rank: 'xếp hạng', 'put first': 'ưu tiên', option: 'lựa chọn', choice: 'sự lựa chọn', problem: 'vấn đề', bug: 'lỗi', transfer: 'chuyển', move: 'di chuyển', target: 'mục tiêu', checkpoint: 'điểm kiểm tra',
  old: 'cũ', bad: 'xấu', to: 'đến', rest: 'nghỉ ngơi', stop: 'dừng', finish: 'kết thúc', receive: 'nhận', seller: 'người bán', leave: 'rời đi', employee: 'nhân viên', supplier: 'nhà cung cấp', inexperience: 'thiếu kinh nghiệm', irresponsible: 'vô trách nhiệm', ignore: 'bỏ qua', calm: 'bình tĩnh', quiet: 'yên tĩnh', cancel: 'huỷ', deny: 'từ chối', reject: 'bác bỏ', safety: 'an toàn', confidence: 'sự tự tin', 'bring forward': 'dời sớm lên', neglect: 'bỏ bê', solution: 'giải pháp'};
// umbrella words of the demo lessons: meaning + a few other words under the same umbrella
const DEMO_UMB = {work: ['công việc, việc làm', [['job', 'công việc'], ['task', 'nhiệm vụ'], ['career', 'sự nghiệp']]], word: ['từ', [['name', 'tên'], ['term', 'thuật ngữ'], ['phrase', 'cụm từ']]], job: ['nghề nghiệp', [['developer', 'lập trình viên'], ['designer', 'nhà thiết kế'], ['manager', 'quản lý']]], time: ['thời gian', [['morning', 'buổi sáng'], ['week', 'tuần'], ['deadline', 'hạn chót']]], good: ['tốt', [['nice', 'dễ chịu'], ['kind', 'tử tế'], ['great', 'tuyệt vời']]], activity: ['hoạt động', [['study', 'học'], ['exercise', 'tập luyện'], ['travel', 'đi lại']]], group: ['nhóm', [['team', 'đội'], ['department', 'phòng ban'], ['committee', 'uỷ ban']]], place: ['nơi chốn', [['office', 'văn phòng'], ['room', 'phòng'], ['site', 'địa điểm']]], event: ['sự kiện', [['meeting', 'cuộc họp'], ['call', 'cuộc gọi'], ['workshop', 'buổi thực hành']]], action: ['hành động', [['send', 'gửi'], ['check', 'kiểm tra'], ['report', 'báo cáo']]], document: ['tài liệu', [['email', 'thư điện tử'], ['report', 'báo cáo'], ['contract', 'hợp đồng']]], person: ['người', [['colleague', 'đồng nghiệp'], ['manager', 'quản lý'], ['client', 'khách hàng']]], product: ['sản phẩm', [['app', 'ứng dụng'], ['website', 'trang web'], ['feature', 'tính năng']]], experience: ['kinh nghiệm', [['skill', 'kỹ năng'], ['background', 'nền tảng'], ['expertise', 'chuyên môn']]], knowledge: ['kiến thức', [['skill', 'kỹ năng'], ['experience', 'kinh nghiệm'], ['training', 'đào tạo']]], duty: ['nhiệm vụ', [['responsibility', 'trách nhiệm'], ['task', 'nhiệm vụ'], ['role', 'vai trò']]], busy: ['bận', [['hectic', 'bận rộn'], ['packed', 'kín lịch'], ['overloaded', 'quá tải']]], talk: ['nói chuyện', [['chat', 'trò chuyện'], ['discuss', 'thảo luận'], ['call', 'gọi điện']]], problem: ['vấn đề', [['bug', 'lỗi'], ['issue', 'vấn đề'], ['delay', 'chậm trễ']]], plan: ['kế hoạch', [['schedule', 'lịch trình'], ['roadmap', 'lộ trình'], ['agenda', 'chương trình họp']]], manage: ['quản lý', [['oversee', 'giám sát'], ['coordinate', 'điều phối'], ['lead', 'dẫn dắt']]], communicate: ['giao tiếp', [['update', 'cập nhật'], ['inform', 'thông báo'], ['reply', 'trả lời']]], danger: ['nguy hiểm', [['risk', 'rủi ro'], ['threat', 'mối đe doạ'], ['hazard', 'mối nguy']]], money: ['tiền', [['budget', 'ngân sách'], ['cost', 'chi phí'], ['salary', 'lương']]], function: ['chức năng', [['feature', 'tính năng'], ['option', 'tuỳ chọn'], ['tool', 'công cụ']]], information: ['thông tin', [['feedback', 'phản hồi'], ['data', 'dữ liệu'], ['update', 'cập nhật']]], option: ['lựa chọn', [['alternative', 'phương án thay thế'], ['choice', 'sự lựa chọn'], ['plan B', 'phương án dự phòng']]], process: ['quy trình', [['step', 'bước'], ['stage', 'giai đoạn'], ['workflow', 'luồng công việc']]], goal: ['mục tiêu', [['milestone', 'cột mốc'], ['target', 'chỉ tiêu'], ['objective', 'mục tiêu cụ thể']]]};
// slang / poetic words of the demo lessons with their definition, example and context / source
const DEMO_LEX = {
  gig: {w: 'gig', def: 'a job, especially a temporary or freelance one', example: 'I got a new gig as a tester at a startup.', context: 'Chat với đồng nghiệp, mạng xã hội. Không dùng trong email khách hàng, CV hay họp chính thức.', note: 'Gốc từ giới nhạc sĩ (buổi diễn); nghe trẻ trung, hơi tạm bợ.'},
  chops: {w: 'chops', def: 'real skill or ability in a field', example: 'She has serious coding chops.', context: 'Khen năng lực đồng nghiệp một cách thân mật; Mỹ nhiều hơn Anh.', note: 'Gần như luôn đi kèm lĩnh vực: coding chops, design chops.'},
  'sort out': {w: 'sort out', def: 'to deal with a problem successfully', example: 'Can you sort out the login bug today?', context: 'Rất phổ biến ở Anh, từ thân mật đến trung tính; dùng được trong email nội bộ.', note: 'Tránh trong văn bản chính thức với khách hàng – dùng resolve / handle.'},
  crazy: {w: 'crazy', def: 'extremely busy or chaotic (of a period of time)', example: 'This week has been crazy – three releases.', context: 'Than thở với đồng nghiệp về lịch làm việc.', note: 'Chỉ dùng cho tuần, ngày, lịch; không mô tả người là crazy ở nơi làm việc.'},
  'hang out': {w: 'hang out', def: 'to spend relaxed time together', example: "Let's hang out after work and catch up.", context: 'Ngoài giờ, với bạn bè hoặc đồng nghiệp thân.', note: 'Khác catch up: hang out không hàm ý cập nhật công việc.'},
  'give the green light': {w: 'give the green light', def: 'to approve something so that it can start', example: 'The client gave the green light for phase two.', context: 'Thân mật đến trung tính; nói được trong họp nhóm.', note: 'Thường nói về sếp hoặc khách hàng duyệt kế hoạch / ngân sách.'},
  'run the show': {w: 'run the show', def: 'to be in charge of everything', example: 'Minh runs the show on that project.', context: 'Nói về người đang điều hành, giọng ngưỡng mộ hoặc châm biếm nhẹ.', note: 'Có thể hàm ý người đó kiểm soát quá nhiều – cân nhắc khi nói trước mặt họ.'},
  'crunch time': {w: 'crunch time', def: 'the short, intense period just before a deadline', example: "It's crunch time – the release is on Friday.", context: 'Giới công nghệ, game, báo chí.', note: '"Crunch" một mình cũng ám chỉ làm thêm giờ liên tục trước hạn chót.'},
  'push back': {w: 'push back', def: 'to move something to a later time', example: 'Can we push back the demo to Monday?', context: 'Trung tính, dùng được trong email nội bộ.', note: 'Nghĩa thứ hai: push back on a request = phản đối; nhìn ngữ cảnh để hiểu đúng.'},
  'plan B': {w: 'plan B', def: 'an alternative plan to use if the first one fails', example: 'If the API is down, plan B is the mock server.', context: 'Thân mật đến trung tính.', note: 'Viết hoa B; trong câu thường không nhắc tới plan A.'},
  glitch: {w: 'glitch', def: 'a small, sudden technical problem', example: 'There was a glitch on the payment page this morning.', context: 'Thân mật; với khách hàng nên dùng issue hoặc bug.', note: 'Hàm ý nhỏ và tạm thời – không dùng cho lỗi nghiêm trọng.'},
  compass: {w: 'compass', def: 'the range or extent of something (literary)', example: 'The request lies beyond the compass of a single team.', source: 'Shakespeare, Sonnet 116: "Within his bending sickle\'s compass come" – compass = tầm với, phạm vi.'},
  peril: {w: 'peril', def: 'serious danger (literary, formal)', example: 'They launched without testing, at their peril.', source: 'Kinh Thánh bản King James, Romans 8:35: "…or peril, or sword?"; cụm cố định ngày nay: "at your peril".'},
  disquiet: {w: 'disquiet', def: 'a feeling of worry or unease (literary)', example: 'The delay caused some disquiet among the clients.', source: 'Kinh Thánh bản King James, Psalm 42:5: "why art thou disquieted within me?"; danh từ "disquiet" phổ biến trong văn xuôi thế kỷ 19.'}
};

// ===== [DATA] Demo level-up forms =====
/** Hand-written short level-up forms for the demo (same shape as the AI output). */
function demoLevelForm(target) {
  const q5 = arr => arr.map(([q, o, a]) => mcq(q, o, a, 5));
  const F = target === 'C1' ? {
    title: 'Level-up test C1 – Đề mẫu',
    L: {title: 'Part A – Two managers discuss a tight deadline', instruction: 'Listen to the discussion and answer questions 1–5.', audio: [['Lan', 'The client wants the whole platform migrated by the end of the quarter. Honestly, I think we should decline unless they drop the reporting module.'], ['Peter', 'Declining outright could cost us the account. What if we accept the deadline for the core migration and treat reporting as a separate phase with its own timeline?'], ['Lan', 'That only works if they understand that "separate phase" means it will not be ready in March. Last time, phased delivery was interpreted as everything being slightly late.'], ['Peter', 'Then we put it in writing: a one-page summary of what is in scope for March, what is not, and the risks if they insist on both. I would rather lose a day drafting that than lose the client to a misunderstanding.'], ['Lan', 'Agreed. And let us propose a weekly checkpoint so that scope changes surface early instead of at the end.']],
      qs: q5([['What does Lan initially suggest?', ['Accepting the full scope', 'Declining unless the scope is reduced', 'Asking for more staff', 'Delaying the start'], 1], ['What is Peter\'s main concern about declining?', ['The team would be idle', 'The company might lose the client', 'The reporting module is too hard', 'The deadline is unrealistic'], 1], ['Why is Lan cautious about "phased delivery"?', ['It is more expensive', 'The client previously misunderstood it', 'The team dislikes it', 'It is against company policy'], 1], ['What does Peter propose to prevent misunderstandings?', ['A longer contract', 'A written one-page scope summary', 'A larger team', 'Daily meetings with the client'], 1], ['What can be inferred about the two managers by the end?', ['They still disagree', 'They agree on a plan with clear scope and regular checkpoints', 'They decide to decline the project', 'They postpone the decision'], 1]])},
    R: {title: 'Part A – Giving feedback across cultures', instruction: 'Read the article and answer questions 1–5.', text: 'Feedback that works in one office can misfire in another. In some teams, a direct "this does not work" is heard as efficient and respectful of everyone\'s time; in others, the same sentence is heard as a personal attack, and the recipient quietly stops contributing. Multinational teams therefore need an explicit agreement about how feedback is given, rather than assuming that good intentions will translate by themselves.\n\nOne practical approach is to separate the observation from the judgement. "The report was sent two days after the deadline" is a fact that can be discussed; "you are unreliable" is a verdict that invites defensiveness. A second habit is to ask before telling: a colleague who is invited to assess their own work usually identifies most of the problems themselves, and the remaining points land more softly. Finally, feedback should be timely but not public. Praise can be shared in a meeting; corrections belong in a one-to-one conversation, ideally on the same day.\n\nNone of this means lowering standards. It means recognising that the goal of feedback is a change in behaviour, and that a message which is technically accurate but never acted upon has failed.',
      qs: q5([['According to the text, why can direct feedback be a problem?', ['It takes too much time', 'It may be interpreted differently across cultures', 'It is always rude', 'Managers are not trained to give it'], 1], ['What does the author recommend instead of assuming good intentions are enough?', ['Avoiding feedback', 'An explicit team agreement on how feedback is given', 'Giving feedback only in writing', 'Letting HR handle feedback'], 1], ['Which sentence is an example of an observation rather than a judgement?', ['"You are unreliable."', '"The report was sent two days after the deadline."', '"You never meet deadlines."', '"This is unacceptable."'], 1], ['Why does the author suggest asking before telling?', ['It saves the manager time', 'People often identify their own problems, so the rest is easier to accept', 'It avoids giving any criticism', 'It is required by policy'], 1], ['What is the author\'s view of standards?', ['They should be lowered to avoid conflict', 'They remain high; the aim is feedback that leads to change', 'They matter less than politeness', 'They should be set by the team'], 1]])},
    W: {task: 'Your company runs performance reviews once a year, and several colleagues say the feedback arrives too late to be useful. Your manager has sent you this message:', message: 'Hi,\nI would like to change how we give feedback, but I need a concrete proposal. Could you write a short message describing one problem with the current yearly review and proposing one change, with its main advantage and one possible risk?'},
    S: {title: 'Task 1 – Discussion (3 phút)', prompt: 'Your company is considering a four-day working week with the same salary and the same targets. Argue for or against the idea, considering the effects on productivity, clients and the team.', hint: 'Nêu lập trường rõ, 2–3 lý do có ví dụ, và nhắc một ý phản biện.'}
  } : {
    title: 'Level-up test B2 – Đề mẫu',
    L: {title: 'Part A – A presentation is moved earlier', instruction: 'Listen to the conversation and answer questions 1–5.', audio: [['Team leader', 'Hi Nam, I have just heard that the client wants our presentation on Wednesday instead of Friday. Can the slides be ready two days early?'], ['Nam', 'The slides are nearly finished, but the cost section depends on numbers from finance, and they promised them for Thursday.'], ['Team leader', 'Could you ask them for a draft version by Tuesday? Even rough figures would be better than an empty slide.'], ['Nam', 'I will call them now. If they cannot do it, I suggest we present the costs as a range and send the final figures on Friday as planned.'], ['Team leader', 'That works. Please also shorten the demo to ten minutes, because the client has only forty-five minutes on Wednesday.'], ['Nam', 'Understood. I will send you the updated version tomorrow afternoon.']],
      qs: q5([['Why does the team leader talk to Nam?', ['The client cancelled the presentation', 'The presentation has been moved earlier', 'The slides have mistakes', 'Finance has changed the numbers'], 1], ['What is the problem with the cost section?', ['It is too long', 'The numbers from finance are not ready yet', 'The client does not want it', 'Nam has not started it'], 1], ['What does the team leader suggest?', ['Removing the cost section', 'Asking finance for rough figures earlier', 'Postponing the presentation', 'Presenting without slides'], 1], ['What is Nam\'s alternative plan?', ['Cancel the demo', 'Present costs as a range and send final figures later', 'Ask the client for more time', 'Let finance present the costs'], 1], ['Why should the demo be shortened?', ['The client has limited time', 'The demo is not working', 'The team leader dislikes demos', 'The slides are too many'], 0]])},
    R: {title: 'Part A – New expense policy', instruction: 'Read the email and answer questions 1–5.', text: 'Subject: Changes to the expense policy from 1 November\n\nHi everyone,\n\nFrom 1 November, all expenses must be submitted through the new online form within 14 days of the purchase date. Claims submitted later than that will only be approved in exceptional cases, with a written explanation from your manager.\n\nFor meals with clients, the limit is now 600,000 VND per person, and the names of the guests must be included. Taxi rides are reimbursed only when public transport is not practical, for example late in the evening or when carrying equipment.\n\nPlease attach a photo of the receipt to every claim. Claims without a receipt will be returned, which delays payment for everyone, so please check before you submit. If you are unsure whether something can be claimed, ask the finance team before you spend the money rather than afterwards.\n\nThanks for your cooperation,\nFinance team',
      qs: q5([['What is the deadline for submitting an expense claim?', ['7 days after purchase', '14 days after purchase', 'The end of the month', '1 November'], 1], ['What happens to a claim submitted after the deadline?', ['It is rejected automatically', 'It needs a written explanation from the manager', 'It is paid with a penalty', 'It is paid the following month'], 1], ['When are taxi rides reimbursed?', ['Always', 'Only when public transport is not practical', 'Only for managers', 'Only for client visits'], 1], ['Why does finance ask people to attach receipts?', ['To check the names of guests', 'Because claims without receipts are returned and delay payment', 'Because the form requires a photo', 'To calculate tax'], 1], ['What advice is given about unclear cases?', ['Submit the claim anyway', 'Ask finance before spending the money', 'Ask your manager afterwards', 'Pay it yourself'], 1]])},
    W: {task: 'Your team uses many different tools for messages, tasks and documents, and new colleagues find it confusing. Your manager has sent you this message:', message: 'Hi,\nA new colleague told me it took her a week to understand which tool we use for what. Could you write a short message describing one problem this causes for the team and suggesting one change that would make it easier for new people?'},
    S: {title: 'Task 1 – Scenario (3 phút)', prompt: 'A new colleague has to handle an urgent client request for the first time while you are away tomorrow. Explain to them, step by step, what to do, who to contact and what to avoid.', hint: 'Nêu các bước theo thứ tự, lý do của từng bước và một lỗi thường gặp.'}
  };
  return {title: F.title, listening: {intro: 'Đoạn nghe được phát tối đa 2 lần (giọng đọc của trình duyệt). Nghe xong chọn đáp án.', parts: [{key: 'L1', title: F.L.title, instruction: F.L.instruction, audio: F.L.audio, questions: F.L.qs}]}, reading: {parts: [{key: 'R1', title: F.R.title, instruction: F.R.instruction, text: F.R.text, questions: F.R.qs}]}, writing: {task: F.W.task, message: F.W.message, requirement: 'Please write 80–120 words.', minWords: 80, maxWords: 120}, speaking: {tasks: [{key: 'S1', title: F.S.title, prompt: F.S.prompt, hint: F.S.hint}]}};
}

// ===== [DATA] Mini games catalogue, POS groups, topic filters =====
const GAME_LIST = [
  {id: 'scramble', icon: '🔤', name: 'Word scramble', desc: 'Các chữ cái bị xáo trộn, xếp lại thành đúng từ', bg: 'butter', goal: 'Xếp đúng càng nhiều từ càng tốt (8 từ).', how: ['Đọc gợi ý (nghĩa tiếng Việt / định nghĩa) và các ô chữ cái bị xáo trộn.', 'Bấm từng chữ cái theo đúng thứ tự (hoặc gõ phím) để xếp vào ô trống; ⌫ để bỏ chữ cuối.', 'Xếp đủ chữ mà sai thì ô rung và xoá để xếp lại; mỗi từ được 2 lần sai.', 'Bí quá thì bấm Gợi ý: mở chữ cái tiếp theo (trừ nửa điểm của từ đó).'], score: '+2 điểm mỗi từ xếp đúng ngay, +1 nếu dùng gợi ý hoặc sai một lần.'},
  {id: 'crossword', icon: '🧩', name: 'Crosswords', desc: 'Điền lưới ô chữ theo gợi ý dọc / ngang', bg: 'mint', goal: 'Điền đúng toàn bộ lưới ô chữ.', how: ['Mỗi số trên lưới ứng với một gợi ý Ngang → hoặc Dọc ↓ bên dưới.', 'Bấm vào ô và gõ chữ; gõ xong tự nhảy sang ô kế, phím mũi tên để di chuyển.', 'Bấm Kiểm tra: ô đúng xanh, ô sai đỏ, sửa rồi kiểm tra lại.', 'Bí quá thì bấm Gợi ý 1 chữ (mỗi lần trừ 1 điểm).'], score: 'Điểm = số từ trong lưới trừ số gợi ý đã dùng.'},
  {id: 'eggs', icon: '🧺', name: 'Season catch', desc: 'Đưa rổ hứng vật phẩm theo mùa mang đúng từ: lá (thu), hoa (xuân), kem (hè), tuyết (đông), lì xì (Tết), quà (Giáng sinh)', bg: 'peach', goal: 'Hứng đúng vật phẩm khớp với gợi ý, 10 lượt.', how: ['Gợi ý (nghĩa / định nghĩa) hiện to ở phía trên màn chơi.', '4 vật phẩm của mùa mang 4 từ rơi xuống; kéo chuột / chạm để di chuyển nhân vật (hoặc phím ← →) và đặt rổ dưới vật phẩm đúng.', 'Hứng đúng: +1 điểm, lượt mới. Hứng nhầm: mất 1 ❤️.', 'Để vật phẩm đúng rơi xuống đất cũng mất 1 ❤️. Hết 3 ❤️ là kết thúc.'], score: '+1 điểm mỗi vật phẩm hứng đúng, tối đa 10.'},
  {id: 'mario', icon: '🍄', name: 'Season-rio', desc: 'Qua từng cổng hộp quà, hạ Boss cuối rồi lấy cờ! Nhân vật đổi theo mùa: thỏ, dế, sóc, cánh cụt, én, tuần lộc', bg: 'lav', goal: 'Trả lời đủ 8 hộp quà chắn đường, đánh bại Boss cuối và chạm cờ.', how: ['Chạy bằng phím ← →, nhảy bằng Space hoặc ↑ (điện thoại: 3 nút dưới màn hình).', 'Mỗi hộp quà ? đứng trên một cột gỗ chắn ngang đường: chạm vào hộp hoặc cột → câu hỏi từ vựng, chọn 1 trong 4. Đúng: 🍄 (+1). Sai: mất 1 ❤️. Trả lời xong (đúng hay sai) cổng mới mở, nên không bỏ qua hộp nào được.', 'Đường khúc khuỷu: có hộp đặt trên bục gỗ, có hộp trên bục cao phải leo bậc. Cuối màn có Boss 💣 chặn đường: mỗi câu trả lời đúng trừ 1 HP (Boss có 3 HP), sai mất 1 ❤️.', 'Hạ Boss xong, chạm cờ để về đích. Hết 3 ❤️ là thua.'], score: '+1 điểm mỗi hộp quà đúng, +1 mỗi đòn trúng Boss (tối đa 11).'},
  {id: 'sort', icon: '🗂️', name: 'Word sort', desc: 'Xếp từng từ vào đúng nhóm từ loại', bg: 'butter', goal: 'Phân loại đúng càng nhiều từ càng tốt.', how: ['Mỗi lượt hiện một từ (kèm nghĩa) và các nhóm: Noun, Verb, Adjective, Adverb, Preposition, Phrase…', 'Bấm vào nhóm bạn cho là đúng từ loại của từ đó.', 'Đúng: +1 và chuỗi tăng; sai: app hiện nhóm đúng, chuỗi về 0.', 'Mẹo: nhìn hậu tố (-tion → noun, -ly → adverb) và cách dùng trong cụm từ.'], score: '+1 điểm mỗi từ đúng; chuỗi đúng liên tiếp dài nhất được ghi lại.'},
  {id: 'typing', icon: '⌨️', name: 'Typing race', desc: 'Type đúng từ trước khi thanh thời gian cạn!', bg: 'mint', goal: 'Gõ đúng 10 từ thật nhanh, giữ chuỗi combo càng dài càng nhiều điểm.', how: ['Mỗi từ có gợi ý: nghĩa tiếng Việt, định nghĩa tiếng Anh và hình minh hoạ (nếu có).', 'Thanh thời gian chạy rất nhanh – gõ từ bằng bàn phím ảo (hoặc bàn phím thật) rồi bấm ↵; phím vừa gõ sáng lên.', 'Đúng: +10 điểm × combo (combo tăng mỗi từ đúng liên tiếp, tối đa ×5). Sai hoặc hết giờ: combo về 1.', 'Chữ đã gõ đúng hiện xanh, sai hiện đỏ – sửa ngay bằng ⌫.'], score: '10 điểm × combo cho mỗi từ đúng; tối đa 10 từ.'}
];
const POS_GROUPS = [['noun', 'Noun'], ['verb', 'Verb'], ['adjective', 'Adjective'], ['adverb', 'Adverb'], ['preposition', 'Preposition'], ['phrase', 'Phrase']];
const posGroup = p => { p = String(p || '').toLowerCase(); if (!p) return ''; if (/phrasal|phrase|idiom|expression/.test(p)) return 'phrase'; const g = POS_GROUPS.find(([k]) => p.startsWith(k)); return g ? g[0] : 'phrase'; };
/* unrelated words for "odd one out" when a set has none (e.g. built from this week's lessons) */
const GAME_POOL = {low: [['window', 'cửa sổ'], ['banana', 'quả chuối'], ['bicycle', 'xe đạp'], ['rain', 'mưa'], ['doctor', 'bác sĩ'], ['kitchen', 'bếp'], ['mountain', 'núi'], ['ticket', 'vé'], ['garden', 'vườn'], ['pencil', 'bút chì']],
  high: [['volcano', 'núi lửa'], ['orchestra', 'dàn nhạc'], ['harvest', 'mùa gặt'], ['passport', 'hộ chiếu'], ['sculpture', 'điêu khắc'], ['glacier', 'sông băng'], ['recipe', 'công thức nấu ăn'], ['umbrella', 'cái ô'], ['planet', 'hành tinh'], ['vaccine', 'vắc-xin']]};
const BANNED_TOPIC = ['sex', 'porn', 'xxx', 'fuck', 'shit', 'bitch', 'dick', 'drugs', 'cocaine', 'heroin', 'weed', 'weapon', 'guns', 'kill', 'murder', 'suicide', 'bomb', 'terror', 'nazi', 'địt', 'đụ', 'lồn', 'cặc', 'buồi', 'đéo', 'đĩ', 'cứt', 'ma túy', 'ma tuý', 'giết', 'tự tử', 'súng', 'bom', 'khủng bố', 'khiêu dâm', 'cờ bạc', 'cá độ', 'chính trị', 'đảng'];
/** Topic input check before any AI call: length, characters, obvious nonsense, banned words. */
/* identity / group topics are never treated as a sexual or community violation: a soft "not for this context" message, no strike */
const GROUP_TERMS = ['lgbt', 'lgbtq', 'gay', 'lesbian', 'bisexual', 'transgender', 'queer', 'đồng tính', 'chuyển giới', 'song tính', 'tôn giáo', 'religion', 'muslim', 'islam', 'christian', 'buddhist', 'phật giáo', 'thiên chúa', 'công giáo', 'đạo hồi', 'ethnic', 'ethnicity', 'dân tộc', 'race', 'chủng tộc', 'disability', 'disabled', 'khuyết tật', 'feminism', 'nữ quyền', 'gender', 'giới tính'];
const hasTerm = (low, list) => list.find(w => new RegExp('(^|[^\\p{L}])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^\\p{L}]|$)', 'u').test(low));

// ===== [ASSETS] Game sprites (SVG strings) =====
/* Season as a game sprite (viewBox 0 0 256 256, feet on the bottom edge): rays, a sun body with a face, two legs. Frames differ by the legs and the tilt of the rays. */
const SUN_LEGS = (l, r) => `<g fill="none" stroke="#1E1E1E" stroke-width="11" stroke-linecap="round"><path d="${l}"/><path d="${r}"/></g>`;
const SUN_SPRITE = (legs, rot = 0, face = 'smile') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><g transform="rotate(${rot} 128 118)" fill="none" stroke="#F28C28" stroke-width="13" stroke-linecap="round"><path d="M128 18v24M128 194v24M28 118h24M204 118h24M57 47l17 17M182 172l17 17M57 189l17-17M182 64l17-17"/></g>${legs}<circle cx="128" cy="118" r="60" fill="#FBB829"/>${face === 'smile' ? '<circle cx="106" cy="110" r="7" fill="#1E1E1E"/><circle cx="150" cy="110" r="7" fill="#1E1E1E"/><path d="M104 134 Q128 154 152 134" fill="none" stroke="#1E1E1E" stroke-width="7" stroke-linecap="round"/>' : face === 'joy' ? '<path d="M96 110 Q106 98 116 110" fill="none" stroke="#1E1E1E" stroke-width="7" stroke-linecap="round"/><path d="M140 110 Q150 98 160 110" fill="none" stroke="#1E1E1E" stroke-width="7" stroke-linecap="round"/><path d="M100 132 Q128 164 156 132 Z" fill="#1E1E1E"/>' : '<circle cx="106" cy="110" r="7" fill="#1E1E1E"/><circle cx="150" cy="110" r="7" fill="#1E1E1E"/><path d="M96 92 L116 100 M160 92 L140 100" fill="none" stroke="#1E1E1E" stroke-width="7" stroke-linecap="round"/><path d="M108 138 H148" fill="none" stroke="#1E1E1E" stroke-width="7" stroke-linecap="round"/>'}</svg>`;
const GAME_ART = {
  idle: SUN_SPRITE(SUN_LEGS('M110 170 V236 M96 240 H124', 'M146 170 V236 M132 240 H160')),
  run1: SUN_SPRITE(SUN_LEGS('M110 170 L88 230 M76 236 L100 232', 'M146 170 L170 226 M160 234 L186 228'), -6),
  run2: SUN_SPRITE(SUN_LEGS('M110 170 L104 232 M92 238 L118 236', 'M146 170 L160 222 M150 230 L176 226'), 4),
  jump: SUN_SPRITE(SUN_LEGS('M110 170 L98 202 M86 210 L108 206', 'M146 170 L158 202 M148 210 L170 206'), 18, 'joy'),
  giftbox: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect x="40" y="112" width="176" height="120" rx="16" fill="#FBB829" stroke="#1E1E1E" stroke-width="8"/><rect x="110" y="112" width="36" height="120" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/><circle cx="128" cy="178" r="36" fill="#FFFFFF" stroke="#1E1E1E" stroke-width="7"/><path d="M114 168 C114 152 142 152 142 168 C142 178 128 179 128 190" fill="none" stroke="#1E1E1E" stroke-width="9" stroke-linecap="round"/><circle cx="128" cy="204" r="5.5" fill="#1E1E1E"/><path d="M128 78 C108 42 68 42 70 64 C71 82 104 84 128 78 Z" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7" stroke-linejoin="round"/><path d="M128 78 C148 42 188 42 186 64 C185 82 152 84 128 78 Z" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7" stroke-linejoin="round"/><rect x="28" y="78" width="200" height="44" rx="14" fill="#FBB829" stroke="#1E1E1E" stroke-width="8"/><rect x="110" y="78" width="36" height="44" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/><circle cx="128" cy="76" r="12" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/></svg>',
  giftopen: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect x="40" y="132" width="176" height="104" rx="16" fill="#FBB829" stroke="#1E1E1E" stroke-width="8"/><rect x="54" y="132" width="148" height="18" rx="6" fill="#1E1E1E"/><rect x="110" y="150" width="36" height="86" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/><path d="M185.8 94.3 L189.4 110.8 L203.7 119.8 L187.2 123.4 L178.2 137.7 L174.6 121.2 L160.3 112.2 L176.8 108.6 Z" fill="#FBB829" stroke="#1E1E1E" stroke-width="6" stroke-linejoin="round"/><g transform="translate(10 -6) rotate(-16 128 100)"><path d="M128 78 C108 42 68 42 70 64 C71 82 104 84 128 78 Z" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7" stroke-linejoin="round"/><path d="M128 78 C148 42 188 42 186 64 C185 82 152 84 128 78 Z" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7" stroke-linejoin="round"/><rect x="28" y="78" width="200" height="44" rx="14" fill="#FBB829" stroke="#1E1E1E" stroke-width="8"/><rect x="110" y="78" width="36" height="44" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/><circle cx="128" cy="76" r="12" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="7"/></g><path d="M233.7 137.2 L239.2 145.5 L248.8 147.7 L240.5 153.2 L238.3 162.8 L232.8 154.5 L223.2 152.3 L231.5 146.8 Z" fill="#A8BF55" stroke="#1E1E1E" stroke-width="5" stroke-linejoin="round"/></svg>',
  mushroom: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M88 150 C86 180 80 196 84 214 C88 234 168 234 172 214 C176 196 170 180 168 150 Z" fill="#FFFFFF" stroke="#1E1E1E" stroke-width="8" stroke-linejoin="round"/><clipPath id="cap"><path d="M32 136 C32 72 78 34 128 34 C178 34 224 72 224 136 C224 154 198 160 128 160 C58 160 32 154 32 136 Z"/></clipPath><path d="M32 136 C32 72 78 34 128 34 C178 34 224 72 224 136 C224 154 198 160 128 160 C58 160 32 154 32 136 Z" fill="#A8BF55"/><g clip-path="url(#cap)" fill="#FBB829" stroke="#1E1E1E" stroke-width="6"><circle cx="84" cy="88" r="22"/><circle cx="158" cy="70" r="16"/><circle cx="196" cy="126" r="20"/><circle cx="126" cy="132" r="13"/><circle cx="40" cy="140" r="14"/></g><path d="M32 136 C32 72 78 34 128 34 C178 34 224 72 224 136 C224 154 198 160 128 160 C58 160 32 154 32 136 Z" fill="none" stroke="#1E1E1E" stroke-width="8" stroke-linejoin="round"/></svg>',
  bomb: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path d="M180 92 C188 70 206 74 206 50" fill="none" stroke="#1E1E1E" stroke-width="13" stroke-linecap="round"/><path d="M180 92 C188 70 206 74 206 50" fill="none" stroke="#FBB829" stroke-width="5" stroke-linecap="round"/><rect x="150" y="80" width="48" height="30" rx="7" transform="rotate(45 174 95)" fill="#77736C" stroke="#1E1E1E" stroke-width="8"/><circle cx="118" cy="156" r="78" fill="#1E1E1E"/><path d="M66 140 C70 112 92 96 120 94" fill="none" stroke="#7A7064" stroke-width="11" stroke-linecap="round"/><circle cx="68" cy="166" r="6" fill="#7A7064"/><path d="M214.7 18.9 L215.8 36.2 L233.1 37.3 L218.6 46.8 L226.4 62.4 L210.8 54.6 L201.3 69.1 L200.2 51.8 L182.9 50.7 L197.4 41.2 L189.6 25.6 L205.2 33.4 Z" fill="#FBB829" stroke="#1E1E1E" stroke-width="6" stroke-linejoin="round"/><circle cx="208" cy="44" r="6" fill="#F6D3CB"/></svg>',
  /* determined Season (kept for the cannon layout) and the barrel alone (viewBox 0 0 220 68, base at the left) */
  cannon: SUN_SPRITE(SUN_LEGS('M110 170 V236 M96 240 H124', 'M146 170 V236 M132 240 H160'), 0, 'set'),
  barrel: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 68"><g transform="translate(140 -114) scale(-2 2)"><rect x="-30" y="62" width="100" height="24" rx="9" fill="#7A7064" stroke="#1E1E1E" stroke-width="4"/><rect x="6" y="62" width="9" height="24" fill="#F6D3CB" stroke="#1E1E1E" stroke-width="3.5"/><rect x="-40" y="57" width="14" height="34" rx="5" fill="#FBB829" stroke="#1E1E1E" stroke-width="4"/><path d="M-22 68 L-2 68" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.7"/></g></svg>',
  ball: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="50" fill="#1E1E1E"/><path d="M30 54 C34 38 46 28 62 26" fill="none" stroke="#7A7064" stroke-width="9" stroke-linecap="round"/><circle cx="32" cy="72" r="5" fill="#7A7064"/></svg>'
};
// ---- seasonal game heroes (platformer + catch game): one simple flat sprite per theme, four poses (idle / run1 / run2 / jump), facing right ----
const SEASON_HERO = {spring: 'rabbit', summer: 'cricket', autumn: 'squirrel', winter: 'penguin', tet: 'swallow', midautumn: 'rabbit', christmas: 'reindeer'};
const HERO_NAMES = {rabbit: 'Thỏ', cricket: 'Dế', squirrel: 'Sóc', penguin: 'Cánh cụt', swallow: 'Én', reindeer: 'Tuần lộc'};
function heroSprite(kind, pose) {
  const legs = {idle: ['M108 196 V236 M96 240 H120', 'M148 196 V236 M136 240 H160'], run1: ['M108 196 L90 232 M78 238 L102 234', 'M148 196 L170 228 M160 236 L186 230'], run2: ['M108 196 L104 234 M92 240 L118 238', 'M148 196 L162 226 M152 234 L178 230'], jump: ['M108 196 L98 214 M86 220 L108 218', 'M148 196 L158 214 M148 220 L170 218']}[pose] || [];
  const rot = pose === 'jump' ? -10 : pose === 'run1' ? -4 : pose === 'run2' ? 3 : 0; const ink = '#1E1E1E';
  const legCol = {rabbit: '#D6CCBF', cricket: '#4B6120', squirrel: '#8C3F22', penguin: '#F28C28', swallow: '#B5532B', reindeer: '#5B3F2A'}[kind] || ink;
  const eye = (x, y, r = 5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${ink}"/><circle cx="${x + 1.5}" cy="${y - 1.5}" r="1.6" fill="#fff"/>`;
  const smile = (x, y) => `<path d="M${x - 8} ${y} Q${x} ${y + 7} ${x + 8} ${y}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
  const body = {
    rabbit: `<ellipse cx="88" cy="150" rx="16" ry="14" fill="#fff"/><ellipse cx="128" cy="152" rx="50" ry="44" fill="#EDE9E3"/><ellipse cx="128" cy="166" rx="26" ry="22" fill="#fff"/><ellipse cx="112" cy="38" rx="12" ry="34" fill="#EDE9E3"/><ellipse cx="112" cy="40" rx="6" ry="24" fill="#F6D3CB"/><ellipse cx="146" cy="40" rx="12" ry="34" transform="rotate(14 146 40)" fill="#EDE9E3"/><ellipse cx="146" cy="42" rx="6" ry="24" transform="rotate(14 146 42)" fill="#F6D3CB"/><circle cx="128" cy="96" r="40" fill="#EDE9E3"/>${eye(142, 90)}${eye(118, 90, 4)}<ellipse cx="146" cy="106" rx="5" ry="3.5" fill="#E58BA6"/>${smile(146, 112)}`,
    cricket: `<path d="M74 108 C60 80 48 72 40 60" fill="none" stroke="#4B6120" stroke-width="4" stroke-linecap="round"/><path d="M96 92 C80 70 70 56 56 44" fill="none" stroke="#4B6120" stroke-width="4" stroke-linecap="round"/><circle cx="40" cy="58" r="5" fill="#4B6120"/><circle cx="56" cy="42" r="5" fill="#4B6120"/><ellipse cx="124" cy="156" rx="54" ry="40" fill="#8BA33A"/><path d="M80 150 C96 128 138 128 160 150" fill="none" stroke="#4B6120" stroke-width="4"/><path d="M90 160 C104 142 134 142 154 160" fill="none" stroke="#4B6120" stroke-width="3"/><circle cx="138" cy="104" r="36" fill="#9CCB5A"/>${eye(156, 98, 7)}${smile(154, 118)}`,
    squirrel: `<path d="M76 190 C30 190 26 110 70 96 C108 84 110 150 80 150 C60 150 60 180 76 190 Z" fill="#B5532B"/><path d="M58 150 C50 120 72 104 86 112" fill="none" stroke="#D77A4B" stroke-width="5" stroke-linecap="round"/><ellipse cx="132" cy="154" rx="46" ry="42" fill="#B5532B"/><ellipse cx="134" cy="164" rx="24" ry="24" fill="#F3D9C1"/><path d="M104 68 L112 40 L126 64 Z M158 64 L170 40 L178 68 Z" fill="#B5532B"/><circle cx="140" cy="96" r="38" fill="#B5532B"/>${eye(154, 90)}${eye(128, 90, 4)}<ellipse cx="158" cy="106" rx="5" ry="3.5" fill="${ink}"/>${smile(158, 112)}`,
    penguin: `<ellipse cx="128" cy="150" rx="52" ry="50" fill="${ink}"/><ellipse cx="130" cy="158" rx="34" ry="38" fill="#fff"/><path d="M78 126 C58 146 60 176 74 190 C90 178 92 146 78 126 Z" fill="${ink}"/><path d="M178 126 C198 146 196 176 182 190 C166 178 164 146 178 126 Z" fill="${ink}"/><circle cx="128" cy="96" r="40" fill="${ink}"/><ellipse cx="136" cy="100" rx="24" ry="20" fill="#fff"/>${eye(146, 92)}${eye(126, 92, 4)}<path d="M150 104 L172 110 L150 116 Z" fill="#F28C28"/>`,
    swallow: `<path d="M60 150 L24 126 L54 166 L18 196 Z" fill="#2C3E6B"/><ellipse cx="128" cy="152" rx="52" ry="40" fill="#2C3E6B"/><ellipse cx="136" cy="164" rx="30" ry="24" fill="#fff"/><path d="M96 128 C76 108 116 92 150 118 C136 124 116 134 96 128 Z" fill="#1E2C4F"/><circle cx="140" cy="98" r="36" fill="#2C3E6B"/><ellipse cx="146" cy="116" rx="18" ry="9" fill="#C8102E"/>${eye(154, 92)}<path d="M172 100 L196 106 L172 112 Z" fill="#F2C14E"/>`,
    reindeer: `<path d="M106 62 L98 30 M98 46 L84 40 M98 36 L110 24 M150 62 L158 30 M158 46 L172 40 M158 36 L146 24" fill="none" stroke="#5B3F2A" stroke-width="6" stroke-linecap="round"/><ellipse cx="128" cy="154" rx="50" ry="42" fill="#7A5A3A"/><ellipse cx="130" cy="168" rx="24" ry="20" fill="#D6B894"/><path d="M96 86 L88 70 L108 78 Z M160 86 L168 70 L148 78 Z" fill="#7A5A3A"/><circle cx="128" cy="98" r="38" fill="#7A5A3A"/><ellipse cx="146" cy="110" rx="18" ry="13" fill="#D6B894"/>${eye(144, 92)}${eye(120, 92, 4)}<circle cx="160" cy="112" r="8" fill="#C62828"/><path d="M80 110 C68 102 70 86 84 84 M176 110 C188 102 186 86 172 84" fill="none" stroke="#7A5A3A" stroke-width="5" stroke-linecap="round"/>`
  }[kind] || '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><g fill="none" stroke="${legCol}" stroke-width="11" stroke-linecap="round">${legs.map(d => `<path d="${d}"/>`).join('')}</g><g transform="rotate(${rot} 128 150)">${body}</g></svg>`;
}

// ===== [DATA] Catch-game item per theme =====
const SEASON_CATCH = {spring: {name: 'bông hoa', label: 'Hoa', emoji: '🌸'}, summer: {name: 'cây kem', label: 'Kem', emoji: '🍦'}, autumn: {name: 'chiếc lá', label: 'Lá', emoji: '🍂'}, winter: {name: 'bông tuyết', label: 'Tuyết', emoji: '❄️'}, tet: {name: 'bao lì xì', label: 'Lì xì', emoji: '🧧'}, midautumn: {name: 'đèn lồng', label: 'Đèn lồng', emoji: '🏮'}, christmas: {name: 'hộp quà', label: 'Quà', emoji: '🎁'}};


// =====================================================================================
// THEME (chỉ bảng màu + icon chính đổi theo mùa / lễ; `data-theme` trên <html>)
// =====================================================================================
export function autoTheme(d: Date = new Date()): ThemeKey {
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate(); const t = d.getTime();
  const near = (iso: string | undefined, before: number, after: number) => { if (!iso) return false; const c = new Date(iso + 'T00:00:00').getTime(); return t >= c - before * 864e5 && t <= c + after * 864e5; };
  if (near((TET_DATES as Dict<string>)[y], 7, 10) || near((TET_DATES as Dict<string>)[y + 1], 7, 10)) return 'tet';
  if (near((MIDAUTUMN_DATES as Dict<string>)[y], 5, 5)) return 'midautumn';
  if ((m === 12 && day >= 15) || (m === 1 && day <= 2)) return 'christmas';
  return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
}
export const themeOf = (S: AppState): ThemeKey => { const k = S?.settings?.theme; return k && k !== 'auto' && (THEMES as Dict)[k] ? (k as ThemeKey) : autoTheme(); };
/** SVG của icon chính theo theme (inner markup, viewBox 0 0 32 32, tô bằng var(--accent)/var(--primary)). */
export const themeMarkSvg = (key: ThemeKey, size = 24) => `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" class="bao" style="flex-shrink:0">${(THEME_MARKS as Dict<string>)[((THEMES as Dict)[key] || (THEMES as Dict).summer).mark]}</svg>`;
export function applyThemeToDocument(S: AppState) { if (typeof document === 'undefined') return; const k = themeOf(S); if (document.documentElement.dataset.theme !== k) document.documentElement.dataset.theme = k; }

// =====================================================================================
// STORE – state duy nhất trong localStorage (`aec:v1`; `?sandbox=1` → `aec:v1:sandbox`)
// =====================================================================================
export const isSandbox = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('sandbox');
export const storageKey = (sandbox = isSandbox()) => sandbox ? 'aec:v1:sandbox' : 'aec:v1';
export function defaultWeeks(): Week[] { return [1, 2, 3, 4].map(n => ({ n, topic: '', description: '', objectives: '', keyVocabHint: '' })); }
export function defaultState(): AppState {
  return {
    version: 1,
    settings: {
      provider: 'claude', apiKey: '', model: 'claude-opus-5-5', geminiKey: '', geminiModel: 'gemini-3.8-flash', oaiBase: 'https://api.groq.com/openai/v1', oaiKey: '', oaiModel: 'llama-3.3-70b-versatile', webhookUrl: '', webhookTemplate: '{"base_content":"{message}"}',
      minMinutesPerDay: 15, pinOperator: '', pinManager: '', pilotStartDate: mondayOf(todayStr()), pilotWeeks: 2,
      weekOverride: 0, orgName: 'GFT', prompts: {},
      testTimed: true, testTimes: { listening: 15, reading: 20, writing: 20, speaking: 15 }, testWarnLimit: 3, levelUp: { ...LEVELUP_DEFAULTS }
    },
    users: [], weeks: defaultWeeks(), lessonSets: [], microLessons: [], practiceResults: {}, progress: [], activity: [], coachSessions: [],
    submissions: [], tests: [], surveys: [], reminders: [], levelForms: [], levelRequests: [], gameSets: [], gameResults: [], topicReports: [], duels: [], session: { userId: null }
  };
}
/** Đọc state đã lưu + các migration an toàn (giống core.js `load()`). Lỗi parse → giữ bản sao `aec:v1:backup-<ts>`. */
export function loadState(key: string, onError?: (msg: string) => void): AppState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    if (!raw) return defaultState();
    const s: AppState = Object.assign(defaultState(), JSON.parse(raw));
    s.settings = Object.assign(defaultState().settings, s.settings || {});
    if (s.settings.geminiModel === 'gemini-2.5-flash') s.settings.geminiModel = 'gemini-3.8-flash';
    const renameCoach = (x: any) => String(x || '').replace(/\b(Bao|Chippi|Sunny)\b/g, 'Season'); // mascot đổi tên nhiều lần
    (s.coachSessions || []).forEach(c => { (c.messages || []).forEach(m => { if (m.role === 'assistant') m.content = renameCoach(m.content); }); (c.turns || []).forEach(t => { if (t.reply) t.reply = renameCoach(t.reply); }); });
    if (!s.weeks || s.weeks.length < 4) s.weeks = defaultWeeks().map((w, i) => Object.assign(w, (s.weeks || [])[i] || {}));
    if (!Array.isArray(s.microLessons)) s.microLessons = [];
    if (!s.practiceResults || typeof s.practiceResults !== 'object') s.practiceResults = {};
    return s;
  } catch (e) {
    console.error('load failed', e);
    try { const raw = localStorage.getItem(key); if (raw) localStorage.setItem(key + ':backup-' + Date.now(), raw); } catch { }
    onError?.('Không đọc được dữ liệu đã lưu – đã giữ bản sao trong localStorage (aec:v1:backup-…). Báo người vận hành.');
    return defaultState();
  }
}

export interface StoreOptions { sandbox?: boolean; storageKey?: string; onNotify?: (msg: string, type?: NotifyType) => void }
/** Store: giữ `S`, lưu debounce 150ms, phát `change` cho UI, `saved` khi ghi xong. */
export function createStore(opts: StoreOptions = {}) {
  const KEY = opts.storageKey || storageKey(opts.sandbox ?? isSandbox());
  const bus = new Emitter();
  let S: AppState = loadState(KEY, msg => bus.emit('notify', msg, 'err'));
  let saveTimer: any = null;
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); bus.emit('saved'); } catch (e) { bus.emit('notify', 'Không lưu được dữ liệu (bộ nhớ trình duyệt đầy hoặc bị chặn)', 'err'); } };
  const save = (immediate = false) => { clearTimeout(saveTimer); if (immediate) { persist(); bus.emit('change'); return; } saveTimer = setTimeout(() => { persist(); bus.emit('change'); }, 150); };
  return {
    KEY, bus,
    get S() { return S; },
    set S(v: AppState) { S = v; },
    save, persist,
    /** Chỉ báo UI re-render, không ghi. */
    touch: () => bus.emit('change'),
    subscribe: (fn: () => void) => bus.on('change', fn),
    exportJSON: () => download(`aec-backup-${todayStr()}.json`, JSON.stringify(S, null, 2)),
    /** Nhập file JSON: thay toàn bộ state, đăng xuất. Trả về lỗi (string) nếu có. */
    importJSON: (file: File) => new Promise<string | null>(res => { const r = new FileReader(); r.onload = () => { try { const obj = JSON.parse(String(r.result)); if (!obj.users || !obj.settings) throw new Error('Thiếu trường'); S = Object.assign(defaultState(), obj); S.session = { userId: null }; save(true); res(null); } catch (e: any) { res('File không hợp lệ: ' + e.message); } }; r.readAsText(file); }),
    /** Xoá toàn bộ dữ liệu (UI phải confirm trước). */
    wipe: () => { try { localStorage.removeItem(KEY); } catch { } S = defaultState(); bus.emit('change'); }
  };
}
export type Store = ReturnType<typeof createStore>;


// =====================================================================================
// RUNTIME CONTEXT – module-level như core.js (một app = một state), gán bởi createAppLogicV2()
// =====================================================================================
let store: Store;
let S: AppState;
const bus = new Emitter();
const notify = (msg: string, type: NotifyType = '') => bus.emit('notify', msg, type);
const save = (immediate = false) => store.save(immediate);
const touch = () => store.touch();
function bindStore(st: Store) { store = st; S = st.S; st.bus.on('change', () => { S = st.S; bus.emit('change'); }); st.bus.on('notify', (m: string, t: NotifyType) => notify(m, t)); st.bus.on('saved', () => bus.emit('saved')); }

// ---------- session / users ----------
export const me = () => S.users.find(u => u.id === S.session.userId) || null;
export const userById = (id?: string | null) => S.users.find(u => u.id === id);
export const learners = () => S.users.filter(u => u.role === 'learner');
export const activeLearners = () => learners().filter(u => u.cefrApproved);
export const isStaff = (u?: User | null) => !!u && u.role !== 'learner';
/** Quản lý xem màn vận hành (#/op…) chỉ được xem; UI V2 tự quyết định dựa trên role. */
export const canManage = (actor?: User | null, u?: User | null) => { if (!actor || !u) return false; if (actor.role === 'manager') return true; return actor.role === 'operator' && (u.role === 'learner' || u.id === actor.id); };

// ---------- pilot calendar ----------
export function currentWeek() {
  if (S.settings.weekOverride > 0) return clamp(S.settings.weekOverride, 1, S.settings.pilotWeeks);
  const d = daysBetween(S.settings.pilotStartDate, todayStr());
  return clamp(Math.floor(d / 7) + 1, 1, S.settings.pilotWeeks);
}
export const weekInfo = (n: number): Week => S.weeks.find(w => w.n === n) || { n, topic: '', description: '', objectives: '', keyVocabHint: '' };
export const weekStart = (n: number) => addDays(S.settings.pilotStartDate, (n - 1) * 7);
export const isLastWeek = () => currentWeek() >= S.settings.pilotWeeks;
export const weekOfDate = (ds: string) => clamp(Math.floor(daysBetween(S.settings.pilotStartDate, ds) / 7) + 1, 1, S.settings.pilotWeeks);
export const courseTheme = () => (S.settings.courseTheme || '').trim() || 'Tiếng Anh giao tiếp công sở';

// ---------- lessons lookup ----------
export const lessonSet = (week: number, cefr: Cefr) => S.lessonSets.find(l => l.week === week && l.cefr === cefr);
export const approvedLessons = (week: number, cefr: Cefr | null) => { const ls = cefr ? lessonSet(week, cefr) : null; return ls && ls.status === 'approved' ? ls.lessons : []; };
export const lessonById = (id: string) => { for (const ls of S.lessonSets) { const l = ls.lessons.find(x => x.id === id); if (l) return { lesson: l, set: ls }; } return null; };
export const userProgress = (uid: string, lessonId: string) => S.progress.find(p => p.userId === uid && p.lessonId === lessonId);
export const userTest = (uid: string, kind: TestKind): TestRecord | undefined => S.tests.filter(t => t.userId === uid && t.kind === kind).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];

// ---------- activity / streaks ----------
export function logActivity(userId: string, type: string, minutes = 5) {
  S.activity.push({ userId, date: todayStr(), type, minutes, at: new Date().toISOString() });
  S.reminders.forEach(r => { if (r.userId === userId && r.status === 'pending') r.status = 'resolved'; }); // hoạt động hôm nay xoá nhắc đang chờ
  save();
}
export const activeDays = (uid: string, from: string, to: string) => { const set = new Set<string>(); S.activity.forEach(a => { if (a.userId === uid && a.date >= from && a.date <= to) set.add(a.date); }); return set; };
export const lastActiveDate = (uid: string) => S.activity.filter(a => a.userId === uid).map(a => a.date).sort().pop() || null;
/** Số ngày liên tiếp không học, đếm lùi từ hôm qua. */
export function missedDays(uid: string) {
  const t = todayStr(); if (activeDays(uid, t, t).size) return 0;
  const last = lastActiveDate(uid); const u = userById(uid);
  const since = last || (u && u.approvedAt ? dateStr(u.approvedAt) : (u ? dateStr(u.createdAt) : t));
  return Math.max(0, daysBetween(since, t));
}
export const sessionsThisWeek = (uid: string, week = currentWeek()) => { const s = weekStart(week); return activeDays(uid, s, addDays(s, 6)).size; };
/** Chuỗi ngày học (T2–T6; cuối tuần không cộng cũng không ngắt chuỗi). */
export function streakDays(uid: string) { const t = todayStr(); const act = activeDays(uid, addDays(t, -120), t); let d = isStudyDay(t) && act.has(t) ? t : prevStudyDay(t), n = 0; while (act.has(d)) { n++; d = prevStudyDay(d); } return n; }
/** Điểm danh tuần: [{date, label, on, isToday, past}] cho 5 ngày T2–T6 (UI vẽ chấm). */
export function weekDots(uid: string, week = currentWeek()) { const start = weekStart(week); const today = todayStr(); const act = activeDays(uid, start, addDays(start, 6)); return DAY_SHORT.slice(0, 5).map((label, i) => { const date = addDays(start, i); return { date, label, on: act.has(date), isToday: date === today, past: date < today }; }); }
export function weekDotsMini(uid: string, week: number) { const s = weekStart(week), act = activeDays(uid, s, addDays(s, 6)), t = todayStr(); return DAY_SHORT.map((label, i) => { const date = addDays(s, i); return { date, label, on: act.has(date), past: date < t, isToday: date === t }; }); }

// ---------- reminders / webhook ----------
export function reminderMessage(u: User) {
  const w = weekInfo(currentWeek()); const miss = missedDays(u.id);
  return `Chào ${u.name}, bạn đã ${miss} ngày chưa vào học tiếng Anh. Chủ đề tuần ${currentWeek()}${w.topic ? ': ' + w.topic : ''}. Chỉ cần ${S.settings.minMinutesPerDay} phút hôm nay thôi – vào học 1 bài ngắn hoặc luyện 1 lượt với AI coach nhé! 💪`;
}
export function computeReminders() {
  applyPendingLevels();
  const today = todayStr();
  activeLearners().forEach(u => { const miss = missedDays(u.id); const existing = S.reminders.find(r => r.userId === u.id && r.date === today); if (miss >= 2 && !existing) S.reminders.push({ id: uid('rem'), userId: u.id, date: today, missedDays: miss, status: 'pending' }); });
  save();
}
export async function sendWebhook(message: string, u?: User | null) {
  const url = S.settings.webhookUrl; if (!url) throw new Error('Chưa cấu hình webhook URL trong Cài đặt');
  let body = S.settings.webhookTemplate || '{"base_content":"{message}"}';
  body = body.replace('{message}', JSON.stringify(message).slice(1, -1)).replace('{name}', esc(u ? u.name : ''));
  await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body });
}
export const remById = (id: string) => S.reminders.find(r => r.id === id);
export async function sendReminder(r: any) { const x = userById(r.userId)!; await sendWebhook(reminderMessage(x), x); r.status = 'sent'; r.handledAt = new Date().toISOString(); save(true); }
export const REMINDER_STATUS_LABEL: Dict<string> = { sent: 'Đã gửi webhook', copied: 'Đã copy', dismissed: 'Nhắc tay', resolved: 'Đã quay lại học' };

// ---------- CEFR level history ----------
/** Đổi mức: lần duyệt đầu áp dụng ngay; đổi sau đó chờ tới thứ Hai tuần sau (u.pendingCefr). */
export function setLevel(u: User, to: Cefr, by: string, reason = '', evidence = ''): 'same' | 'now' | 'pending' {
  const from = u.cefr || null; if (from === to) { u.pendingCefr = null; return 'same'; }
  const entry = { from, to, by, reason, evidence };
  if (!u.cefrApproved || !from) { u.cefr = to; u.pendingCefr = null; u.cefrHistory = [...(u.cefrHistory || []), { ...entry, at: todayStr() }]; return 'now'; }
  u.pendingCefr = { ...entry, effective: nextMonday(todayStr()) }; return 'pending';
}
export function applyPendingLevels() {
  let n = 0; const t = todayStr();
  S.users.forEach(u => { const p = u.pendingCefr; if (p && p.effective <= t) { u.cefrHistory = [...(u.cefrHistory || []), { from: u.cefr, to: p.to, at: p.effective, by: p.by, reason: p.reason, evidence: p.evidence }]; u.cefr = p.to; u.pendingCefr = null; n++; } });
  return n;
}
/** Mức của học viên trong tuần `week` (đổi mức có hiệu lực thứ Hai nên mỗi tuần một mức). */
export function cefrAt(u: User, week: number): Cefr | null {
  const h = u.cefrHistory || []; if (!h.length) return u.cefr;
  const end = addDays(weekStart(week), 6); let lv: Cefr | null = h[0].from || h[0].to;
  h.forEach(e => { if (e.at <= end) lv = e.to; }); return lv;
}

// ---------- learner profile ----------
export const learnerWantsVi = (u: User) => isLow(u.cefr);
export function profileSummary(u: User) {
  const p = u.profile; if (!p) return '(no profile)';
  const en: Dict<string> = { customer: 'talking to customers/partners', email: 'work emails and messages', meeting: 'meetings and presentations', docs: 'reading technical documents', career: 'career growth / interviews', confidence: 'speaking confidence', reading: 'reading and note-taking', listening: 'listening and repeating', speaking: 'speaking / dialogue', quiz: 'quizzes and gap-fills', writing: 'writing sentences and emails', examples: 'examples from their real work', games: 'short challenges with scores' };
  const envEn: Dict<string> = { daily: 'every day', weekly: 'a few times a week', monthly: 'a few times a month', rarely: 'rarely or never' }; const habEn: Dict<string> = { movies: 'films/videos', music: 'music/podcasts', reading: 'news/documents', social: 'social media/chat', speak: 'talking with foreigners', app: 'apps/courses', none: 'no habit yet' };
  return `Job: ${p.position || '?'} in ${p.department || '?'}. Uses English for: ${(p.goals || []).map(g => en[g] || g).join(', ') || 'not stated'}. English use at work: ${envEn[p.envUse] || 'not stated'}. English use at home / with family: ${({ daily: 'every day', weekly: 'a few times a week', monthly: 'occasionally', never: 'never' } as Dict<string>)[p.familyUse] || 'not stated'}. English habits outside work: ${(p.habits || []).map(h => habEn[h] || h).join(', ') || 'not stated'}. Typical situations: ${p.situations || 'not stated'}. Preferred learning styles: ${(p.styles || []).map(s => en[s] || s).join(', ') || 'not stated'}. Session length: ${p.duration || '?'} min, ${p.sessionsPerWeek || '?'} sessions/week, device: ${p.device || '?'}. Self-assessed level: ${p.selfLevel || 'unknown'}. Certificates: ${(p.certs || []).length ? p.certs.map(c => `${optLabel('certs', c.type)} ${c.score || ''}${c.year ? ' (' + c.year + ')' : ''}`.trim()).join(', ') : 'none'}. Past learning: ${p.experience || 'not stated'}. Worries / wishes: ${p.concerns || 'none'}.`;
}
export function levelProfileSummary(cefr: Cefr) {
  const L = activeLearners().filter(x => x.cefr === cefr && x.profile); if (!L.length) return '(no learner profiles yet)';
  const count = (group: string, key: string) => L.filter(x => ((x.profile as any)[group] || []).includes(key)).length;
  const top = (group: string) => PROFILE_OPTS[group].map(([k]) => [k, count(group, k)] as [string, number]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (${n})`).join(', ');
  return `${L.length} learners. Jobs: ${[...new Set(L.map(x => x.profile!.position).filter(Boolean))].join(', ') || '?'}. Top goals: ${top('goals') || '?'}. Top learning styles: ${top('styles') || '?'}. Typical situations: ${L.map(x => x.profile!.situations).filter(Boolean).slice(0, 3).join(' | ') || '?'}.`;
}
/** Kiểm tra form hồ sơ; trả về lỗi đầu tiên (string) hoặc null. */
export function validateProfile(name: string, f: Partial<Profile>) {
  if (!name.trim()) return 'Nhập họ tên';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email || '')) return 'Nhập email hợp lệ (bắt buộc)';
  if (!(f.goals || []).length) return 'Chọn ít nhất một mục đích dùng tiếng Anh';
  if (!f.envUse) return 'Chọn mức độ dùng tiếng Anh trong môi trường làm việc';
  if (!f.familyUse) return 'Chọn mức độ sử dụng tiếng Anh trong gia đình';
  if (!(f.habits || []).length) return 'Chọn ít nhất một thói quen dùng tiếng Anh (hoặc "Chưa có thói quen nào")';
  if (!(f.styles || []).length) return 'Chọn ít nhất một phong cách học';
  return null;
}
/** Dữ liệu hiển thị thẻ hồ sơ (UI render). */
export function profileRows(u: User) {
  const p = u.profile; if (!p) return null;
  return [['Công việc', [p.position, p.department].filter(Boolean).join(' · ')], ['Email', p.email], ['Base', p.contact], ['Dùng tiếng Anh để', optLabels('goals', p.goals)], ['Mức độ dùng ở công ty', optLabel('envUse', p.envUse)], ['Dùng trong gia đình', p.familyUse ? optLabel('familyUse', p.familyUse) : ''], ['Thói quen ngoài việc', optLabels('habits', p.habits)], ['Tình huống', p.situations],
    ['Cách học thích', optLabels('styles', p.styles)], ['Giải thích bằng', u.cefr ? (isLow(u.cefr) ? `Tiếng Việt (tự động theo mức ${u.cefr})` : `Tiếng Anh (tự động theo mức ${u.cefr})`) : 'Tự động theo trình độ'], ['Phong cách Season', `${PERSONAS[personaOf(u)][1]} · ${PERSONAS[personaOf(u)][0]}`], ['Lịch học', [p.duration + ' phút/buổi', '5 ngày/tuần (T2–T6)', optLabel('device', p.device)].filter(Boolean).join(' · ')],
    ['Tự đánh giá', optLabel('selfLevel', p.selfLevel)], ['Chứng chỉ', (p.certs || []).map(certLabel).join(', ')], ['Đã học', p.experience], ['Lo ngại / mong muốn', p.concerns]].filter(([, v]) => v) as [string, string][];
}

// ---------- forgot operator PIN (báo lên quản lý) ----------
export const pinReports = () => (S.pinReports = S.pinReports || []);
/** Dữ liệu thẻ PIN cho quản lý: yêu cầu mở/đã xử lý + mọi PIN trong hệ thống. */
export function pinOverview() {
  const open = pinReports().filter(r => r.status === 'open').sort((a, b) => b.at.localeCompare(a.at)); const done = pinReports().filter(r => r.status === 'done').sort((a, b) => b.doneAt.localeCompare(a.doneAt)).slice(0, 3);
  return { open, done, pinOperator: S.settings.pinOperator, pinManager: S.settings.pinManager, learnersWithPin: learners().filter(x => x.pin).map(x => ({ id: x.id, name: x.name, pin: x.pin })), learnersWithoutPin: learners().filter(x => !x.pin).length };
}

// ---------- account deletion: maker-checker + trash ----------
export const delReqs = () => (S.deleteRequests = S.deleteRequests || []);
export const pendingDelReq = (userId: string) => delReqs().find(r => r.userId === userId && r.status === 'pending');
export function deleteUser(u: User, actor: User | null, reqId?: string | null) {
  const data: Dict<any[]> = {}; USER_DATA_KEYS.forEach(k => { data[k] = (S[k] || []).filter((x: any) => x.userId === u.id); S[k] = (S[k] || []).filter((x: any) => x.userId !== u.id); });
  const pick = (obj: Dict, test: (k: string) => boolean) => { const out: Dict = {}; Object.keys(obj || {}).forEach(k => { if (test(k)) { out[k] = obj[k]; delete obj[k]; } }); return out; };
  const practiceResults = pick(S.practiceResults, k => k.startsWith(u.id + '_')), testDrafts = pick(S.testDrafts || {}, k => k.startsWith(u.id + ':'));
  S.users = S.users.filter(x => x.id !== u.id);
  (S.trash = S.trash || []).push({ id: uid('tr'), user: u, data, practiceResults, testDrafts, deletedAt: new Date().toISOString(), deletedBy: actor?.id || null, deletedByName: actor?.name || '', reqId: reqId || null });
  if (S.session.userId === u.id) S.session.userId = null;
}
export function restoreUser(t: any) {
  const u: User = t.user; if (S.users.some(x => x.id === u.id)) return false;
  if (u.role === 'learner' && learners().some(x => normName(x.name) === normName(u.name))) u.name += ' (khôi phục)';
  S.users.push(u); USER_DATA_KEYS.forEach(k => { S[k] = [...(S[k] || []), ...((t.data || {})[k] || [])]; });
  S.practiceResults = { ...(S.practiceResults || {}), ...(t.practiceResults || {}) }; S.testDrafts = { ...(S.testDrafts || {}), ...(t.testDrafts || {}) };
  S.trash = (S.trash || []).filter(x => x.id !== t.id); return true;
}
export const goneRequests = () => delReqs().filter(r => r.status === 'approved' && !r.cleared && !userById(r.userId) && !(S.trash || []).some(t => t.user.id === r.userId));
export const trashList = () => (S.trash || []).slice().sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
export const trashSize = (it: any) => USER_DATA_KEYS.reduce((n, k) => n + ((it.data || {})[k] || []).length, 0) + Object.keys(it.practiceResults || {}).length;
export function userDataOf(u: User) { const d: Dict<any[]> = {}; USER_DATA_KEYS.forEach(k => { d[k] = (S[k] || []).filter((x: any) => x.userId === u.id); }); return d; }
/** Quick view: mọi dữ liệu của một tài khoản (sống hoặc trong thùng rác) dưới dạng số liệu để UI render pop-up. */
export function userQuickView(userId: string) {
  const live = userById(userId); const req = delReqs().filter(r => r.userId === userId).sort((a, b) => b.at.localeCompare(a.at))[0] || null;
  const trash = live ? null : (S.trash || []).find(x => x.user.id === userId) || null;
  const u: User | null = live || trash?.user || null; if (!u) return null;
  const d = live ? userDataOf(u) : (trash!.data || {}); const L = (k: string) => d[k] || [];
  const prog = L('progress').filter((p: any) => p.completedAt); const act = L('activity'); const days = [...new Set(act.map((a: any) => a.date))].sort(); const mins = act.reduce((s: number, a: any) => s + (+a.minutes || 0), 0);
  const cs = L('coachSessions'); const turns = cs.reduce((s: number, c: any) => s + (c.turns || []).length, 0); const rub = cs.flatMap((c: any) => (c.turns || []).filter((t: any) => !t.offTopic).map((t: any) => (t.rubric.meaning + t.rubric.vocab + t.rubric.grammar) / 3));
  const subs = L('submissions'); const graded = subs.filter((s: any) => s.total != null); const tests = L('tests').slice().sort((a: any, b: any) => String(a.submittedAt || '').localeCompare(String(b.submittedAt || '')));
  const mean = (a: number[]) => a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length * 10) / 10 : null;
  return { user: u, live: !!live, trash, req: live ? (req && req.status === 'pending' ? req : null) : req, persona: PERSONAS[personaOf(u)], history: (u.cefrHistory || []).slice().reverse(), profile: profileRows(u),
    stats: { lessons: prog.length, lastLesson: prog.map((p: any) => p.completedAt).sort().pop(), days: days.length, minutes: mins, lastDay: days[days.length - 1], sessions: cs.length, turns, rubricAvg: mean(rub), submissions: subs.length, subAvg: mean(graded.map((s: any) => s.total)), tests, levelRequests: L('levelRequests'), appeals: L('appeals'), games: L('gameResults').length, micro: L('microLessons').length, badges: (u.badgesSeen || []).length, survey: L('surveys').slice(-1)[0] || null, reminders: L('reminders').length, topicStrikes: (u.topicStrikes || []).length } };
}


// =====================================================================================
// AI LAYER – gọi thẳng từ trình duyệt: Claude Messages API / Gemini / OpenAI-compatible
// =====================================================================================
export const prompt = (key: string) => (S.settings.prompts && S.settings.prompts[key]) || (PROMPTS as Dict<string>)[key];
export const PROMPTS_DEFAULT_BASE = PROMPTS.base;
/** Prompt `base` do vận hành sửa được lưu trong settings.prompts.base và thay thế PROMPTS.base khi boot (giống core.js). */
function applyBasePromptOverride() { (PROMPTS as Dict<string>).base = S.settings.prompts?.base || PROMPTS_DEFAULT_BASE; }

export interface AiCallOpts { system: string; user?: string; messages?: { role: string; content: string }[]; schema?: any; maxTokens?: number; effort?: 'low' | 'medium' | 'high'; noBase?: boolean; lean?: boolean }
export interface AiResult { text: string; json: any; model: string; usage?: any }

function geminiSchema(s: any): any {
  if (Array.isArray(s)) return s.map(geminiSchema);
  if (!s || typeof s !== 'object') return s;
  const o: Dict = {}; for (const [k, v] of Object.entries(s)) { if (k === 'additionalProperties') continue; o[k] = (k === 'properties') ? Object.fromEntries(Object.entries(v as Dict).map(([pk, pv]) => [pk, geminiSchema(pv)])) : geminiSchema(v); }
  return o;
}
async function geminiCall({ system, user, messages, schema, maxTokens, noBase = false }: AiCallOpts): Promise<AiResult> {
  const key = S.settings.geminiKey; const model = S.settings.geminiModel || 'gemini-3.8-flash';
  const contents = (messages || [{ role: 'user', content: user || '' }]).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const body: any = { systemInstruction: { parts: [{ text: noBase ? system : PROMPTS.base + '\n\n' + system }] }, contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 } };
  if (schema) { body.generationConfig.responseMimeType = 'application/json'; body.generationConfig.responseSchema = geminiSchema(schema); }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const send = async (b: any) => { try { return await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(b) }); } catch (e: any) { throw new Error('Không kết nối được tới Gemini API. ' + e.message); } };
  let res = await send(body);
  if (res.status === 400 && schema) { const b2 = JSON.parse(JSON.stringify(body)); delete b2.generationConfig.responseSchema; b2.systemInstruction.parts[0].text += '\n\nReturn ONLY valid JSON matching this JSON Schema:\n' + JSON.stringify(schema); res = await send(b2); }
  if (!res.ok) {
    let detail = ''; try { const j = await res.json(); detail = j.error?.message || ''; } catch { }
    if (res.status === 400 && /API key/i.test(detail)) throw new Error('Gemini API key không hợp lệ. ' + detail);
    if (res.status === 403) throw new Error('Gemini từ chối (403): ' + detail);
    if (res.status === 429) throw new Error('Gemini quá giới hạn gói miễn phí (429), đợi một phút rồi thử lại. ' + detail);
    if (res.status === 404) throw new Error(`Không tìm thấy model "${model}" (404). Đổi model trong Cài đặt. ` + detail);
    throw new Error(`Lỗi Gemini API ${res.status}. ${detail}`);
  }
  const data = await res.json(); const cand = data.candidates?.[0];
  if (!cand) throw new Error('Gemini không trả về nội dung' + (data.promptFeedback?.blockReason ? ' (bị chặn: ' + data.promptFeedback.blockReason + ')' : '.'));
  if (cand.finishReason === 'SAFETY') throw new Error('Gemini chặn nội dung vì lý do an toàn.');
  if (cand.finishReason === 'MAX_TOKENS') throw new Error('Kết quả Gemini bị cắt ngắn (max tokens). Thử lại.');
  const text = (cand.content?.parts || []).filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join('').trim();
  let json = null; if (schema) { const m = text.match(/\{[\s\S]*\}/); try { json = JSON.parse(m ? m[0] : text); } catch { throw new Error('Gemini trả về JSON không hợp lệ.'); } }
  return { text, json, model, usage: data.usageMetadata };
}
export const isLocalBase = (b?: string) => /^https?:\/\/(localhost|127\.0\.0\.1)/.test(b || '');
async function openaiCall({ system, user, messages, schema, maxTokens = 16000, noBase = false, lean = false }: AiCallOpts): Promise<AiResult> {
  const base = (S.settings.oaiBase || '').replace(/\/+$/, ''); const key = S.settings.oaiKey; const model = S.settings.oaiModel;
  if (!base || !model) throw new Error('Chưa cấu hình Base URL / model trong Cài đặt.');
  let sys = noBase ? system : PROMPTS.base + '\n\n' + system;
  if (schema) sys += lean ? '\n\nRespond with ONLY a single JSON object (no markdown, no commentary).' : '\n\nRespond with ONLY a single JSON object (no markdown, no commentary) that matches this JSON Schema exactly:\n' + JSON.stringify(schema);
  const msgs = [{ role: 'system', content: sys }, ...(messages || [{ role: 'user', content: user || '' }]).map(m => ({ role: m.role, content: m.content }))];
  const body: any = { model, messages: msgs, max_tokens: Math.min(maxTokens, 8192), temperature: 0.7 };
  if (schema) body.response_format = { type: 'json_object' };
  if (/gpt-oss/i.test(model)) body.reasoning_effort = 'low';
  const headers: Dict<string> = { 'Content-Type': 'application/json' }; if (key) headers.Authorization = 'Bearer ' + key;
  if (/openrouter\.ai/.test(base)) { headers['HTTP-Referer'] = typeof location !== 'undefined' ? location.origin : ''; headers['X-Title'] = 'Season English'; }
  let res: Response;
  try { res = await fetch(base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(body) }); }
  catch (e) { throw new Error('Không gọi được ' + base + '. ' + (isLocalBase(base) ? 'Ollama/LM Studio đã chạy chưa? Với Ollama cần cho phép CORS: đặt biến môi trường OLLAMA_ORIGINS=* rồi khởi động lại.' : 'Có thể do mạng hoặc dịch vụ không cho gọi từ trình duyệt (CORS).')); }
  if (res.status === 400 && schema) { const b2 = { ...body }; delete b2.response_format; delete b2.reasoning_effort; res = await fetch(base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(b2) }); }
  if (!res.ok) {
    let detail = ''; try { const j = await res.json(); detail = j.error?.message || j.message || JSON.stringify(j).slice(0, 200); } catch { }
    if (res.status === 401) throw new Error('API key không hợp lệ (401). ' + detail);
    if (res.status === 404) throw new Error(`Không tìm thấy model "${model}" (404). Xem danh sách model của nhà cung cấp. ` + detail);
    if (res.status === 429) throw new Error('Quá giới hạn gói miễn phí (429), đợi một lúc rồi thử lại. ' + detail);
    throw new Error(`Lỗi API ${res.status}. ${detail}`);
  }
  const data = await res.json(); const choice = data.choices?.[0]; if (!choice) throw new Error('API không trả về nội dung.');
  const text = (choice.message?.content || '').trim();
  if (choice.finish_reason === 'length') throw new Error('Kết quả bị cắt ngắn (max tokens). Thử lại hoặc dùng model khác.');
  let json = null; if (schema) { const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''); const m = cleaned.match(/\{[\s\S]*\}/); try { json = JSON.parse(m ? m[0] : cleaned); } catch { throw new Error('Model trả về JSON không hợp lệ – thử model lớn hơn (70B) hoặc gửi lại.'); } }
  return { text, json, model: data.model || model, usage: data.usage };
}
async function claudeCall({ system, user, messages, schema, maxTokens = 16000, effort = 'medium', noBase = false }: AiCallOpts): Promise<AiResult> {
  const key = S.settings.apiKey; if (!key) throw new Error('Chưa có API key. Người vận hành nhập trong Cài đặt.');
  const model = S.settings.model || 'claude-opus-5-5';
  const body: any = { model, max_tokens: maxTokens, system: noBase ? [{ type: 'text', text: system }] : [{ type: 'text', text: PROMPTS.base }, { type: 'text', text: system }], messages: messages || [{ role: 'user', content: user || '' }] };
  const supportsEffort = /opus-5|sonnet-5|fable/.test(model);
  if (schema || supportsEffort) { body.output_config = {}; if (supportsEffort) body.output_config.effort = effort; if (schema) body.output_config.format = { type: 'json_schema', schema }; }
  const headers: Dict<string> = { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
  if (/opus-5-5|sonnet-5-5|fable/.test(model)) { headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; body.fallbacks = 'default'; }
  let res: Response;
  try { res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) }); }
  catch (e: any) { throw new Error('Không kết nối được tới api.anthropic.com (mạng hoặc trình duyệt chặn). ' + e.message); }
  if (!res.ok) {
    let detail = ''; try { const j = await res.json(); detail = j.error?.message || ''; } catch { }
    if (res.status === 401) throw new Error('API key không hợp lệ (401). ' + detail);
    if (res.status === 429) throw new Error('Quá giới hạn tốc độ (429), thử lại sau ít phút. ' + detail);
    if (res.status === 400) throw new Error('Yêu cầu không hợp lệ (400): ' + detail);
    throw new Error(`Lỗi API ${res.status}. ${detail}`);
  }
  const data = await res.json();
  if (data.stop_reason === 'refusal') throw new Error('AI từ chối xử lý yêu cầu này' + (data.stop_details?.explanation ? ': ' + data.stop_details.explanation : '.'));
  if (data.stop_reason === 'max_tokens') throw new Error('Kết quả bị cắt ngắn (max_tokens). Thử lại hoặc giảm độ dài.');
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  let json = null; if (schema) { try { json = JSON.parse(text); } catch { throw new Error('AI trả về JSON không hợp lệ.'); } }
  return { text, json, model: data.model, usage: data.usage };
}

/** `ai.onStatus(msg)` – tiến trình dài (sinh bài) để UI hiển thị. */
export const ai = {
  onStatus: null as null | ((msg: string) => void),
  provider: () => S.settings.provider || 'claude',
  hasKey: () => { const p = ai.provider(); return p === 'gemini' ? !!S.settings.geminiKey : p === 'openai' ? !!(S.settings.oaiKey || isLocalBase(S.settings.oaiBase)) : !!S.settings.apiKey; },
  modelName: () => { const p = ai.provider(); return p === 'gemini' ? (S.settings.geminiModel || 'gemini-3.8-flash') : p === 'openai' ? (S.settings.oaiModel || '?') : (S.settings.model || 'claude-opus-5-5'); },
  providerLabel: () => ({ claude: 'Claude API', gemini: 'Google Gemini', openai: 'OpenAI-compatible: ' + (S.settings.oaiBase || '') } as Dict<string>)[ai.provider()],
  async call(opts: AiCallOpts): Promise<AiResult> {
    const p = ai.provider();
    if (p === 'gemini') { if (!S.settings.geminiKey) throw new Error('Chưa có Gemini API key. Người vận hành nhập trong Cài đặt.'); return geminiCall(opts); }
    if (p === 'openai') { if (!ai.hasKey()) throw new Error('Chưa có API key cho dịch vụ OpenAI-compatible. Người vận hành nhập trong Cài đặt.'); return openaiCall(opts); }
    return claudeCall(opts);
  },
  /** Kiểm tra kết nối: trả về tên model khi OK, ném lỗi khi không. */
  async ping() { const r = await ai.call({ system: 'Reply with exactly: OK', user: 'ping', maxTokens: 2000 }); return r.model || ai.modelName(); },

  // ---- tasks ----
  assessPlacement(test: TestRecord, u: User) {
    const f = formOf(test)!; const a = test.answers; const ss = test.sectionScores;
    const user = `Learner: ${u.name}. Test kind: ${test.kind}.
Learner profile (self-assessment and certificates are hints only – base the decision on the test evidence; tailor the monthly goal to their job): ${profileSummary(u)}
Automatically scored: Listening ${ss.listening.points}/${ss.listening.max} (${ss.listening.cefr}), Reading/Grammar/Vocabulary ${ss.reading.points}/${ss.reading.max} (${ss.reading.cefr}). Writing is worth ${ss.writing.max} points and Speaking ${ss.speaking.max} points of the 100-point total; the rubric scores you give are scaled to those maxima automatically.
${test.warnings?.length ? `Integrity note: the learner left the test screen ${test.warnings.length} time(s).` : ''}${test.autoSubmitted ? ` The test was auto-submitted (${test.autoReason}).` : ''}

${writingTasks(f).map((t: any) => `WRITING ${t.title} (${t.points || ''} pts): ${t.task}\nMessage: ${t.message}\nRequirement: ${t.requirement}\nLEARNER'S ANSWER (${wordCount(a[t.key])} words):\n${a[t.key] || '(no text)'}`).join('\n\n')}

SPEAKING (speech-to-text transcripts):
${f.speaking.tasks.map((t: any) => `${t.title}\nPrompt: ${t.prompt}\nAnswer: ${a[t.key] || '(no answer)'}`).join('\n\n')}`;
    return ai.call({ system: prompt('placement'), user, schema: SCHEMAS.placement, effort: 'medium' }).then(r => r.json);
  },
  /** Tuần 5 bài siêu ngắn (T2→T6), sinh theo 2 nửa + sửa từng bài hỏng + bổ sung cụm từ. */
  generateWeekLessons({ cefr, topic, job, style, vi, n = 5, plan = [] as string[], persona }: { cefr: Cefr; topic: string; job: string; style: string; vi?: boolean; n?: number; plan?: string[]; persona?: Persona }): Promise<Lesson[]> {
    const planNote = (persona ? ` Phong cách nội dung: ${persona === 'formal' ? 'TRANG TRỌNG (tình huống công việc chính thức: email, họp, khách hàng; giọng lịch sự, không tiếng lóng)' : 'THÂN THIỆN (tình huống trò chuyện hằng ngày với đồng nghiệp; giọng gần gũi)'}.` : '') + (plan.length ? ` Bám sát kế hoạch đã duyệt cho từng ngày: ${plan.map((p, i) => `ngày ${i + 1}: ${p}`).join('; ')}.` : '');
    const explainLang = (vi ?? isLow(cefr)) ? 'tiếng Việt (người học mới bắt đầu, chỉ giữ từ/câu mẫu bằng tiếng Anh)' : 'English';
    const mkSys = (k: number) => prompt('lesson').replace(/\{n\}/g, String(k)).replace(/\{cefr_level\}/g, cefr).replace(/\{topic\}/g, topic || 'giao tiếp công việc').replace(/\{job\}/g, job || 'nhân viên văn phòng').replace(/\{learning_style\}/g, style || 'ví dụ thực tế ngắn gọn').replace(/\{explain_lang\}/g, explainLang);
    const sys = mkSys(n);
    const parseOne = (j: any, i: number): any => {
      const pick = (...keys: string[]) => { for (const k of keys) { const v = j[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; };
      const vocab = (Array.isArray(j.vocab) ? j.vocab : Array.isArray(j.vocabulary) ? j.vocabulary : []).slice(0, 3).map((x: any) => { const e = String(x.e || x.en || x.word || '').trim(); return { e, v: String(x.v || x.vi || x.meaning || '').trim(), ipa: String(x.ipa || '').trim(), phrases: cleanPhrases(x.phrases, e), ...vocabExtras(x, cefr) }; }).filter((x: any) => x.e);
      const str = (v: any) => String(v || '').trim();
      const mcqPart = (o: any, bodyKey: string) => { if (!o || typeof o !== 'object') return null; const p = normPractice({ type: 'mcq', prompt: o.prompt || o.question, options: o.options, answer: o.answer }); const body = str(o[bodyKey]); return body && p.type === 'mcq' && p.options.some(x => normAns(x) === normAns(p.answer)) ? { [bodyKey]: body, prompt: p.prompt, options: p.options, answer: p.answer } : null; };
      const sp = j.speaking && str(j.speaking.answer) ? { prompt: str(j.speaking.prompt), answer: str(j.speaking.answer) } : null;
      const pron = parsePron(j.pron);
      let practice = normPractice(j.practice ?? j.practise ?? j.exercise ?? j.task ?? j.challenge);
      if (!practice.prompt) practice = { type: 'write', prompt: (vi ?? isLow(cefr)) ? `Viết 2 câu về ${topic || 'công việc của bạn'} theo mẫu câu trong lý thuyết, dùng ${vocab.map((x: any) => '"' + x.e + '"').join(', ') || 'từ vừa học'}.` : `Write two sentences about ${topic || 'your work'} with the pattern above, using ${vocab.map((x: any) => '"' + x.e + '"').join(', ') || 'the new words'}.`, options: [], answer: '' };
      if (practice.type !== 'write') practice.answer = keyList(practice.answer)[0] ? String(practice.answer).split(/\s*\/\s*/)[0].trim() : practice.answer;
      practice = ensureFillHint(practice, vocab);
      return { day: clamp(+j.day || i + 1, 1, n), title: pick('title', 'pattern') || `Bài ${i + 1}`, theory: pick('theory', 'explanation', 'lesson') || '—', vocab, practice, explainLang, objective: pick('objective', 'goal'), examples: (Array.isArray(j.examples) ? j.examples : []).map(str).filter((s: string) => s && !hasVi(s) && !isFormula(s)).slice(0, 4), pron, listening: mcqPart(j.listening, 'audio'), reading: mcqPart(j.reading, 'text'), speaking: sp, wordclass: mcqOnly(j.wordclass), worduse: mcqOnly(j.worduse),
        trans: Object.fromEntries(['L', 'R', 'W', 'S'].map(c => [c, { q: str(j.trans?.[c]?.q), a: str(j.trans?.[c]?.a) }]).filter(([, v]: any) => v.q && v.a && hasVi(v.a))) };
    };
    const full = !(S.settings.prompts && S.settings.prompts.lesson);
    const parse = (r: AiResult) => { const arr = Array.isArray(r.json?.lessons) ? r.json.lessons : (r.json && r.json.theory ? [r.json] : []); return arr.slice(0, n).map(parseOne).sort((a: any, b: any) => a.day - b.day); };
    const properVocab = (m: any) => m.vocab.filter((v: any) => /^[A-Z]/.test(v.e) && v.e !== 'I').map((v: any) => v.e).join(', ');
    const okLesson = (m: any) => { if (properVocab(m)) return false; const t = (m.theory || '').toLowerCase(); const used = m.vocab.filter((v: any) => t.includes(v.e.toLowerCase())).length; const meta = /(trắc nghiệm|bài tập|điền từ|chọn câu|exercise|quiz)/i.test(m.theory); return wordCount(m.theory) >= 25 && used >= 2 && !meta && (!full || !!(m.listening && m.reading && m.speaking && m.pron && m.pron.verified && mcq4(m.listening) && mcq4(m.reading))) && !levelViolation(m, cefr); };
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
    const mark = (ls: any[]) => { ls.forEach(m => { m.levelWarn = levelViolation(m, cefr); }); return ls; };
    const arrOf = (r: AiResult) => Array.isArray(r.json?.lessons) ? r.json.lessons : [];
    const half = (k: number, offset: number, extra: string, note: string) => ai.call({ system: mkSys(k) + levelScopeNote(cefr) + (note ? '\n\nLƯU Ý SỬA: ' + note : ''), user: `Tạo ${k} bài học.${planNote}${extra}`, schema: SCHEMAS.lesson, effort: 'low', maxTokens: 8000, noBase: true, lean: true }).then(r => arrOf(r).slice(0, k).map((j: any, i: number) => ({ ...parseOne(j, i), day: offset + i + 1 })));
    const split = async (note: string) => {
      const k1 = Math.ceil(n / 2), k2 = n - k1;
      const a = await half(k1, 0, ` Đây là ${k1} ngày ĐẦU của một tuần ${n} ngày.`, note);
      const second = () => half(k2, k1, ` Đây là ${k2} ngày CUỐI của một tuần ${n} ngày. Các ngày trước đã dạy: ${a.map((x: any) => x.title).join('; ')}. Không lặp lại các mẫu câu đó, khó dần lên.`, note);
      let b; try { b = await second(); } catch (e: any) { if (!/429/.test(e.message)) throw e; await wait(60000); b = await second(); }
      return [...a, ...b];
    };
    const run = (note: string): Promise<any[]> => ai.call({ system: sys + levelScopeNote(cefr) + (note ? '\n\nLƯU Ý SỬA: ' + note : ''), user: `Tạo ${n} bài học.${planNote}`, schema: SCHEMAS.lesson, effort: 'low', maxTokens: 8000, noBase: true, lean: true }).then(parse).catch(e => { if (n > 2 && /cắt ngắn|max tokens/i.test(e.message)) return split(note); throw e; });
    const why = (m: any) => { const out: string[] = []; const v = levelViolation(m, cefr); if (v) out.push('vượt mức – ' + v);
      if (wordCount(m.theory) < 25) out.push('theory quá ngắn'); if (properVocab(m)) out.push('vocab không được là tên riêng: ' + properVocab(m));
      if (full && !(m.listening && m.reading && m.speaking)) out.push('thiếu ' + [!m.listening && 'listening', !m.reading && 'reading', !m.speaking && 'speaking'].filter(Boolean).join(', ') + ' (answer của listening/reading phải trùng nguyên văn một lựa chọn)');
      if (full && m.pron && !m.pron.verified) out.push(`pron cần đủ 3 từ có IPA chứa âm "${m.pron.sound}"`); if (full && !m.pron) out.push('thiếu pron');
      return out.join('; ') || 'chưa đạt kiểm tra chất lượng (theory đủ 3 phần, mỗi từ vocab có trong ví dụ, không nhắc tới bài tập)'; };
    const one = (d: number, all: any[]) => { const cur = all.find(x => x.day === d); const others = all.filter(x => x.day !== d).map(x => x.title).join('; ');
      return half(1, d - 1, ` Đây là bài của ngày ${d} trong một tuần ${n} ngày${cur ? `, giữ mẫu câu "${cur.title}"` : ''}.${others ? ` Các ngày khác đã dạy: ${others} (không lặp lại).` : ''}`, cur ? 'bản trước bị lỗi: ' + why(cur) + '. Viết lại đầy đủ mọi key.' : '').then(a => a[0] || null); };
    const say = (msg: string) => { try { ai.onStatus && ai.onStatus(msg); } catch { } };
    const patient = async <T,>(fn: () => Promise<T>): Promise<T> => { try { return await fn(); } catch (e: any) { if (!/429/.test(e.message)) throw e; say('Gói AI miễn phí đã hết hạn mức của phút này – chờ khoảng 60 giây rồi làm tiếp…'); await wait(60000); return fn(); } };
    return (async () => {
      let ls: any[] = n >= 4 ? await split('') : await run('');
      const days = Array.from({ length: n }, (_, i) => i + 1);
      const todo = days.filter(d => { const m = ls.find(x => x.day === d); return !m || !okLesson(m); }).slice(0, 3);
      for (const d of todo) {
        say(`Bài ngày ${d} chưa đạt kiểm tra chất lượng – đang soạn lại riêng bài này (${todo.indexOf(d) + 1}/${todo.length})…`);
        let fixed: any = null; try { fixed = await patient(() => one(d, ls)); } catch { break; }
        const cur = ls.find(x => x.day === d);
        if (fixed && (!cur || okLesson(fixed) || (!okLesson(cur) && wordCount(fixed.theory) >= wordCount(cur.theory) && (fixed.listening || !cur.listening)))) ls = [...ls.filter(x => x.day !== d), fixed];
      }
      if (!ls.length) throw new Error('AI không trả về bài học hợp lệ. Thử lại sau ít phút.');
      const lack = [...new Set(ls.flatMap(m => m.vocab.filter((v: any) => (v.phrases || []).length < 3).map((v: any) => v.e)))] as string[];
      if (lack.length) { say(`Đang bổ sung cụm từ cho ${lack.length} từ vựng…`); try { const map = await patient(() => fetchPhrases(lack, cefr, topic)); ls.forEach(m => m.vocab.forEach((v: any) => { if ((v.phrases || []).length < 3) v.phrases = cleanPhrases([...(v.phrases || []), ...(map[v.e.toLowerCase()] || [])], v.e); })); } catch { } }
      return mark(ls.sort((a, b) => a.day - b.day));
    })();
  },
  generateMicroLesson(vars: any) { return ai.generateWeekLessons({ ...vars, n: 1 }).then(ls => ls[0] || { theory: '—', vocab: [], practice: normPractice(''), explainLang: '' }); },
  /** Gợi ý khung chủ đề tuần: mỗi tuần ≤4 phương án, mỗi phương án có kế hoạch 5 ngày theo từng mức. */
  suggestWeeks(weekNos: number[]) {
    const L = learners(); const jobs = [...new Set(L.map(x => x.profile?.position).filter(Boolean))].slice(0, 8);
    const goals = PROFILE_OPTS.goals.map(([k, lbl]) => [lbl, L.filter(x => (x.profile?.goals || []).includes(k)).length] as [string, number]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => `${x[0]} (${x[1]})`);
    const lv = LEVELS.map(l => [l, activeLearners().filter(x => x.cefr === l).length] as [string, number]).filter(x => x[1]).map(x => `${x[0]}: ${x[1]}`);
    const learnersTxt = `${L.length} người · mức ${lv.join(', ') || 'chưa xếp'} · nghề: ${jobs.join(', ') || 'nhân viên văn phòng'} · mục đích: ${goals.join(', ') || 'giao tiếp công việc'}`;
    const used = S.weeks.filter(w => w.topic && !weekNos.includes(w.n)).map(w => `T${w.n}: ${w.topic}`).join('; ') || '(chưa có)';
    const lvls = levelsInUse().length ? levelsInUse() : (['A1', 'A2', 'B1'] as Cefr[]);
    const sys = prompt('weeks').replace(/\{n\}/g, String(weekNos.length)).replace(/\{learners\}/g, learnersTxt).replace(/\{used\}/g, used).replace(/\{levels\}/g, lvls.join(', '));
    const str = (v: any) => String(v || '').trim();
    const opt = (o: any) => ({ topic: str(o.topic), description: str(o.description), objectives: str(o.objectives), keyVocabHint: str(o.keyVocabHint), levels: Object.fromEntries((Array.isArray(o.levels) ? o.levels : []).map((l: any) => [str(l.cefr).toUpperCase(), (Array.isArray(l.days) ? l.days : [l.focus]).map((d: any) => str(d).replace(/^T[2-6]\s*[:.\-–]?\s*/i, '')).filter(Boolean).slice(0, LESSONS_PER_WEEK)]).filter((l: any) => l[0] && l[1].length)) });
    return ai.call({ system: sys, user: `Các tuần cần gợi ý: ${weekNos.join(', ')}.`, schema: SCHEMAS.weeks, effort: 'low', maxTokens: Math.min(8000, 1500 + 600 * lvls.length * 3 * weekNos.length), noBase: true }).then(r => (r.json?.weeks || []).map((w: any, i: number) => ({ week: weekNos.includes(+w.week) ? +w.week : weekNos[i], levels: lvls, options: (Array.isArray(w.options) && w.options.length ? w.options : [w]).map(opt).filter((o: any) => o.topic).slice(0, 4) })).filter((w: any) => w.options.length && weekNos.includes(w.week)));
  },
  canTranscribe: () => ai.hasKey() && ['gemini', 'openai'].includes(ai.provider()),
  /** File ghi âm → transcript tiếng Anh (Gemini inline audio / OpenAI-compatible /audio/transcriptions). Claude không nhận audio. */
  async transcribe(file: File): Promise<string> {
    const p = ai.provider(); let res: Response;
    if (p === 'openai') {
      const base = (S.settings.oaiBase || '').replace(/\/+$/, ''); const fd = new FormData(); fd.append('file', file, file.name || 'audio.webm'); fd.append('model', S.settings.sttModel || 'whisper-large-v3-turbo'); fd.append('language', 'en');
      try { res = await fetch(base + '/audio/transcriptions', { method: 'POST', headers: S.settings.oaiKey ? { Authorization: 'Bearer ' + S.settings.oaiKey } : {}, body: fd }); } catch (e: any) { throw new Error('Không gửi được file ghi âm để chép lời. ' + e.message); }
      if (!res.ok) throw new Error(`Dịch vụ AI không chép lời được file này (${res.status}). Kiểm tra "Model chép lời" trong Cài đặt.`);
      return String((await res.json()).text || '').trim();
    }
    if (p === 'gemini') {
      const b64 = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(r.error); r.readAsDataURL(file); });
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(S.settings.geminiModel || 'gemini-3.8-flash')}:generateContent`;
      const body = { contents: [{ role: 'user', parts: [{ text: 'Transcribe the English speech in this audio verbatim. Return only the transcript, with no commentary.' }, { inline_data: { mime_type: (file.type || 'audio/mpeg').split(';')[0], data: b64 } }] }] };
      try { res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': S.settings.geminiKey }, body: JSON.stringify(body) }); } catch (e: any) { throw new Error('Không gửi được file ghi âm để chép lời. ' + e.message); }
      if (!res.ok) throw new Error(`Gemini không chép lời được file này (${res.status}).`);
      const j = await res.json(); return ((j.candidates?.[0]?.content?.parts || []).map((x: any) => x.text || '').join(' ')).trim();
    }
    throw new Error('Nhà cung cấp AI đang chọn không chép lời được file ghi âm.');
  },
  gradeMicro({ cefr, vi, theory, vocab, practice, answer, persona }: { cefr: Cefr; vi?: boolean; theory?: string; vocab?: VocabEntry[]; practice: any; answer: string; persona?: Persona }) {
    const explainLang = (vi ?? isLow(cefr)) ? 'tiếng Việt' : 'English'; const p = normPractice(practice);
    const sys = prompt('mgrade').replace(/\{cefr_level\}/g, cefr).replace(/\{explain_lang\}/g, explainLang).replace(/\{theory\}/g, theory || '').replace(/\{vocab\}/g, (vocab || []).map(v => `${v.e} = ${v.v}`).join('; ')).replace(/\{ptype\}/g, p.type).replace(/\{practice\}/g, p.prompt + (p.options.length ? ' | lựa chọn: ' + p.options.join(' / ') : '')).replace(/\{key\}/g, p.answer || '(không có)').replace(/\{answer\}/g, answer || '');
    return ai.call({ system: (persona ? personaNote(persona).trim() + '\n\n' : '') + sys + RELEVANCE_RULE_GRADE + (persona ? `\nViết "feedback" đúng persona ${persona.toUpperCase()} ở đầu prompt.` : ''), user: 'Chấm bài.', schema: SCHEMAS.mgrade, effort: 'low', maxTokens: 600, noBase: true }).then(r => { const j = r.json || {}; return { score: clamp(Math.round(+j.score || 0), 0, 10), ok: !!j.ok, feedback: String(j.feedback || '').trim(), fix: String(j.fix || '').trim(), at: new Date().toISOString() }; });
  },
  /** Ma trận vận hành: 5 bài/tuần cho một mức theo nghề + phong cách học của nhóm mức đó. */
  generateLessonSet(week: number, cefr: Cefr) {
    const w = weekInfo(week); const L = activeLearners().filter(x => x.cefr === cefr && x.profile);
    const job = [...new Set(L.map(x => x.profile!.position).filter(Boolean))].slice(0, 3).join(', ') || 'nhân viên văn phòng';
    const styleKeys = [...new Set(L.flatMap(x => x.profile!.styles || []))].slice(0, 3); const style = styleKeys.length ? optLabels('styles', styleKeys) : 'ví dụ thực tế ngắn gọn';
    return ai.generateWeekLessons({ cefr, topic: w.topic, job, style, vi: isLow(cefr), n: LESSONS_PER_WEEK, plan: (w.plan || {})[cefr] || [], persona: levelPersona(cefr) }).then(ls => ls.map((m: any) => ({ durationMin: m.listening || m.reading || m.speaking ? 10 : 5, micro: true, ...m, title: m.title || w.topic })));
  },
  coachTurn(session: CoachSession, u: User, lessonsVocab: string[]) {
    const w = weekInfo(session.week); const ch = session.challenge;
    const sys = personaNote(personaOf(u)).trim() + '\n\n' + prompt('coach') + RELEVANCE_RULE_COACH + `\n\nLearner: ${u.name}, CEFR ${u.cefr}. Explanation language for suggestions: ${learnerWantsVi(u) ? 'Vietnamese' : 'English'}.\nLearner profile (use it to pick situations and examples from their real job, and to match their preferred learning style): ${profileSummary(u)}\nWeek topic: ${w.topic}. ${w.description || ''}\nTarget vocabulary this week: ${lessonsVocab.slice(0, 40).join(', ') || '(none yet)'}\n\nReminder: write "reply" and every explanation strictly in the ${personaOf(u).toUpperCase()} persona defined at the top.`
      + (ch ? `\n\nCHALLENGE MODE (overrides the level above): the learner is trying to move up from ${u.cefr} to ${ch.target}. Speak, ask and judge strictly at ${ch.target} level: use ${ch.target}-level vocabulary and structures, ask questions that need ${ch.target}-level answers (reasons, comparisons, opinions, hypotheticals where the level allows), and score the rubric against what a ${ch.target} learner should produce, not against their current level. Do not simplify your language to help them. Keep "reply" to 2-4 sentences.` + levelScopeNote(ch.target) : '');
    const messages = session.messages.slice(-16).map(m => ({ role: m.role, content: m.content }));
    return ai.call({ system: sys, messages, schema: SCHEMAS.coach, effort: 'low' }).then(r => r.json);
  },
  gradeSubmission(sub: Submission, u: User) {
    const w = weekInfo(sub.week);
    const user = `Learner: ${u.name}, CEFR ${u.cefr}. Feedback language: ${learnerWantsVi(u) ? 'Vietnamese' : 'English'}. Profile: ${profileSummary(u)}\nWeek ${sub.week} topic: ${w.topic}.\nTask given: ${sub.task}\nSubmission type: ${sub.type}\nRelevance check first: if the submission does not address the task given (off-topic, about something else, meaningless text, or not in English), meaning must be 0 or 1, total must not exceed 30, and the feedback must start by saying the text does not answer the task.${personaNote(personaOf(u))}\n\nSUBMISSION:\n${sub.text}`;
    return ai.call({ system: prompt('grade'), user, schema: SCHEMAS.grade, effort: 'medium' }).then(r => r.json);
  },
  /** Bộ từ mini game từ chủ đề tự do (AI kiểm tra chủ đề; lỗi `rejected`/`soft` khi từ chối). */
  gameVocab(topic: string, cefr: Cefr, n = 12): Promise<{ topic: string; words: GameWord[]; others: GameWord[] }> {
    return ai.call({ system: prompt('gamevocab').replace(/\{cefr\}/g, cefr).replace(/\{topic\}/g, topic.replace(/"/g, '')).replace(/\{n\}/g, String(n)), user: `Chủ đề người học vừa nhập: "${topic.replace(/"/g, '')}". Mức: ${cefr}. Hãy kiểm tra chủ đề rồi tạo bộ ${n} từ theo đúng JSON.`, schema: SCHEMAS.gamevocab, effort: 'low', maxTokens: 4000, noBase: true, lean: true }).then(r => {
      const j = r.json || {}; if (j.valid === false) { const e: any = new Error(j.reason || 'Chủ đề không phù hợp'); e.rejected = true; e.soft = !!j.soft; throw e; }
      const seen = new Set<string>(); const clean = (x: any) => ({ e: String(x.e || '').toLowerCase().replace(/[^a-z\s'-]/g, '').trim(), v: String(x.v || '').trim(), def: String(x.def || '').trim(), ipa: String(x.ipa || '').trim(), pos: String(x.pos || '').toLowerCase().trim() });
      const words = (j.words || []).map(clean).filter((w: any) => w.e && w.v && !seen.has(w.e) && seen.add(w.e)).slice(0, n);
      if (words.length < 6) throw new Error('AI trả về quá ít từ – thử lại hoặc đổi chủ đề');
      const others = (j.others || []).map(clean).filter((w: any) => w.e && w.v && !seen.has(w.e)).slice(0, 10);
      return { topic: String(j.topic || topic).trim() || topic, words, others };
    });
  },
  /** Đề thi lên mức ngắn ở mức đích (1 lần thử lại nếu đoạn nghe/đọc quá ngắn; vẫn ngắn → gắn cờ `short`). */
  generateLevelForm(target: Cefr) {
    const run = (note: string) => ai.call({ system: prompt('levelform').replace(/\{target\}/g, target) + levelScopeNote(target) + (note ? '\n\nLƯU Ý SỬA: ' + note : ''), user: `Tạo đề thi mức ${target}.`, schema: SCHEMAS.levelform, effort: 'medium', maxTokens: 6000, noBase: true, lean: true }).then(r => levelFormFromJson(r.json, target));
    const short = (f: any) => { const lw = f.listening.parts[0].audio.map((x: any) => x[1]).join(' ').split(/\s+/).length, rw = f.reading.parts[0].text.split(/\s+/).length; return lw < 90 || rw < 100 ? `đoạn nghe đang ${lw} từ (cần 120–180), bài đọc đang ${rw} từ (cần 150–220): viết DÀI HƠN, nhiều chi tiết hơn để 5 câu hỏi có căn cứ trong bài` : ''; };
    return run('').then(f => { const n = short(f); return n ? run(n).then(g => short(g) ? Object.assign(g, { short: true }) : g) : f; });
  }
};
export function levelFormFromJson(j: any, target: Cefr) {
  const qs = (arr: any[], what: string) => { const out = (arr || []).filter(q => q && q.q && Array.isArray(q.options) && q.options.length === 4).slice(0, 5).map(q => mcq(String(q.q).trim(), q.options.map((o: any) => String(o).trim()), clamp(+q.answer || 0, 0, 3), 5)); if (out.length !== 5) throw new Error(`Phần ${what} không đủ 5 câu hỏi 4 lựa chọn – sinh lại`); return out; };
  if (!j || !j.listening || !j.reading || !j.writing || !j.speaking) throw new Error('AI trả về thiếu phần');
  return { title: (j.title || '').trim() || `Level-up test ${target}`,
    listening: { intro: 'Đoạn nghe được phát tối đa 2 lần (giọng đọc của trình duyệt). Nghe xong chọn đáp án.', parts: [{ key: 'L1', title: j.listening.title || 'Part A', instruction: j.listening.instruction || 'Listen and answer questions 1–5.', audio: (j.listening.audio || []).map((x: any) => [String(x.who || 'Speaker'), String(x.line || '')]).filter((x: any) => x[1]), questions: qs(j.listening.questions, 'Nghe') }] },
    reading: { parts: [{ key: 'R1', title: j.reading.title || 'Part A', instruction: j.reading.instruction || 'Read the text and answer questions 1–5.', text: String(j.reading.text || ''), questions: qs(j.reading.questions, 'Đọc') }] },
    writing: { task: String(j.writing.task || ''), message: String(j.writing.message || ''), requirement: 'Please write 80–120 words.', minWords: 80, maxWords: 120 },
    speaking: { tasks: [{ key: 'S1', title: j.speaking.title || 'Task 1 – Scenario (3 phút)', prompt: String(j.speaking.prompt || ''), hint: String(j.speaking.hint || '') }] } };
}
/** Một lời gọi nhỏ: 3 cụm từ cho mỗi từ → {wordLowercase: phrases[]}. */
export async function fetchPhrases(words: string[], cefr: Cefr, topic: string) {
  const r = await ai.call({ system: `Chỉ trả về JSON {"items":[{"e":"word","phrases":["...","...","..."]}]}, không giải thích. Với MỖI từ tiếng Anh được đưa, cho đúng 3 cụm từ/collocation thông dụng CHỨA nguyên từ đó, mỗi cụm 2–5 từ, mức ${cefr}, gắn với chủ đề "${topic || 'giao tiếp công việc'}". Phải là cụm người bản ngữ thật sự dùng, không ghép máy móc; không dùng tên riêng. Giữ nguyên chính tả của từ trong trường "e".${levelScopeNote(cefr)}`, user: 'Các từ: ' + words.join(', '), schema: { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['e', 'phrases'], properties: { e: { type: 'string' }, phrases: { type: 'array', items: { type: 'string' } } } } } } }, effort: 'low', maxTokens: 1500, noBase: true, lean: true });
  const map: Dict<string[]> = {}; (r.json?.items || []).forEach((it: any) => { map[String(it.e || '').trim().toLowerCase()] = it.phrases; }); return map;
}


// =====================================================================================
// LESSONS – cấu trúc bài siêu ngắn, kiểm tra chất lượng, phát âm, form soạn tay, demo
// =====================================================================================
export const isMicroLesson = (l: any) => !!(l && (l.micro || l.theory !== undefined));
/** practice có thể là chuỗi (bản cũ) hoặc {type, prompt, options, answer}. */
export function normPractice(p: any): Practice {
  if (!p) return { type: 'write', prompt: '', options: [], answer: '' };
  if (typeof p === 'string') return { type: 'write', prompt: p.trim(), options: [], answer: '' };
  const type = ['write', 'fill', 'mcq', 'say'].includes(p.type) ? p.type : 'write';
  const options = Array.isArray(p.options) ? p.options.map((o: any) => String(o).trim()).filter(Boolean) : [];
  return { type: type === 'mcq' && options.length < 2 ? 'write' : type, prompt: String(p.prompt || p.task || p.question || '').trim(), options, answer: String(p.answer || p.key || '').trim() };
}
export const practiceText = (p: any) => normPractice(p).prompt;
const VI_PLAIN = new Set(['la', 'khi', 'dung', 'ban', 'nhu', 'voi', 'muon', 'mua', 'thu', 'xem', 'cua', 'cho', 'va', 'hay', 'de', 'co', 'khong', 'nghia', 'cau', 'tu', 'vi', 'du', 'cong', 'thuc']);
/** Lấy các câu tiếng Anh ra khỏi theory lẫn VI/EN. */
export function englishLines(theory?: string) {
  const t = String(theory || '').replace(/\([^)]*\)/g, m => hasVi(m) ? '' : m);
  const tok = "(?:[A-Za-z][A-Za-z'’\\-]*|___|\\d+|\\$\\d+|\\([a-z][a-z ]*\\)|[,+])";
  const re = new RegExp(tok + '(?:\\s+' + tok + ')*[.!?]?', 'g');
  const out: string[] = []; let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const before = t[m.index - 1] || ' ', after = t[m.index + m[0].length] || ' ';
    if (hasVi(before) || hasVi(after)) continue;
    const run = m[0].replace(/^[,+\s]+|[,+\s]+$/g, '').replace(/\s+,/g, ',');
    const words = run.split(/\s+/).filter(w => /[A-Za-z]/.test(w));
    if (words.length < 3 || words.filter(w => /[A-Za-z]{2,}/.test(w)).length < 2) continue;
    if (words.some(w => VI_PLAIN.has(w.toLowerCase()))) continue;
    if (/^(verb|noun|adjective)$/i.test(run)) continue;
    const clean = run.replace(/^(?:verb|noun)\s*=\s*/i, '');
    if (!out.includes(clean)) out.push(clean);
  }
  return out;
}
/** Công thức ngữ pháp (không phải câu) – hiện nhưng không đọc. */
export const isFormula = (line: string) => /[+=]|_{2,}|\.\.\.|…|\(|\)|\/|\[|\]/.test(line) || /\b(subject|verb|verbs|noun|nouns|adjective|adverb|object|pronoun|preposition|infinitive|gerund|V-?ing|V-?ed|to-?V|V[0-3]|Adj|Adv|sb|sth)\b/i.test(line) || /(^|\s)(S|V|O|N)(\s|$)/.test(line);
export const spokenLines = (theory?: string) => englishLines(theory).filter(l => !isFormula(l) && l.split(/\s+/).length >= 3);
export const exampleLines = (m: any): string[] => { const ex = (m.examples || []).map((s: any) => String(s || '').trim()).filter((s: string) => s && !isFormula(s) && !hasVi(s)); return ex.length ? ex : spokenLines(m.theory); };
export const speakable = (s: string) => s.replace(/___/g, ' blank ').replace(/[()]/g, ' ').replace(/\s+/g, ' ');
/** Điền từ phải có đúng một đáp án: thêm nghĩa Việt sau ___ nếu đề chưa gợi ý. */
export function ensureFillHint(p: any, vocab?: VocabEntry[]) {
  const n = normPractice(p); if (n.type !== 'fill' || !n.prompt.includes('___')) return n;
  const first = String(n.answer || '').split(/\s*\/\s*/)[0].trim(); n.answer = first;
  if (/___\s*\(/.test(n.prompt) || !first) return n;
  const v = (vocab || []).find(x => normAns(x.e) === normAns(first)); const hint = v?.v || '';
  if (hint) n.prompt = n.prompt.replace('___', `___ (${hint})`);
  return n;
}
export function fixLessonPractice(l: any) { if (l && l.practice && typeof l.practice === 'object' && l.practice.type === 'fill') l.practice = ensureFillHint(l.practice, l.vocab); }
/** Địa danh / quốc gia đoán được từ tiếng Việt: không bao giờ được làm lựa chọn. */
export const PLACE_RE = /\b(Da ?Nang|Ha ?Noi|Hanoi|Hue|Saigon|Ho Chi Minh|Can Tho|Hai Phong|Nha Trang|Da Lat|Viet ?Nam|Laos|Thailand|Cambodia|Singapore|Malaysia|Indonesia|Philippines|Japan|Korea|China|India|Taiwan|Australia|America|USA|England|London|Paris|Tokyo|Berlin|Seoul|Bangkok|Manila|Jakarta|Sydney|New York)\b/i;
export const mcq4 = (p: any) => !!p && Array.isArray(p.options) && p.options.length === 4 && !p.options.some(hasVi) && !p.options.some((o: string) => PLACE_RE.test(o)) && p.options.some((o: string) => normAns(o) === normAns(p.answer));
// vocabulary detail shapes (AI mới trả object; bản cũ / demo có thể là chuỗi)
export const lexItem = (x: any): LexItem | null => typeof x === 'string' ? { w: x.trim(), v: '' } : x && typeof x === 'object' ? { w: String(x.w || '').trim(), v: String(x.v || '').trim() } : null;
export const lexList = (a: any): LexItem[] => (Array.isArray(a) ? a : []).map(lexItem).filter((x): x is LexItem => !!x && !!x.w).slice(0, 4);
export const umbrellaOf = (x: any): Umbrella | null => typeof x === 'string' ? (x.trim() ? { w: x.trim(), v: '', words: [] } : null) : x && typeof x === 'object' && x.w ? { w: String(x.w).trim(), v: String(x.v || '').trim(), words: lexList(x.words) } : null;
const lexNote = (x: any, keys: string[]): LexNote | null => { if (!x) return null; if (typeof x === 'string') return x.trim() ? { w: x.trim() } : null; if (typeof x !== 'object' || !x.w) return null; const o: any = { w: String(x.w).trim() }; keys.forEach(k => { const s = String(x[k] || '').trim(); if (s) o[k] = s; }); return o; };
export const slangOf = (x: any) => lexNote(x, ['def', 'example', 'context', 'note']);
export const poeticOf = (x: any) => lexNote(x, ['def', 'example', 'source']);
export const lexStale = (v: any, k: string) => k === 'umbrella' ? !!v.umbrella && !(umbrellaOf(v.umbrella)?.words || []).length : (k === 'syn' || k === 'ant') ? lexList(v[k]).some(x => !x.v) : (k === 'slang' || k === 'poetic') ? !!v[k] && !(typeof v[k] === 'object' && v[k].def) : false;
export const mcqOnly = (o: any): McqPart | null => { if (!o || typeof o !== 'object') return null; const p = normPractice({ type: 'mcq', prompt: o.prompt || o.question, options: o.options, answer: o.answer }); return p.type === 'mcq' && mcq4(p) ? { prompt: p.prompt, options: p.options, answer: p.answer } : null; };
export function vocabExtras(x: any, cefr: Cefr) {
  const s = (v: any) => String(v || '').trim(); const hi = !isLow(cefr);
  const out: any = { pos: s(x.pos).toLowerCase(), umbrella: umbrellaOf(x.umbrella) || '', syn: lexList(x.syn), ant: lexList(x.ant), family: (Array.isArray(x.family) ? x.family : []).map((f: any) => ({ w: s(f.w), pos: s(f.pos).toLowerCase(), v: s(f.v) })).filter((f: any) => f.w).slice(0, 4) };
  if (hi) { out.synAll = (Array.isArray(x.synAll) ? x.synAll : []).map((f: any) => ({ w: s(f.w), level: s(f.level).toUpperCase(), note: s(f.note) })).filter((f: any) => f.w).slice(0, 6); out.slang = slangOf(x.slang) || ''; out.poetic = poeticOf(x.poetic) || ''; }
  return out;
}
export const cleanPhrases = (list: any, word: string) => { const seen = new Set<string>(); return (Array.isArray(list) ? list : String(list || '').split(/[;\n]/)).map((p: any) => String(p || '').trim().replace(/[.]+$/, '')).filter((p: string) => p && p.toLowerCase() !== String(word).toLowerCase() && usesWord(p, word) && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase())).slice(0, 3); };
export const phrasesMissing = (l: any): string[] => (l.vocab || []).filter((v: any) => (v.phrases || []).length < 3).map((v: any) => v.e);
export function levelsInUse(extra: Set<Cefr> = new Set()): Cefr[] { const set = new Set<Cefr>(activeLearners().map(x => x.cefr!).filter(Boolean)); S.lessonSets.forEach(l => set.add(l.cefr)); extra.forEach(l => set.add(l)); return LEVELS.filter(l => set.has(l)); }

// ---- level scope check ----
export function levelViolation(m: any, cefr: Cefr) {
  const s = (LEVEL_SCOPE as Dict)[cefr]; if (!s) return '';
  const en = [...englishLines(m.theory || ''), m.listening?.audio, m.reading?.text, m.speaking?.answer, normPractice(m.practice).type !== 'mcq' ? normPractice(m.practice).answer : ''].filter(Boolean).join(' . ');
  if (['A1', 'A2', 'B1'].includes(cefr) && /\b(have|has|had|'ve|'s)\s+been\s+\w+ing\b/i.test(en)) return 'có thì hoàn thành tiếp diễn (have been + V-ing)';
  if (['A1', 'A2'].includes(cefr) && /\b(have|has|'ve)\s+(?:(?:just|already|never|ever)\s+)?(been|done|gone|seen|made|had|worked|finished|sent|written|\w{3,}ed)\b/i.test(en)) return 'có thì hiện tại hoàn thành (have/has + V3)';
  if (['A1', 'A2'].includes(cefr) && /\bwould have\b|\bif\b[^.]*\bwould\b/i.test(en)) return 'có câu điều kiện loại 2/3';
  if (cefr === 'A1' && /\b(was|were)\s+\w+ing\b/i.test(en)) return 'có thì quá khứ tiếp diễn';
  const say = m.speaking?.answer || ''; if (say && wordCount(say) > s.max + 3) return `câu nói mẫu dài ${wordCount(say)} từ (mức ${cefr} tối đa ${s.max})`;
  return '';
}
// ---- pronunciation ----
export const ipaNorm = (s: any) => String(s || '').toLowerCase().replace(/[\/\[\]ˈˌ.()ˑ\s‿]/g, '').replace(/ɹ/g, 'r').replace(/ɡ/g, 'g').replace(/ɛ/g, 'e').replace(/ɝ/g, 'ɜ').replace(/ɚ/g, 'ə').replace(/oʊ/g, 'əʊ').replace(/ː/g, '');
export function ipaHasSound(ipa: string, sound: string) {
  let w = ipaNorm(ipa); const t = ipaNorm(sound); if (!w || !t) return false;
  const DIPH = ['aɪ', 'eɪ', 'ɔɪ', 'aʊ', 'əʊ', 'oʊ', 'ɪə', 'eə', 'ʊə']; const AFFR = ['tʃ', 'dʒ'];
  if (!DIPH.includes(t) && [...t].length <= 2) DIPH.forEach(d => { w = w.split(d).join('|'); });
  if (!AFFR.includes(t)) AFFR.forEach(a => { w = w.split(a).join('|'); });
  return w.includes(t);
}
export const soundWords = (sound: string) => { const k = Object.keys(SOUND_WORDS).find(x => ipaNorm(x) === ipaNorm(sound)); return k ? (SOUND_WORDS as Dict<string>)[k].split(' ').map(p => { const i = p.indexOf(':'); return { w: p.slice(0, i), ipa: '/' + p.slice(i + 1) + '/' }; }) : []; };
/** Nguồn phát mẫu âm: {kind:'spoken', text} (đọc bằng giọng máy) | {kind:'file', url} | null. */
export function soundSource(sound: string) {
  const pick = (map: Dict<string>) => { const k = Object.keys(map).find(x => ipaNorm(x) === ipaNorm(sound)); return k ? map[k] : ''; };
  const file = pick(SOUND_FILES as Dict<string>), spoken = pick(SOUND_SPOKEN as Dict<string>);
  if (spoken) return { kind: 'spoken' as const, text: spoken };
  if (file) return { kind: 'file' as const, url: 'https://commons.wikimedia.org/wiki/Special:FilePath/' + file + '.ogg' };
  return null;
}
export function parsePron(p: any, { trust = false } = {}): Pron | null {
  const str = (v: any) => String(v || '').trim(); if (!p || !(str(p.tip) || str(p.focus) || str(p.sound) || (p.words || []).length)) return null;
  if (trust) { const sound = str(p.sound).replace(/[\/\[\]]/g, ''); const words = (Array.isArray(p.words) ? p.words : []).map(str).filter(Boolean).slice(0, 3); return { sound, focus: str(p.focus) || (sound ? '/' + sound + '/' : ''), tip: str(p.tip), words, ipa: {}, verified: !!sound && words.length >= 3, rejected: [], manual: true }; }
  const sound = str(p.sound).replace(/[\/\[\]]/g, '') || (str(p.focus).match(/\/([^/]+)\//) || [])[1] || '';
  const raw = (Array.isArray(p.words) ? p.words : []).map((x: any) => typeof x === 'string' ? { w: str(x), ipa: '' } : { w: str(x.w || x.word), ipa: str(x.ipa) }).filter((x: any) => x.w);
  const checkable = !!sound && raw.some((x: any) => x.ipa);
  const bank = soundWords(sound); const known = bank.length > 0;
  let good = (checkable ? raw.filter((x: any) => ipaHasSound(x.ipa, sound)) : known ? [] : raw).filter((x: any) => /^[a-z']+$/.test(x.w) || x.w === 'I');
  const rejected = raw.filter((x: any) => !good.includes(x)).map((x: any) => x.w);
  bank.forEach(b => { if (good.length < 3 && !good.some((x: any) => x.w.toLowerCase() === b.w.toLowerCase())) good.push(b); });
  good = good.slice(0, 3);
  return { sound, focus: str(p.focus) || (sound ? '/' + sound + '/' : ''), tip: str(p.tip), words: good.map((x: any) => x.w), ipa: Object.fromEntries(good.filter((x: any) => x.ipa).map((x: any) => [x.w, x.ipa])), verified: (checkable || known) && good.length >= 3, rejected };
}
export const drillWords = (m: any): string[] => m.pron ? [...new Set((m.pron.words || []).map((x: any) => String(x || '').trim()).filter(Boolean))].slice(0, 3) as string[] : [];

// ---- lesson structure: 4 skills + exercises ----
export interface LessonPart { code: PartCode; practice: Practice; context: string }
export function lessonParts(l: any): LessonPart[] {
  const out: LessonPart[] = [];
  if (l.listening) out.push({ code: 'L', practice: normPractice({ type: 'mcq', ...l.listening }), context: 'Đoạn nghe (listening audio): ' + l.listening.audio });
  if (l.reading) out.push({ code: 'R', practice: normPractice({ type: 'mcq', ...l.reading }), context: 'Đoạn đọc (reading text): ' + l.reading.text });
  if (normPractice(l.practice).prompt) out.push({ code: 'W', practice: normPractice(l.practice), context: '' });
  if (l.wordclass && normPractice({ type: 'mcq', ...l.wordclass }).type === 'mcq') out.push({ code: 'C', practice: normPractice({ type: 'mcq', ...l.wordclass }), context: 'Bài tập từ loại (word class)' });
  if (l.worduse && normPractice({ type: 'mcq', ...l.worduse }).type === 'mcq') out.push({ code: 'U', practice: normPractice({ type: 'mcq', ...l.worduse }), context: 'Bài tập cách dùng từ (word use)' });
  if (l.speaking) out.push({ code: 'S', practice: { type: 'say', prompt: l.speaking.prompt || '', options: [], answer: l.speaking.answer || '' }, context: '' });
  return out;
}
export const detailsMissing = (l: any) => isMicroLesson(l) && ((l.vocab || []).some((v: any) => !v.pos || ['umbrella', 'syn', 'ant', 'slang', 'poetic'].some(k => lexStale(v, k))) || !l.wordclass || !l.worduse || ['listening', 'reading'].some(k => l[k] && ((l[k].options || []).length < 4 || (l[k].options || []).some((o: string) => PLACE_RE.test(o)))));
export const isFullLesson = (l: any) => isMicroLesson(l) && SKILL_CODES.every(c => lessonParts(l).some(p => p.code === c)) && !!l.pron && (l.vocab || []).length > 0 && !!l.theory;
export const partKey = (id: string, code: PartCode | string) => code === 'W' ? id : id + '~' + code;
/** {attempts, ok, done}: done = đúng hoặc hết lượt (chỉ khi đó mới hiện đáp án). */
export function resState(res: any) {
  if (!res || (res.localOk === undefined && !res.grade && !res.attempts)) return { attempts: 0, ok: null as boolean | null, done: false };
  const ok: boolean = res.ok ?? (res.grade ? !!res.grade.ok : !!res.localOk); const attempts: number = res.attempts || 1;
  return { attempts, ok, done: ok || attempts >= MAX_ATTEMPTS };
}
/** Câu nói vs câu mẫu: đạt khi thiếu ≤20% từ của câu mẫu. */
export function sayMatch(said: string, model: string) { const w = (s: string) => normAns(s).split(' ').filter(Boolean); const have = new Set(w(said)); const need = w(model); const missing = need.filter(x => !have.has(x)); return { ok: need.length > 0 && missing.length / need.length <= 0.2, missing }; }
/** Giải thích không được chứa đáp án khi còn lượt. */
export function maskAnswer(text: string, p: Practice) {
  if (!text || !p.answer) return text || ''; const q = p.answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return p.type === 'write' ? text.replace(new RegExp(q, 'gi'), '▢▢▢') : text.replace(new RegExp('(^|[^A-Za-z])' + q + '(?![A-Za-z])', 'gi'), (m, pre) => pre + '▢▢▢');
}
export function ladderHint(p: Practice, attempts: number, vi: boolean) {
  const a = String(p.answer || ''); const T2 = (x: string, y: string) => vi ? x : y; if (!a || attempts < 2) return '';
  if (p.type === 'fill') return attempts >= 4 ? T2(`từ cần điền có ${a.length} chữ cái và bắt đầu bằng "${a.slice(0, 2)}…"`, `the word has ${a.length} letters and starts with "${a.slice(0, 2)}…"`) : attempts === 3 ? T2(`từ cần điền có ${a.length} chữ cái, chữ đầu là "${a[0]}"`, `the word has ${a.length} letters; the first one is "${a[0]}"`) : T2('đọc lại nghĩa trong ngoặc rồi tìm từ đó ở phần Từ vựng', 'reread the meaning in brackets and find that word in Vocabulary');
  if (p.type === 'mcq') return T2('các lựa chọn bạn đã thử sai được gạch đi; so từng lựa chọn còn lại với nội dung đã nghe/đọc', 'the options you already tried are crossed out; compare each remaining one with what you heard/read');
  if (p.type === 'write') return attempts >= 3 ? T2(`câu mẫu có ${wordCount(a)} từ và bắt đầu bằng "${a.split(/\s+/)[0]}…"`, `the model sentence has ${wordCount(a)} words and starts with "${a.split(/\s+/)[0]}…"`) : T2('đối chiếu từng thành phần của câu bạn viết với công thức ở phần Ngữ pháp', 'check each part of your sentence against the pattern in Grammar');
  return '';
}
export const PART_HINTS = (vi: boolean): Record<PartCode, string> => ({ L: vi ? 'Nghe lại đoạn audio, chú ý từ khoá có trong câu hỏi.' : 'Listen again and focus on the key words of the question.', R: vi ? 'Đọc lại đoạn văn, tìm câu chứa thông tin được hỏi.' : 'Read the text again and find the sentence with that information.', W: vi ? 'Xem lại công thức ở phần Ngữ pháp và gợi ý trong đề.' : 'Check the pattern in Grammar and the hint in the task.', C: vi ? 'Xem từ loại ghi cạnh từ vựng ở phần Học: danh từ chỉ người/vật, động từ chỉ hành động, tính từ mô tả.' : 'Check the part of speech shown next to the word in the study section: nouns name things, verbs are actions, adjectives describe.', U: vi ? 'Xem lại 3 cụm từ đi kèm từ vựng: từ đó thường đứng cạnh những từ nào?' : 'Look at the 3 phrases of the word: which words usually go next to it?', S: '' });

// ---- enrich an existing lesson with AI ----
export async function enrichLesson(l: any, cefr: Cefr, topic: string) {
  const parts: Dict<any> = { L: l.listening, R: l.reading, W: normPractice(l.practice).type === 'mcq' ? normPractice(l.practice) : null };
  const need3 = Object.entries(parts).filter(([, p]) => p && (p.options || []).length === 3);
  const user = `Mức: ${cefr}. Chủ đề: ${topic || 'giao tiếp công việc'}.\nTừ vựng: ${(l.vocab || []).map((v: any) => `${v.e} (${v.v})`).join('; ')}\nCâu ví dụ: ${exampleLines(l).join(' | ')}${need3.length ? '\nCác câu trắc nghiệm mới có 3 lựa chọn, cần thêm 1 lựa chọn SAI thứ tư bằng tiếng Anh, hợp ngữ cảnh:\n' + need3.map(([k, p]) => `${k}: "${p.prompt}" – lựa chọn hiện có: ${p.options.join(' / ')} – đáp án: ${p.answer}`).join('\n') : ''}`;
  const sys = `Chỉ trả về JSON, không bọc markdown. Bổ sung cho một bài học tiếng Anh công sở mức {cefr}: với MỖI từ vựng cho "pos" (từ loại tiếng Anh), "family" (2–3 từ cùng gốc [{"w","pos","v"}], "v" = nghĩa Việt), "umbrella" ({"w": từ bao trùm, "v": nghĩa Việt, "words": 3–4 từ khác cùng nhóm [{"w","v"}]}), "syn" (1–2 đồng nghĩa cùng mức [{"w","v"}], luôn có nghĩa Việt), "ant" (trái nghĩa cùng mức [{"w","v"}] chỉ khi thật sự có, không thì []), ${isLow(cefr) ? '"synAll": [], "slang": null, "poetic": null' : '"synAll" (3–5 đồng nghĩa ở mọi mức [{"w","level","note"}]), "slang" ({"w","def","example","context","note"} hoặc null), "poetic" ({"w","def","example","source": tác phẩm/tác giả thật} hoặc null)'}. Không dùng địa danh / tên riêng làm lựa chọn. Thêm "wordclass" = {"prompt": 1 câu ví dụ của bài chứa 1 từ vựng + " What part of speech is '<từ>' in this sentence?", "options": 4 từ loại tiếng Anh, "answer"} và "worduse" = {"prompt": "Which sentence uses '<từ vựng>' correctly?", "options": 4 câu tiếng Anh ngắn chỉ 1 câu đúng, "answer": câu đúng}. "extra" = {"L","R","W"}: 1 lựa chọn sai thứ tư cho các câu được liệt kê (không có thì ""). Toàn bộ lựa chọn bằng tiếng Anh.`.replace(/\{cefr\}/g, cefr) + levelScopeNote(cefr);
  const schema = { type: 'object', additionalProperties: false, required: ['vocab', 'wordclass', 'worduse', 'extra'], properties: { vocab: { type: 'array', items: VOCAB_SCHEMA }, wordclass: MCQ_SCHEMA, worduse: MCQ_SCHEMA, extra: { type: 'object', additionalProperties: false, properties: { L: { type: 'string' }, R: { type: 'string' }, W: { type: 'string' } } } } };
  const r = await ai.call({ system: sys, user, schema, effort: 'low', maxTokens: 3000, noBase: true, lean: true }); const j = r.json || {}; let changed = false;
  (j.vocab || []).forEach((x: any) => { const v = (l.vocab || []).find((v: any) => v.e.toLowerCase() === String(x.e || '').trim().toLowerCase()); if (!v) return; const ex = vocabExtras(x, cefr); Object.keys(ex).forEach(k => { const has = Array.isArray(ex[k]) ? ex[k].length : ex[k]; const old = Array.isArray(v[k]) ? v[k].length : v[k]; if (has && (!old || lexStale(v, k))) { v[k] = ex[k]; changed = true; } }); });
  if (!l.wordclass && mcqOnly(j.wordclass)) { l.wordclass = mcqOnly(j.wordclass); changed = true; }
  if (!l.worduse && mcqOnly(j.worduse)) { l.worduse = mcqOnly(j.worduse); changed = true; }
  need3.forEach(([k, p]) => { const o = String((j.extra || {})[k] || '').trim(); if (!o || hasVi(o) || p.options.some((x: string) => normAns(x) === normAns(o))) return; if (k === 'W') l.practice.options = [...p.options, o]; else l[k === 'L' ? 'listening' : 'reading'].options = [...p.options, o]; changed = true; });
  return changed;
}

// ---- hand-written lesson form <-> lesson ----
export function lessonToFields(l: any): Dict<string> {
  const p = normPractice(l.practice); const v = (i: number) => { const x = (l.vocab || [])[i]; return x ? [x.e, x.ipa || '', x.v, (x.phrases || []).join('; ')].join(' | ') : ''; };
  return { title: l.title || '', objective: l.objective || '', theory: l.theory || '', examples: exampleLines(l).join('; '), vocab1: v(0), vocab2: v(1), vocab3: v(2), sound: l.pron?.sound || '', tip: l.pron?.tip || '', words: (l.pron?.words || []).join(', '),
    l_audio: l.listening?.audio || '', l_q: l.listening?.prompt || '', l_opts: (l.listening?.options || []).join(' | '), l_a: l.listening?.answer || '',
    r_text: l.reading?.text || '', r_q: l.reading?.prompt || '', r_opts: (l.reading?.options || []).join(' | '), r_a: l.reading?.answer || '',
    w_type: ({ fill: 'điền từ', mcq: 'trắc nghiệm', write: 'tự viết' } as Dict<string>)[p.type] || 'tự viết', w_q: p.prompt, w_opts: p.options.join(' | '), w_a: p.answer, s_q: l.speaking?.prompt || '', s_a: l.speaking?.answer || '' };
}
/** Form (key của DOC_FIELDS) → bài học + danh sách mục thiếu. Khi sửa bài cũ, giữ các chi tiết form không hiện (pos, family, bản dịch…). */
export function fieldsToLesson(f: Dict<string>, day: number, week: number, cefr: Cefr, existing: any[], editorId?: string | null) {
  const split = (s: any) => String(s || '').split('|').map(z => z.trim()).filter(Boolean);
  const problems: string[] = []; const need = (k: string, name: string) => { if (!f[k]) problems.push('thiếu ' + name); };
  need('title', 'tiêu đề'); need('theory', 'ngữ pháp');
  const cols = (s: any) => String(s || '').split('|').map(z => z.trim());
  const vocab: any[] = ['vocab1', 'vocab2', 'vocab3'].map(k => cols(f[k])).filter(p => p[0]).map(p => p.length >= 3 ? { e: p[0], ipa: p[1], v: p[2], phrases: cleanPhrases(p.slice(3).join(';'), p[0]) } : { e: p[0], ipa: '', v: p[1] || '', phrases: [] });
  if (vocab.length < 3) problems.push(`mới có ${vocab.length}/3 từ vựng`); if (vocab.some(v => !v.v)) problems.push('từ vựng thiếu nghĩa tiếng Việt');
  const noPhr = vocab.filter(v => v.phrases.length < 3).map(v => v.e); if (noPhr.length) problems.push(`chưa đủ 3 cụm từ chứa từ đó cho: ${noPhr.join(', ')}`);
  const mcqF = (body: string, bodyKey: string, q: string, opts: string, a: string, name: string) => { if (!f[body] && !f[q] && !f[opts] && !f[a]) { problems.push('thiếu phần ' + name); return null; } const options = split(f[opts]); if (!f[body]) problems.push(name + ': thiếu nội dung'); if (!f[q]) problems.push(name + ': thiếu câu hỏi'); if (options.length < 2) problems.push(name + ': cần ít nhất 2 lựa chọn'); else if (options.length < 4) problems.push(name + ': chuẩn mới là 4 lựa chọn'); if (!options.some(o => normAns(o) === normAns(f[a]))) problems.push(name + ': đáp án phải trùng nguyên văn một lựa chọn'); return { [bodyKey]: f[body] || '', prompt: f[q] || '', options, answer: f[a] || '' } as any; };
  const listening = mcqF('l_audio', 'audio', 'l_q', 'l_opts', 'l_a', 'Nghe'), reading = mcqF('r_text', 'text', 'r_q', 'r_opts', 'r_a', 'Đọc');
  const tk = docKey(f.w_type || ''); const type = /dien|fill/.test(tk) ? 'fill' : /trac|mcq|chon/.test(tk) ? 'mcq' : 'write';
  let practice = normPractice({ type, prompt: f.w_q, options: split(f.w_opts), answer: f.w_a });
  if (!f.w_q) problems.push('thiếu phần Viết'); else { if (!f.w_a) problems.push('Viết: thiếu đáp án'); if (type === 'fill' && !/_{2,}/.test(f.w_q)) problems.push('Viết (điền từ): đề cần có chỗ trống ___'); if (type === 'mcq' && !practice.options.some(o => normAns(o) === normAns(practice.answer))) problems.push('Viết (trắc nghiệm): đáp án phải trùng một lựa chọn'); }
  practice = ensureFillHint(practice, vocab);
  const speaking = f.s_a ? { prompt: f.s_q || 'Nói to câu sau:', answer: f.s_a } : null; if (!speaking) problems.push('thiếu phần Nói (câu mẫu)');
  let pron: Pron | null = null; if (f.sound || f.words || f.tip) { pron = parsePron({ sound: f.sound, tip: f.tip, words: String(f.words || '').split(/[,;|]/).map(z => z.trim()).filter(Boolean) }, { trust: true }); if (!f.sound) problems.push('Phát âm: thiếu âm mục tiêu'); if ((pron?.words || []).length < 3) problems.push('Phát âm: cần đủ 3 từ luyện'); } else problems.push('thiếu phần Phát âm');
  const old = existing.find((z, zi) => (z.day || zi + 1) === day);
  if (old) { vocab.forEach(v => { const o = (old.vocab || []).find((x: any) => String(x.e || '').toLowerCase() === v.e.toLowerCase()); if (o) Object.keys(o).forEach(k => { if (!(k in v)) v[k] = o[k]; }); }); }
  const op = old ? normPractice(old.practice) : null;
  const same: Dict<() => boolean> = { L: () => old.listening && listening && old.listening.prompt === listening.prompt && old.listening.answer === listening.answer, R: () => old.reading && reading && old.reading.prompt === reading.prompt && old.reading.answer === reading.answer, W: () => !!op && op.prompt === practice.prompt && op.answer === practice.answer, S: () => old.speaking && speaking && old.speaking.answer === speaking.answer, C: () => true, U: () => true };
  const trans = old && old.trans ? Object.fromEntries(Object.entries(old.trans).filter(([c]) => same[c] && same[c]())) : undefined;
  return { problems, lesson: { id: old?.id || uid('l'), day, order: day, title: f.title || `Bài ngày ${day}`, objective: f.objective || '', theory: f.theory || '', examples: String(f.examples || '').split(/[;\n]/).map(z => z.trim()).filter(z => z && !isFormula(z)), vocab, pron, listening: listening && listening.audio ? listening : null, reading: reading && reading.text ? reading : null, speaking, practice,
    micro: true, manual: true, durationMin: 10, cefr, week, explanationLang: isLow(cefr) ? 'vi' : 'en', explainLang: isLow(cefr) ? 'tiếng Việt' : 'English', editedBy: editorId || null, editedAt: new Date().toISOString(), wordclass: old?.wordclass, worduse: old?.worduse, trans } as Lesson };
}
/** Gộp input của form soạn tay (vocabN_w/ipa/v/p, l_opt0..3 + l_ans…) về đúng key của DOC_FIELDS. */
export function mergeLessonFormInputs(f: Dict<string>) {
  const o = { ...f };
  [1, 2, 3].forEach(i => { o['vocab' + i] = o[`vocab${i}_w`] ? [o[`vocab${i}_w`], o[`vocab${i}_ipa`], o[`vocab${i}_v`], o[`vocab${i}_p`]].join(' | ') : ''; });
  ['l', 'r'].forEach(p => { const opts = [0, 1, 2, 3].map(i => o[`${p}_opt${i}`]).filter(Boolean); if (opts.length || o[p + '_ans'] !== undefined) { o[p + '_opts'] = opts.join(' | '); o[p + '_a'] = o[`${p}_opt${+(o[p + '_ans'] || 0)}`] || ''; } });
  if ([0, 1, 2, 3].some(i => o['w_opt' + i] !== undefined)) o.w_opts = [0, 1, 2, 3].map(i => o['w_opt' + i]).filter(Boolean).join(' | ');
  return o;
}

// ---- demo lessons ----
export function demoLessons(cefr: Cefr, week = 1): Lesson[] {
  const vi = isLow(cefr); const mc = (key: string, a: any[]) => ({ [key]: a[0], prompt: a[1], options: a[2], answer: a[2][a[3]] });
  const split = (s: any) => s ? String(s).split(/\s*,\s*/).filter(Boolean).map(w => ({ w, v: (DEMO_VI as Dict<string>)[w] || '' })) : []; const fam = (s: any) => s ? String(s).split(';').map(x => { const [w, pos, v] = x.split('|'); return { w, pos: pos || '', v: v || '' }; }) : [];
  const synAll = (s: any) => s ? String(s).split(';').map(x => { const k = x.lastIndexOf(':'); return { w: x.slice(0, k), level: x.slice(k + 1), note: '' }; }) : [];
  const umb = (w: any) => w ? { w, v: ((DEMO_UMB as Dict<any>)[w] || [''])[0], words: (((DEMO_UMB as Dict<any>)[w] || [])[1] || []).map(([mw, mv]: any) => ({ w: mw, v: mv })) } : '';
  const lexd = (w: any) => w ? ((DEMO_LEX as Dict<any>)[w] || { w }) : '';
  const POS = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'phrase']; const rot = (a: string[], k: number) => a.slice(k % a.length).concat(a.slice(0, k % a.length));
  return ((DEMO_LESSONS as Dict<any[]>)[cefr] || []).map((o: any, i: number) => { const cw = o.v[0]; const pos = cw[6] || 'noun'; const sent = (o.ex || []).find((s: string) => new RegExp('\\b' + cw[0].split(' ')[0], 'i').test(s)) || (o.ex || [])[0] || ''; const U = o.U;
    return { id: uid('l'), day: i + 1, order: i + 1, micro: true, demo: true, durationMin: 10, cefr, week, explanationLang: vi ? 'vi' : 'en', explainLang: vi ? 'tiếng Việt' : 'English',
      title: o.t, objective: o.o, theory: o.g, examples: o.ex, vocab: o.v.map((x: any[]) => ({ e: x[0], ipa: x[1], v: x[2], phrases: x.slice(3, 6), pos: x[6] || '', umbrella: umb(x[7]), syn: split(x[8]), ant: split(x[9]), family: fam(x[10]), ...(vi ? {} : { synAll: synAll(x[11]), slang: lexd(x[12]), poetic: lexd(x[13]) }) })), pron: parsePron({ sound: o.s[0], focus: o.s[1], tip: o.s[2], words: [] }),
      listening: mc('audio', o.L) as any, reading: mc('text', o.R) as any, practice: { type: o.W[0], prompt: o.W[1], answer: o.W[2], options: o.W[3] || [] }, speaking: { prompt: o.S[0], answer: o.S[1] },
      wordclass: cw[6] ? { prompt: `"${sent}" – What part of speech is "${cw[0]}" in this sentence?`, options: rot([pos, ...POS.filter(p => p !== pos).slice(0, 3)], i), answer: pos } : null,
      worduse: U ? { prompt: `Which sentence uses "${U[0]}" correctly?`, options: rot([U[1], U[2], U[3], U[4]], i), answer: U[1] } : null,
      trans: { L: { q: o.tr[0], a: o.tr[1] }, R: { q: o.tr[2], a: o.tr[3] }, W: { q: o.tr[4], a: o.tr[5] }, S: { q: o.tr[6], a: o.tr[7] }, ...(cw[6] ? { C: { q: `Từ "${cw[0]}" trong câu này thuộc từ loại nào?`, a: POS_VI[pos] || pos } } : {}), ...(U ? { U: { q: `Câu nào dùng từ "${U[0]}" đúng?`, a: U[5] } } : {}) } } as Lesson; });
}
export function upgradeOldDemoSets() {
  let n = 0;
  (S.lessonSets || []).forEach(ls => {
    if (!ls.lessons.length || !(DEMO_LESSONS as Dict)[ls.cefr] || !ls.lessons.every(l => !isMicroLesson(l) && OLD_DEMO_TITLES.includes(l.title))) return;
    const fresh = demoLessons(ls.cefr, ls.week); fresh.forEach((l, i) => { if (ls.lessons[i]) l.id = ls.lessons[i].id; }); ls.lessons = fresh; n++;
  });
  return n;
}


// =====================================================================================
// PLACEMENT / FINAL / LEVEL-UP TEST – chấm điểm, bản nháp, đồng hồ từng phần, cảnh báo
// =====================================================================================
export const levelForms = () => (S.levelForms = S.levelForms || []);
export const levelRequests = () => (S.levelRequests = S.levelRequests || []);
/** Đề của một bài thi / bản nháp: đề built-in A/B hoặc đề lên mức đã duyệt. */
export const formOf = (t: any) => (t && (TEST_FORMS as Dict)[t.form]) || levelForms().find(f => f.id === t?.form)?.form || null;
export const approvedLevelForm = (target: Cefr) => levelForms().find(f => f.target === target && f.status === 'approved');
/** Thời gian (giây) của một phần; đề lên mức = một nửa. */
export const testDurSec = (sec: Section, kind?: TestKind) => (((S.settings.testTimes || {})[sec]) || ({ listening: 15, reading: 25, writing: 20, speaking: 15 } as Record<Section, number>)[sec]) * (kind === 'levelup' ? 30 : 60);
export const writingTasks = (f: any): any[] => f.writing.tasks || [{ key: 'writing', title: 'Task', task: f.writing.task, message: f.writing.message, requirement: f.writing.requirement, minWords: f.writing.minWords, maxWords: f.writing.maxWords, points: f.writing.points || 25 }];
export function sectionMax(f: any, k: Section): number {
  if (k === 'listening' || k === 'reading') return sum(f[k].parts.map((p: any) => sum(p.questions.map((q: any) => q.pts))));
  if (k === 'writing') return f.writing.points || sum(writingTasks(f).map(t => t.points || 0)) || 25;
  return f.speaking.points || 25;
}
export const secScore = (points: number, max: number, extra: Dict = {}): SectionScore => ({ points, max, pct: max ? Math.round(points / max * 100) : 0, cefr: skillCefr(points, max), ...extra });
export function objectiveScore(form: any, skill: 'listening' | 'reading', answers: Dict) { let pts = 0, max = 0; form[skill].parts.forEach((p: any) => p.questions.forEach((q: any, i: number) => { max += q.pts; if (answers[`${p.key}_${i}`] === q.answer) pts += q.pts; })); return { points: pts, max }; }
/** Nghe/Đọc chấm tự động; Viết/Nói điểm tạm theo độ dài (≤60%) cho tới khi AI / vận hành chấm rubric. */
export function scoreTest(T: any) {
  const f = formOf(T); const a = T.answers; const sec: any = {};
  (['listening', 'reading'] as const).forEach(k => { const r = objectiveScore(f, k, a); sec[k] = secScore(r.points, r.max); });
  const wMax = sectionMax(f, 'writing'), sMax = sectionMax(f, 'speaking');
  const tasks = writingTasks(f); const w = sum(tasks.map(t => wordCount(a[t.key])));
  const wp = clamp(Math.round(sum(tasks.map(t => Math.min(1, wordCount(a[t.key]) / (t.minWords || 1)) * (t.points || wMax / tasks.length))) * 0.6), 0, wMax);
  const sw = sum(f.speaking.tasks.map((t: any) => wordCount(a[t.key]))); const sp = clamp(Math.round(Math.min(1, sw / (50 * f.speaking.tasks.length)) * sMax * 0.6), 0, sMax);
  sec.writing = secScore(wp, wMax, { heuristic: true, words: w }); sec.speaking = secScore(sp, sMax, { heuristic: true, words: sw });
  const total = sum(SECTIONS.map(k => sec[k].points));
  return { sectionScores: sec as Record<Section, SectionScore>, total, rawLevel: totalCefr(total) };
}
/** Rubric Viết (5×1–5=25) và Nói (4×1–5=20) quy đổi về điểm tối đa của phần. */
export function recomputeTest(test: TestRecord) {
  const ss = test.sectionScores;
  if (test.writingRubric) { const max = ss.writing.max || 25; const p = clamp(Math.round(sum(WRITING_CRITERIA.map(([k]) => +test.writingRubric![k] || 0)) / 25 * max), 0, max); ss.writing = { ...ss.writing, ...secScore(p, max), heuristic: false }; }
  if (test.speakingRubric) { const max = ss.speaking.max || 25; const p = clamp(Math.round(sum(SPEAKING_CRITERIA.map(([k]) => +test.speakingRubric![k] || 0)) / 20 * max), 0, max); ss.speaking = { ...ss.speaking, ...secScore(p, max), heuristic: false }; }
  test.total = sum(SECTIONS.map(k => ss[k].points)); test.rawLevel = totalCefr(test.total);
}
export function applyAiAssessment(test: TestRecord, r: any) { test.writingRubric = r.writing; test.speakingRubric = r.speaking; test.rationale = r.rationale; test.monthlyGoal = r.monthlyGoal; test.aiScored = true; test.gradedBy = 'ai'; recomputeTest(test); test.aiSuggestedCefr = r.cefr || test.rawLevel; }
export function syncUserFromTest(u: User, test: TestRecord) { if (test.kind !== 'placement') return; u.cefrSuggested = test.aiSuggestedCefr || test.rawLevel; u.sectionScores = test.sectionScores; if (test.monthlyGoal && !u.monthlyGoal) u.monthlyGoal = test.monthlyGoal; }

// ---- drafts (per learner, per kind) ----
export const draftKey = (userId: string, kind: TestKind) => userId + ':' + kind;
export function getDraft(userId: string, kind: TestKind) {
  S.testDrafts = S.testDrafts || {};
  const old = S.session.testDraft; if (old) { if (old.userId && old.kind && !S.testDrafts[draftKey(old.userId, old.kind)]) S.testDrafts[draftKey(old.userId, old.kind)] = old; delete S.session.testDraft; }
  const d = S.testDrafts[draftKey(userId, kind)]; return d && d.userId === userId ? d : null;
}
export const draftStarted = (userId: string, kind: TestKind) => { const d = getDraft(userId, kind); return !!d && Object.keys(d.sections || {}).length > 0; };

/** Bộ máy làm bài thi (headless). UI gắn: `on('tick')`, `on('countdown')`, `on('warning')`, `on('submitted')`; gọi `integrityWarning()` từ visibilitychange/blur. */
export class TestEngine extends Emitter {
  T: any = null; private tickTimer: any = null; pendingAuto: any = null; micGraceUntil = 0; private lastWarnAt = 0; pickerGrace = false;
  get kind(): TestKind | null { return this.T?.kind || null; }
  get form() { return formOf(this.T); }
  get step() { return this.T ? TEST_STEPS[this.T.step] : null; }
  curSection(): Section | null { return this.T && this.T.step >= 1 && this.T.step <= SECTIONS.length ? SECTIONS[this.T.step - 1] : null; }
  /** Có thể mở bài thi `kind` cho `u` không (các điều kiện của route #/test/:kind). */
  canOpen(kind: TestKind, u: User): { ok: boolean; reason?: string; redirect?: string } {
    if (u.role !== 'learner') return { ok: false, redirect: '/' };
    if (!['placement', 'final', 'levelup'].includes(kind)) return { ok: false, redirect: '/home' };
    if (kind === 'placement' && u.cefrApproved) return { ok: false, redirect: '/home' };
    if (kind === 'placement' && !u.profile) return { ok: false, reason: 'Điền hồ sơ cá nhân trước nhé', redirect: '/onboard' };
    if (kind === 'final' && userTest(u.id, 'final')) return { ok: false, redirect: '/profile' };
    if (kind === 'final' && !isLastWeek()) return { ok: false, reason: 'Bài cuối kỳ mở ở tuần cuối pilot', redirect: '/home' };
    if (kind === 'levelup' && !draftStarted(u.id, 'levelup')) { const e = levelUpEligibility(u); if (!e.ok) return { ok: false, reason: e.reason, redirect: '/home' }; }
    return { ok: true };
  }
  /** Mở (hoặc tiếp tục) bản nháp. Trả về false khi không có đề. */
  start(kind: TestKind) {
    const uidNow = S.session.userId!; const d = getDraft(uidNow, kind);
    if (d && d.kind === kind && d.sections && Array.isArray(d.warnings) && d.plays) { this.T = d; }
    else {
      if (d && (!d.sections || !Array.isArray(d.warnings))) notify('Bản nháp bài test cũ không còn dùng được – bắt đầu lại từ đầu.', '');
      let form = 'A', target: Cefr | null = null;
      if (kind === 'final') form = userTest(uidNow, 'placement')?.form === 'B' ? 'A' : 'B';
      if (kind === 'levelup') { const e = levelUpEligibility(userById(uidNow)!); form = e.form.id; target = e.target; }
      this.T = { kind, form, target, step: 0, answers: {}, plays: {}, sections: {}, warnings: [], userId: uidNow, startedAt: new Date().toISOString() };
      S.testDrafts![draftKey(uidNow, kind)] = this.T; save();
    }
    if (!formOf(this.T)) { this.T = null; return false; }
    return true;
  }
  saveDraft() { if (!this.T) return; S.testDrafts = S.testDrafts || {}; S.testDrafts[draftKey(this.T.userId, this.T.kind)] = this.T; save(); }
  /** Dữ liệu màn intro: bảng phần/thời gian/điểm/mô tả. */
  overview() {
    const f = this.form; if (!f) return null; const timed = S.settings.testTimed !== false; const nQ = (skill: string) => sum(f[skill].parts.map((p: any) => p.questions.length)); const wTasks = writingTasks(f);
    const desc: Record<Section, string> = { listening: `${f.listening.parts.length} đoạn audio, ${nQ('listening')} câu, mỗi đoạn nghe tối đa 2 lần`, reading: `${f.reading.parts.some((p: any) => p.text) ? f.reading.parts.map((p: any) => p.title.replace(/^Part \w+ – /, '')).join(', ') + ' · ' : 'Đọc, ngữ pháp & từ vựng · '}${nQ('reading')} câu`, writing: `${wTasks.length > 1 ? wTasks.length + ' task: ' : ''}${wTasks.map(t => `${t.minWords}–${t.maxWords} từ`).join(' + ')}, chấm theo rubric 5 tiêu chí`, speaking: `${f.speaking.tasks.length} task, nói qua micro (hoặc gõ), chấm nội dung` };
    return { title: f.title, timed, limit: S.settings.testWarnLimit || 3, totalMinutes: timed ? Math.round(sum(SECTIONS.map(s => testDurSec(s, this.kind!))) / 60) : null, draftStarted: Object.keys(this.T.sections).length > 0, sections: SECTIONS.map(s => ({ key: s, name: SECTION_NAMES[s], minutes: timed ? testDurSec(s, this.kind!) / 60 : null, max: sectionMax(f, s), desc: desc[s] })), target: this.T.target, canTranscribe: ai.canTranscribe(), hasAi: ai.hasKey() };
  }
  /** Bắt đầu / tiếp tục phần (UI đã confirm quy định không tạm dừng). */
  begin() { if (!this.T) return; this.T.step = Math.max(1, this.T.step); this.saveDraft(); this.enterSection(); }
  /** Gọi mỗi khi UI hiển thị một phần: khởi động đồng hồ của phần đó. */
  enterSection() { const sec = this.curSection(); clearInterval(this.tickTimer); if (!sec || !this.T) return; if (!this.T.sections[sec]) { this.T.sections[sec] = { startedAt: Date.now(), deadline: S.settings.testTimed !== false ? Date.now() + testDurSec(sec, this.kind!) * 1000 : null }; this.saveDraft(); } this.tickTimer = setInterval(() => this.tick(), 1000); this.tick(); }
  timeLeft(sec: Section) { const s = this.T?.sections[sec]; if (!s || !s.deadline) return null; return Math.max(0, Math.round((s.deadline - Date.now()) / 1000)); }
  private tick() {
    const sec = this.curSection(); if (!sec) { clearInterval(this.tickTimer); return; }
    const s = this.T.sections[sec]; const left = this.timeLeft(sec);
    this.emit('tick', { section: sec, left, clock: left == null ? 'Không giới hạn' : fmtClock(left), level: left == null ? 'none' : left <= 60 ? 'danger' : left <= 300 ? 'warn' : 'primary' });
    if (left == null) return;
    if (left <= 300 && !s.warned5) { s.warned5 = true; this.saveDraft(); this.emit('beep', 1); notify(`⏰ Còn 5 phút cho phần ${SECTION_NAMES[sec]}`, ''); }
    if (left <= 60 && !s.warned1) { s.warned1 = true; this.saveDraft(); this.emit('beep', 2); notify('⏰ Còn 1 phút! Hết giờ hệ thống sẽ tự chuyển phần.', 'err'); }
    if (left <= 0 && !this.pendingAuto) this.autoAfterCountdown(`⏰ Hết giờ phần ${SECTION_NAMES[sec]}`, this.T.step < SECTIONS.length ? 'Hệ thống sẽ tự chuyển sang phần tiếp theo.' : 'Hệ thống sẽ tự nộp bài.', () => this.finishSection(true));
  }
  /** Mọi thao tác tự động đếm ngược 5 giây (UI hiện `countdown` {title,msg,n}; n=0 → đã thực hiện). */
  autoAfterCountdown(title: string, msg: string, fn: () => void, secs = 5) {
    if (this.pendingAuto) return; this.emit('flush'); this.emit('beep', 2);
    let n = secs; this.emit('countdown', { title, msg, n });
    this.pendingAuto = setInterval(() => { n--; if (n > 0) { this.emit('countdown', { title, msg, n }); return; } clearInterval(this.pendingAuto); this.pendingAuto = null; this.emit('countdown', null); if (this.T) fn(); }, 1000);
  }
  answer(key: string, value: any) { if (!this.T) return; this.T.answers[key] = value; this.saveDraft(); }
  setText(key: string, text: string) { if (!this.T) return; this.T.answers[key] = text; this.saveDraft(); }
  /** Ghi nhận một lần nghe; trả về {text, left} hoặc null khi hết lượt. */
  play(partKeyId: string) { const p = this.form.listening.parts.find((x: any) => x.key === partKeyId); if (!p || (this.T.plays[partKeyId] || 0) >= 2) return null; this.T.plays[partKeyId] = (this.T.plays[partKeyId] || 0) + 1; this.saveDraft(); return { text: p.audio.map(([who, line]: any) => `${who}: ${line}`).join('. '), left: 2 - this.T.plays[partKeyId] }; }
  playsLeft(partKeyId: string) { return 2 - (this.T?.plays[partKeyId] || 0); }
  /** File ghi âm của task Nói: lưu IndexedDB + chép lời nếu AI hỗ trợ. Trả về {meta, transcript|null, error|null}. */
  async attachAudio(key: string, file: File) { if (!this.T) return null; const r = await takeAudio(file, this.T.userId + ':' + this.T.kind + ':' + key); if (!r || !this.T) return r; this.T.audio = this.T.audio || {}; this.T.audio[key] = r.meta; if (r.transcript != null) this.T.answers[key] = r.transcript; this.saveDraft(); return r; }
  /** Thiếu gì trước khi nộp phần (chuỗi cảnh báo hoặc ''). */
  finishWarning() {
    const sec = this.curSection(); const f = this.form; const a = this.T.answers; let warn = '';
    if (sec === 'listening' || sec === 'reading') { const miss = f[sec].parts.reduce((n: number, p: any) => n + p.questions.filter((q: any, i: number) => a[`${p.key}_${i}`] === undefined).length, 0); if (miss) warn = `Còn ${miss} câu chưa trả lời.`; }
    if (sec === 'writing') { const short = writingTasks(f).filter(t => wordCount(a[t.key]) < t.minWords); if (short.length) warn = short.map(t => `${t.title.split(' – ')[0]}: mới ${wordCount(a[t.key])} từ (yêu cầu ${t.minWords}–${t.maxWords})`).join('; ') + '.'; }
    if (sec === 'speaking') { const empty = f.speaking.tasks.filter((t: any) => !wordCount(a[t.key])).length; if (empty) warn = `Còn ${empty} task chưa có câu trả lời.`; }
    return warn;
  }
  /** Nộp phần hiện tại (UI đã confirm, có đếm ngược). */
  finishSection(auto = false) {
    const sec = this.curSection(); if (!sec) return; const s = this.T.sections[sec]; if (!s || s.finishedAt) return;
    s.finishedAt = Date.now(); s.auto = !!auto; clearInterval(this.tickTimer); this.emit('stop-speech');
    if (this.T.step < SECTIONS.length) { this.T.step++; this.saveDraft(); if (auto) notify(`Hết giờ phần ${SECTION_NAMES[sec]} – chuyển sang phần tiếp theo`, 'err'); this.emit('step'); this.enterSection(); }
    else { this.T.step = SECTIONS.length + 1; this.saveDraft(); if (auto) { notify('Hết giờ – hệ thống tự nộp bài', 'err'); this.submit(true, 'timeout'); } else this.emit('step'); }
  }
  /** Rời màn hình thi (UI gọi từ visibilitychange / blur). */
  integrityWarning(reason: string) {
    if (!this.curSection() || this.T._submitting || this.pendingAuto) return;
    if (Date.now() < this.micGraceUntil || Date.now() - this.lastWarnAt < 2000 || this.pickerGrace) return;
    this.lastWarnAt = Date.now();
    this.T.warnings.push({ at: new Date().toISOString(), section: this.curSection(), reason }); this.saveDraft();
    const limit = S.settings.testWarnLimit || 3, n = this.T.warnings.length; this.emit('alarm');
    if (n > limit) { this.autoAfterCountdown(`⛔ Vi phạm lần thứ ${n}`, `Bạn đã được cảnh báo ${limit} lần mà vẫn rời khỏi màn hình bài thi. Bài sẽ được tự động nộp với phần đã làm.`, () => { this.T.step = SECTIONS.length + 1; this.saveDraft(); this.submit(true, 'warnings'); }); return; }
    this.emit('warning', { n, limit, reason, final: n >= limit, message: n < limit ? `Còn ${limit - n} lần cảnh báo nữa; sau đó vi phạm thêm một lần là bài tự nộp.` : 'Đây là cảnh báo cuối cùng: vi phạm thêm một lần nữa là bài tự nộp.' });
  }
  /** Tóm tắt trước khi nộp. */
  summary() { const f = this.form; const a = this.T.answers; const nQ = (skill: string) => sum(f[skill].parts.map((p: any) => p.questions.length)); const cnt = (skill: string) => f[skill].parts.reduce((n: number, p: any) => n + p.questions.filter((q: any, i: number) => a[`${p.key}_${i}`] !== undefined).length, 0); return { listening: [cnt('listening'), nQ('listening')], reading: [cnt('reading'), nQ('reading')], writingWords: writingTasks(f).map(t => wordCount(a[t.key])), speakingWords: sum(f.speaking.tasks.map((t: any) => wordCount(a[t.key]))), warnings: this.T.warnings.length, limit: S.settings.testWarnLimit || 3, hasAi: ai.hasKey() }; }
  /** Nộp bài: chấm, AI chấm Viết/Nói (nếu có key), lưu, xoá nháp. Trả về {test, next:'/survey'|'/home'}. */
  async submit(auto = false, reason = '') {
    if (!this.T || this.T._submitting) return null; this.T._submitting = true; this.emit('stop-speech'); clearInterval(this.tickTimer);
    const u = userById(this.T.userId) || me()!; const scored = scoreTest(this.T);
    const timing = Object.fromEntries(SECTIONS.map(s => [s, this.T.sections[s] ? { seconds: Math.round(((this.T.sections[s].finishedAt || Date.now()) - this.T.sections[s].startedAt) / 1000), auto: !!this.T.sections[s].auto } : null]));
    const test: TestRecord = { id: uid('t'), userId: u.id, kind: this.T.kind, form: this.T.form, target: this.T.target || null, answers: this.T.answers, audio: this.T.audio || {}, ...scored, warnings: this.T.warnings, timing, autoSubmitted: auto, autoReason: reason, aiSuggestedCefr: null, rationale: '', aiScored: false, submittedAt: new Date().toISOString(), startedAt: this.T.startedAt };
    if (ai.hasKey()) { this.emit('status', 'AI đang chấm phần Viết/Nói theo rubric…'); try { const r = await ai.assessPlacement(test, u); applyAiAssessment(test, r); } catch (e: any) { notify('AI không chấm được: ' + e.message + ' – vận hành sẽ chấm tay.', 'err'); } }
    S.tests.push(test); syncUserFromTest(u, test); if (test.kind === 'levelup') evalLevelupTest(test);
    const mins = clamp(Math.round((Date.now() - new Date(this.T.startedAt).getTime()) / 60000), 5, 90); logActivity(u.id, 'test', mins);
    if (S.testDrafts) delete S.testDrafts[draftKey(this.T.userId, this.T.kind)]; const kind = this.T.kind; this.T = null; save(true);
    notify(auto ? 'Bài đã được tự động nộp' : 'Đã nộp bài', auto ? 'err' : 'ok');
    const out = { test, next: kind === 'final' ? '/survey' : '/home' }; this.emit('submitted', out); return out;
  }
  /** Dọn khi đổi người dùng / rời màn thi (không xoá nháp). */
  reset() { this.T = null; clearInterval(this.tickTimer); if (this.pendingAuto) { clearInterval(this.pendingAuto); this.pendingAuto = null; } }
  leaveScreen() { clearInterval(this.tickTimer); }
}
/** Dữ liệu xem bài làm (màn vận hành "Xem bài làm"). */
export function testReview(testId: string) {
  const test = S.tests.find(x => x.id === testId); if (!test) return null; const f = formOf(test); const x = userById(test.userId); const a = test.answers; const ss = test.sectionScores;
  if (!f || !f.listening) return { test, user: x, legacy: true };
  const partRows = (skill: 'listening' | 'reading') => { let n = 0; return f[skill].parts.map((p: any) => { const start = n; n += p.questions.length; return { key: p.key, title: p.title, transcript: p.audio ? p.audio.map(([w, l]: any) => ({ who: w, line: l })) : null, got: p.questions.filter((q: any, i: number) => a[`${p.key}_${i}`] === q.answer).reduce((s: number, q: any) => s + q.pts, 0), max: sum(p.questions.map((q: any) => q.pts)), questions: p.questions.map((q: any, qi: number) => { const ans = a[`${p.key}_${qi}`]; return { n: start + qi + 1, q: q.q, pts: q.pts, options: q.options, answer: q.answer, picked: ans, ok: ans === q.answer, skipped: ans === undefined }; }) }; }); };
  return { test, user: x, legacy: false, form: f, maxOf: (k: Section) => ss[k].max || 25, listening: partRows('listening'), reading: partRows('reading'), writing: writingTasks(f).map(w => ({ ...w, text: a[w.key] || '', words: wordCount(a[w.key]) })), speaking: f.speaking.tasks.map((t: any) => ({ ...t, text: a[t.key] || '', audio: test.audio?.[t.key] || null })), gradedBy: test.gradedBy === 'ai' ? 'ai' : test.gradedBy ? 'manual' : 'none', timing: test.timing, warnings: test.warnings || [] };
}


// =====================================================================================
// LEARNING – học bài (Học → Bài tập), chấm từng phần, luyện âm, kháng nghị, bản dịch, bài siêu ngắn
// =====================================================================================
export const learnerLessons = (u: User) => approvedLessons(currentWeek(), u.cefr);
export const weekVocab = (u: User) => [...new Set(learnerLessons(u).flatMap(l => (l.vocab || []).map(v => (v.e || v.word || '').trim()).filter(Boolean)))];
export const weekVocabPairs = (u: User) => { const seen = new Set<string>(); return learnerLessons(u).flatMap(l => l.vocab || []).map(v => ({ e: (v.e || v.word || '').trim(), v: (v.v || v.meaning || '').trim() })).filter(p => p.e && !seen.has(p.e.toLowerCase()) && seen.add(p.e.toLowerCase())); };
export const doneCount = (u: User, lessons: Lesson[]) => lessons.filter(l => userProgress(u.id, l.id)?.completedAt).length;
export const studiedOf = (u: User | null, key: string) => !!u && (!!(u.studied && u.studied[key]) || !!userProgress(u.id, key)?.completedAt || Object.keys(S.practiceResults || {}).some(k => k.startsWith(u.id + '_' + key) && resState(S.practiceResults[k]).attempts > 0));
export const lessonBase = (id: string) => S.microLessons.find(x => x.id === id && x.userId === me()?.id) || lessonById(id)?.lesson || null;
export const vocabOf = (id: string, i: number) => { const base = lessonBase(id); return base && (base.vocab || [])[i] ? { base, v: base.vocab[i] as VocabEntry } : null; };

/** Nơi lưu kết quả một phần bài tập. key = lessonId (Viết) hoặc lessonId~L/R/C/U/S. */
export function practiceTarget(key: string) {
  const u = me(); if (!u) return null; const [id, code = 'W'] = key.split('~');
  const mic = S.microLessons.find(x => x.id === id && x.userId === u.id); const base = mic || lessonById(id)?.lesson; if (!base) return null;
  const part = lessonParts(base).find(p => p.code === code); if (!part) return null;
  const m = { ...base, practice: part.practice, theory: part.context || base.theory };
  if (mic && code === 'W') return { m, code: code as PartCode, get: () => ({ answer: mic.answer, localOk: mic.localOk, grade: mic.grade, attempts: mic.attempts, ok: mic.ok, done: mic.done, audio: mic.audio, tried: mic.tried, manual: mic.manual }), set: (r: any) => Object.assign(mic, r) };
  const pk = u.id + '_' + key; S.practiceResults = S.practiceResults || {};
  return { m, code: code as PartCode, get: () => S.practiceResults[pk] || {}, set: (r: any) => { S.practiceResults[pk] = { ...(S.practiceResults[pk] || {}), ...r }; } };
}
export const drilled = (id: string): string[] => ((S.practiceResults || {})[me()!.id + '_' + id + '~P'] || {}).drilled || [];
export const drillDone = (id: string, m: any) => drillWords(m).every(w => drilled(id).includes(w));
/** Bấm một từ luyện âm: ghi nhận; trả về {count,total,done,text} (UI phát `text`). */
export function drill(lessonId: string, w: string) {
  const u = me()!; const found = S.microLessons.find(x => x.id === lessonId && x.userId === u.id) || lessonById(lessonId)?.lesson; if (!found) return null;
  const k = u.id + '_' + lessonId + '~P'; S.practiceResults = S.practiceResults || {}; const got: string[] = S.practiceResults[k]?.drilled || [];
  if (!got.includes(w)) { S.practiceResults[k] = { drilled: [...got, w] }; save(); }
  const count = drilled(lessonId).filter(x => drillWords(found).includes(x)).length, total = drillWords(found).length;
  return { text: w, count, total, done: drillDone(lessonId, found) };
}
/** Dữ liệu ô bài làm của một phần (UI render theo p.type). */
export function practiceView(key: string) {
  const tgt = practiceTarget(key); if (!tgt) return null; const u = me()!; const m = tgt.m; const p = normPractice(m.practice); const res = tgt.get(); const st = resState(res); const code = tgt.code;
  const vi = m.explainLang ? /Việt/.test(m.explainLang) : learnerWantsVi(u); const baseId = key.split('~')[0];
  const needDrill = p.type === 'say' && !st.done && !drillDone(baseId, m);
  return { key, code, practice: p, result: res, state: st, tried: st.attempts > 0, vi, hint: PART_HINTS(vi)[code], ladder: !st.done ? ladderHint(p, st.attempts, vi) : '', feedback: res?.grade?.feedback ? (st.done ? res.grade.feedback : maskAnswer(res.grade.feedback, p)) : '', fix: st.done && res?.grade?.fix && normAns(res.grade.fix) !== normAns(res.answer || '') && normAns(res.grade.fix) !== normAns(p.answer) ? res.grade.fix : '', reveal: st.done && p.answer ? p.answer : '', triedWrong: (res?.tried || []).map(normAns), needDrill, drill: { count: drilled(baseId).filter(x => drillWords(m).includes(x)).length, total: drillWords(m).length, words: drillWords(m) }, audio: res?.audio || null, canTranscribe: ai.canTranscribe(), hasAi: ai.hasKey(), appeal: appealFor(u.id, 'part', key) || null, canAppeal: st.attempts > 0 && !st.ok && !res?.manual, trans: st.ok ? (m.trans || {})[code] || null : null, transPending: st.ok && SKILL_CODES.includes(code) && !(m.trans || {})[code] && ai.hasKey() && !transFailed.has(baseId + '~' + code) };
}
/** Nộp một phần bài tập. Trả về {ok, done, attempts, error?} ; gọi AI khi cần. */
export async function submitPractice(key: string, answer: string) {
  const tgt = practiceTarget(key); if (!tgt) return { error: 'Không tìm thấy bài' }; const u = me()!; const m = tgt.m; const p = normPractice(m.practice);
  const prev = tgt.get(); const st0 = resState(prev); if (st0.done) return { error: 'Phần này đã xong' };
  answer = (answer || '').trim();
  if (p.type === 'say' && !prev.audio) return { error: 'Ghi âm hoặc tải file ghi âm lên trước nhé' };
  if (!answer) return { error: p.type === 'mcq' ? 'Chọn một đáp án' : p.type === 'say' ? 'Chưa có lời chép từ file – gõ lại câu bạn đã nói' : 'Nhập câu trả lời' };
  if (p.type === 'write' && wordCount(answer) < 2) return { error: 'Viết ít nhất một câu nhé' };
  const attempts = st0.attempts + 1; const last = attempts >= MAX_ATTEMPTS;
  const vi = m.explainLang ? /Việt/.test(m.explainLang) : learnerWantsVi(u);
  const finish = (ok: boolean, grade: any) => { tgt.set({ answer, localOk: ok, ok, grade, attempts, done: ok || last, at: new Date().toISOString(), tried: ok ? (prev.tried || []) : [...(prev.tried || []), answer] }); logActivity(u.id, 'practice', 3); save(true); notify(ok ? 'Chính xác!' : last ? 'Hết lượt – xem đáp án' : `Chưa đúng – còn ${MAX_ATTEMPTS - attempts} lượt`, ok ? 'ok' : ''); return { ok, done: ok || last, attempts, grade }; };
  if (p.type === 'say') { const r = sayMatch(answer, p.answer); return finish(r.ok, r.ok ? null : { ok: false, score: 0, feedback: (vi ? 'Chưa khớp câu mẫu. Các từ chưa nghe thấy: ' : 'Not matching the model yet. Words not heard: ') + r.missing.join(', ') + (vi ? '. Nghe lại câu mẫu, ghi âm lại rồi nộp.' : '. Listen to the model and record again.'), fix: '' }); }
  if (p.type !== 'write' && matchesKey(answer, p.answer)) return finish(true, null);
  if (!ai.hasKey()) return finish(p.type === 'write', null);
  try { const grade = await ai.gradeMicro({ cefr: u.cefr!, vi, theory: m.theory, vocab: m.vocab, practice: m.practice, answer, persona: personaOf(u) }); grade.feedback = personaText(grade.feedback, personaOf(u)); if (p.type === 'mcq') grade.ok = false; return finish(grade.ok, grade); }
  catch (e: any) { return { error: e.message + ' (lượt này chưa bị tính)' }; }
}
/** Gắn file ghi âm cho phần Nói của bài học. */
export async function attachPracticeAudio(key: string, file: File) { const tgt = practiceTarget(key); if (!tgt) return null; const r = await takeAudio(file, me()!.id + ':' + key); if (r) { tgt.set({ audio: r.meta }); save(); } return r; }
export function markStudied(lessonId: string) { const u = me()!; u.studied = u.studied || {}; u.studied[lessonId] = new Date().toISOString(); save(true); }

// ---- lesson access rules ----
/** Mở bài: kiểm tra duyệt/mức, học tuần tự, đúng ngày (T2–T6). */
export function lessonAccess(id: string) {
  const u = me()!; const found = lessonById(id); if (!found) return { ok: false, reason: 'Bài không tồn tại' };
  const { lesson: l, set } = found; if (set.status !== 'approved' || set.cefr !== u.cefr) return { ok: false, reason: 'Bài này chưa mở cho bạn' };
  const lessons = approvedLessons(set.week, set.cefr); const idx = lessons.indexOf(l); const prog = userProgress(u.id, id);
  const lbl = (x: Lesson) => DAY_SHORT[(x.day || lessons.indexOf(x) + 1) - 1] || 'Bài ' + (lessons.indexOf(x) + 1);
  const blocker = lessons.slice(0, idx).find(x => !userProgress(u.id, x.id)?.completedAt);
  if (blocker) return { ok: false, blocked: true, blocker, blockerIndex: lessons.indexOf(blocker), label: lbl(l), blockerLabel: lbl(blocker), index: idx, total: lessons.length };
  const opens = addDays(weekStart(set.week), (l.day || idx + 1) - 1);
  if (opens > todayStr() && !prog?.completedAt) return { ok: false, notYet: true, opens, opensLabel: `${DOW_FULL[dowIndex(opens)]} ${fmtDate(opens)}`, index: idx, total: lessons.length };
  const parts = isMicroLesson(l) ? lessonParts(l) : []; const partsDone = parts.filter(p => resState(practiceTarget(partKey(id, p.code))?.get()).done).length;
  return { ok: true, lesson: l, set, lessons, index: idx, total: lessons.length, progress: prog, parts, partsDone, studied: studiedOf(u, id), label: lbl(l), topic: weekInfo(set.week).topic, canComplete: !!prog?.completedAt || partsDone >= parts.length };
}
/** Hoàn thành bài (hoặc lưu lần ôn). `gradedOld` = kết quả bài tập định dạng cũ {key: ok}. */
export function completeLesson(id: string, { startedAt = Date.now(), gradedOld = {} as Dict<boolean>, writeAnswers = {} as Dict<string> } = {}) {
  const u = me()!; const l = lessonById(id)!.lesson;
  const graded = Object.values(gradedOld); let score = graded.length ? pct(graded.filter(Boolean).length, graded.length) : 100;
  const mins = clamp(Math.round((Date.now() - startedAt) / 60000), 3, 30);
  const existing = userProgress(u.id, id);
  if (isMicroLesson(l)) { const sts = lessonParts(l).map(p => resState(practiceTarget(partKey(id, p.code))?.get())); if (!existing && sts.some(s => !s.done)) return { error: `Còn ${sts.filter(s => !s.done).length} phần chưa làm xong` }; if (sts.length) score = pct(sts.filter(s => s.ok).length, sts.length); }
  if (existing) { existing.reviews = (existing.reviews || 0) + 1; existing.lastScore = score; existing.minutes += mins; }
  else S.progress.push({ userId: u.id, lessonId: id, week: l.week, completedAt: new Date().toISOString(), score, minutes: mins, writeAnswers });
  logActivity(u.id, 'lesson', mins); save(true);
  notify(existing ? 'Đã lưu lần ôn' : `Hoàn thành bài! ${score}% đúng`, 'ok'); return { ok: true, score, review: !!existing };
}
/** Dữ liệu trang chủ học viên (state machine: hồ sơ → test → duyệt → học). */
export function learnerHome(u: User) {
  const wk = currentWeek(); const w = weekInfo(wk); const today = todayStr(); const pt = userTest(u.id, 'placement');
  const base = { week: wk, pilotWeeks: S.settings.pilotWeeks, topic: w.topic, courseTheme: courseTheme(), dowName: DOW_FULL[dowIndex(today)], hasAi: ai.hasKey(), missed: missedDays(u.id), minMinutes: S.settings.minMinutesPerDay, placement: pt };
  if (!u.cefrApproved) { const testMin = S.settings.testTimed !== false ? Math.round(sum(SECTIONS.map(s => testDurSec(s))) / 60) : null; return { ...base, phase: 'setup' as const, step: !u.profile ? 1 : !pt ? 2 : 3, hasDraft: draftStarted(u.id, 'placement'), hasProfileDraft: !!u.profileDraft, testMin }; }
  const lessons = learnerLessons(u); const done = doneCount(u, lessons);
  const next = lessons.find(l => !userProgress(u.id, l.id)?.completedAt) || null;
  const openDate = (l: Lesson) => addDays(weekStart(wk), (l.day || lessons.indexOf(l) + 1) - 1); const nextOpen = !!next && openDate(next) <= today;
  const dayLabel = (l: Lesson) => { const d = l.day || lessons.indexOf(l) + 1; return DAY_SHORT[d - 1] || ('Bài ' + d); };
  const sub = weekSubmission(u); const practiceLocked = lessons.length > 0 && done < lessons.length;
  return { ...base, phase: 'learning' as const, lessons, done, next, nextOpen, nextOpenDate: next ? openDate(next) : null, catchUp: !!next && openDate(next) < today,
    path: lessons.map(l => { const p = userProgress(u.id, l.id); const isToday = l === next && nextOpen; return { lesson: l, label: dayLabel(l), done: !!p?.completedAt, today: isToday, locked: !p?.completedAt && !isToday, opens: openDate(l) }; }),
    stats: { sessions: Math.min(sessionsThisWeek(u.id), 5), streak: streakDays(u.id), rewards: rewards(u) }, dots: weekDots(u.id), coachTurns: coachTurnsThisWeek(u), submission: sub, practiceLocked, isFriday: dowIndex(today) >= 4, levelSignal: levelSignal(u), levelUp: levelUpState(u), finalOpen: isLastWeek() && !userTest(u.id, 'final'), monthlyGoal: u.monthlyGoal };
}

// ---- grading appeals ----
export const appeals = () => (S.appeals = S.appeals || []);
export const appealFor = (userId: string, kind: string, ref: string) => appeals().filter(a => a.userId === userId && a.kind === kind && a.ref === ref).sort((a, b) => b.at.localeCompare(a.at))[0];
export function appealPart(key: string, reason: string) {
  const tgt = practiceTarget(key); if (!tgt) return { error: 'Không tìm thấy bài' }; if (reason.trim().length < 5) return { error: 'Cần ghi rõ lý do thì mới gửi báo cáo được' };
  const u = me()!; const r = tgt.get(); const p = normPractice(tgt.m.practice);
  appeals().push({ id: uid('ap'), userId: u.id, userName: u.name, kind: 'part', ref: key, title: tgt.m.title || '', part: PART_NAMES[tgt.code][0], question: p.prompt, options: p.options, key: p.answer, answer: r.answer || '', aiFeedback: r.grade?.feedback || '', attempts: resState(r).attempts, reason: reason.trim(), at: new Date().toISOString(), status: 'pending' });
  save(true); notify('Đã gửi báo cáo cho Người vận hành', 'ok'); return { ok: true };
}
export function appealSubmission(subId: string, reason: string) {
  const s = S.submissions.find(x => x.id === subId); const u = me()!; if (!s) return { error: 'Không còn bài nộp này' }; if (reason.trim().length < 5) return { error: 'Cần ghi rõ lý do thì mới gửi báo cáo được' };
  appeals().push({ id: uid('ap'), userId: u.id, userName: u.name, kind: 'sub', ref: s.id, title: `Bài thực hành tuần ${s.week}`, part: 'Bài tuần', question: s.task, options: [], key: '', answer: s.text, aiFeedback: `${s.total}/100 · ${s.feedback || ''}`, attempts: 1, reason: reason.trim(), at: new Date().toISOString(), status: 'pending' });
  save(true); notify('Đã gửi báo cáo cho Người vận hành', 'ok'); return { ok: true };
}
/** Vận hành quyết định kháng nghị. ok=true: bài tuần → `newTotal` bắt buộc; phần bài → tính đúng. ok=false: `note` bắt buộc. */
export function decideAppeal(id: string, ok: boolean, { newTotal, note = '' }: { newTotal?: number; note?: string } = {}) {
  const a = appeals().find(x => x.id === id); if (!a || a.status !== 'pending') return { error: 'Kháng nghị không còn chờ' }; const actor = me()!; let n = '';
  if (a.kind === 'sub' && ok) { const s = S.submissions.find(x => x.id === a.ref); if (!s) return { error: 'Không còn bài nộp này' }; if (newTotal == null || isNaN(+newTotal)) return { error: 'Nhập điểm 0–100' }; n = `Điểm ${s.total} → ${clamp(Math.round(+newTotal), 0, 100)}`; s.total = clamp(Math.round(+newTotal), 0, 100); s.manualReview = { by: actor.id, at: new Date().toISOString() }; s.aiGraded = false; }
  else if (ok) { const mic = S.microLessons.find(x => x.id === a.ref && x.userId === a.userId); const patch = { ok: true, localOk: true, done: true, manual: { by: actor.id, at: new Date().toISOString() } }; if (mic) Object.assign(mic, patch); else { S.practiceResults = S.practiceResults || {}; const k = a.userId + '_' + a.ref; S.practiceResults[k] = { ...(S.practiceResults[k] || {}), ...patch }; } }
  else { if (!note.trim()) return { error: 'Cần ghi giải thích cho học viên' }; n = note.trim(); }
  Object.assign(a, { status: ok ? 'upheld' : 'rejected', note: n, decidedBy: actor.id, decidedByName: actor.name, decidedAt: new Date().toISOString() }); save(true); notify(ok ? 'Đã chấp nhận kháng nghị' : 'Đã giữ nguyên kết quả', 'ok'); return { ok: true };
}

// ---- translations on demand ----
const transBusy = new Set<string>(), transFailed = new Set<string>();
/** Lấy bản dịch (q, a) cho phần `code` của bài `id` nếu chưa có; lưu vào bài. Phát `change` khi xong. */
export async function ensureTrans(k: string) {
  if (transBusy.has(k) || transFailed.has(k)) return; const [id, code] = k.split('~'); const base = lessonBase(id); if (!base || (base.trans || {})[code]) return;
  const part = lessonParts(base).find(p => p.code === code); if (!part) return; transBusy.add(k);
  try {
    const r = await ai.call({ system: 'Chỉ trả về JSON {"q":"...","a":"..."}, không giải thích. Dịch sang tiếng Việt tự nhiên, ngắn gọn. "q" = bản dịch của đề bài/câu hỏi (đề đã là tiếng Việt thì giữ nguyên; đề là câu điền từ thì dịch cả câu đã điền đúng). "a" = bản dịch của đáp án đúng.', user: `${part.context ? part.context + '\n' : ''}Đề: ${part.practice.prompt}${part.practice.options.length ? '\nLựa chọn: ' + part.practice.options.join(' / ') : ''}\nĐáp án đúng: ${part.practice.answer}`, schema: { type: 'object', additionalProperties: false, required: ['q', 'a'], properties: { q: { type: 'string' }, a: { type: 'string' } } }, effort: 'low', maxTokens: 400, noBase: true, lean: true });
    const q = String(r.json?.q || '').trim(), a = String(r.json?.a || '').trim(); if (!q && !a) throw new Error('empty');
    base.trans = { ...(base.trans || {}), [code]: { q, a } }; save(true); transBusy.delete(k);
  } catch (e: any) { transBusy.delete(k); transFailed.add(k); bus.emit('trans-failed', { key: k, message: String(e.message || '').slice(0, 80) }); }
}

// ---- micro lessons (learner's own extra practice) ----
export const microVars = (u: User, week: number) => { const p = u.profile || ({} as Profile); return { cefr: u.cefr!, topic: weekInfo(week).topic, job: [p.position, p.department].filter(Boolean).join(' – ') || 'nhân viên văn phòng', style: (p.styles || []).length ? optLabels('styles', p.styles) : 'ví dụ thực tế ngắn gọn', vi: learnerWantsVi(u), persona: personaOf(u) }; };
export const todayMicro = (u: User) => S.microLessons.filter(m => m.userId === u.id && m.date === todayStr()).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
export async function generateMyMicro(u: User) {
  const wk = currentWeek(); const vars = microVars(u, wk); const m = await ai.generateMicroLesson(vars);
  const rec = { id: uid('ml'), userId: u.id, week: wk, date: todayStr(), cefr: u.cefr, topic: vars.topic, job: vars.job, style: vars.style, ...(m as Omit<Lesson, 'id'>), generatedAt: new Date().toISOString(), completedAt: null };
  S.microLessons.push(rec); save(true); return rec;
}
export function completeMicro(id: string) { const m = S.microLessons.find(x => x.id === id); if (!m) return false; m.completedAt = new Date().toISOString(); logActivity(m.userId, 'lesson', 5); save(true); notify('Hoàn thành bài siêu ngắn!', 'ok'); return true; }
export function deleteMicro(id: string) { S.microLessons = S.microLessons.filter(m => m.id !== id); save(true); }
/** Chi tiết từ vựng (chips) để UI render; pop-up umbrella/family/synAll/slang/poetic lấy từ vocabOf(). */
export function vocabDetailsOf(v: VocabEntry, cefr?: Cefr | null) { const hi = !isLow(cefr); const umb = umbrellaOf(v.umbrella); return { syn: lexList(v.syn), ant: lexList(v.ant), umbrella: umb, family: v.family || [], synAll: hi ? (v.synAll || []) : [], slang: hi ? slangOf(v.slang) : null, poetic: hi ? poeticOf(v.poetic) : null }; }
/** Dữ liệu hiển thị bài học: cấu trúc, phần Học, phần Bài tập. */
export function lessonView(m: any, practiceKey?: string) {
  const isVi = m.explainLang ? /Việt/.test(m.explainLang) : isLow(m.cefr); const parts = lessonParts(m); const has = (c: PartCode) => parts.some(p => p.code === c);
  const order = parts.map(p => PART_NAMES[p.code][isVi ? 0 : 1]).join(' → ');
  const guide = isVi ? ['Bước Học: 3 từ vựng (nghe từ, cụm từ, xem từ loại / đồng nghĩa) → Ngữ pháp (nghe câu ví dụ) → Phát âm (luyện 3 từ).', 'Bấm "Đã học xong" để mở bước Bài tập.', `Làm lần lượt các phần: ${order}.`, `Mỗi câu được làm tối đa ${MAX_ATTEMPTS} lần: làm sai thì đọc giải thích rồi làm lại; đúng hoặc hết lượt mới hiện đáp án.`, 'Xong hết các phần thì bấm Hoàn thành bài. Phải xong bài này mới mở được bài sau.']
    : ['Study step: 3 words (listen, phrases, word class / synonyms) → Grammar (listen to the examples) → Pronunciation (drill 3 words).', 'Press "Done studying" to open the Exercises step.', `Do the parts in order: ${order}.`, `Each question allows up to ${MAX_ATTEMPTS} attempts: if wrong, read the explanation and try again; the answer appears when you are right or out of attempts.`, 'When every part is done, press Complete. The next lesson unlocks after this one.'];
  const u = me(); const studied = practiceKey ? studiedOf(u, practiceKey) : false;
  return { isVi, parts, has, order, guide, studied, objective: m.objective || (m.title ? (isVi ? `Dùng được mẫu câu "${m.title}" khi nói và viết về chủ đề tuần.` : `Use the pattern "${m.title}" when speaking and writing about this week's topic.`) : ''), examples: exampleLines(m), vocab: (m.vocab || []).map((v: VocabEntry, i: number) => ({ ...v, index: i, details: vocabDetailsOf(v, m.cefr), posLabel: posLabel(v.pos, isVi) })), pron: m.pron ? { ...m.pron, drill: drillWords(m), source: m.pron.sound ? soundSource(m.pron.sound) : null } : null,
    partsDone: practiceKey ? parts.filter(p => resState(practiceTarget(partKey(practiceKey, p.code))?.get()).done).length : 0, boxes: practiceKey ? parts.map(p => practiceView(partKey(practiceKey, p.code))) : [], levelWarn: m.levelWarn || '' };
}


// =====================================================================================
// AI COACH ("Season"), bài thực hành cuối tuần, khảo sát, phần thưởng, lên / hạ mức
// =====================================================================================
export const relevantUserTexts = (c: CoachSession) => c.messages.filter(m => m.role === 'user').filter((m, i) => !(c.turns[i] && c.turns[i].offTopic)).map(m => m.content);
export const goodTurns = (c: CoachSession) => c.turns.filter(t => !t.offTopic);
export const practiceSessions = (u: User) => S.coachSessions.filter(c => c.userId === u.id && !c.challenge);
export const coachTurnsThisWeek = (u: User) => practiceSessions(u).filter(c => Math.abs(c.week) === currentWeek()).reduce((n, c) => n + goodTurns(c).length, 0);
export const weekSubmission = (u: User, week = currentWeek()) => S.submissions.find(s => s.userId === u.id && s.week === week);
export const coachDailyLimit = () => clamp(+S.settings.coachDailyLimit! || 20, 1, 200);
export const coachTurnsToday = (u: User) => { const t = todayStr(); return S.coachSessions.filter(c => c.userId === u.id).reduce((n, c) => n + c.turns.filter(x => localDay(x.at) === t).length, 0); };
export const levelPersona = (cefr: Cefr): Persona => { const L = activeLearners().filter(x => x.cefr === cefr); return L.filter(x => personaOf(x) === 'formal').length > L.length / 2 ? 'formal' : 'informal'; };
export const tone = (u: User | null, informal: string, formal: string) => personaOf(u) === 'formal' ? formal : informal;
export function setPersona(p: Persona) { const u = me()!; if (personaOf(u) === p) return false; u.persona = p; save(true); notify(`Season chuyển sang phong cách ${PERSONAS[p][1]} (${PERSONAS[p][0]})`, 'ok'); return true; }
/** Phiên chat tuần hiện tại (tạo mới với câu mở đầu theo bài đang học + persona). */
export function coachSession(u: User): CoachSession {
  const wk = currentWeek();
  let s = S.coachSessions.filter(c => c.userId === u.id && c.week === wk && !c.challenge).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!s) {
    const w = weekInfo(wk); const name = u.name.split(' ').pop();
    const ls = learnerLessons(u); const cur = ls.find(l => !userProgress(u.id, l.id)?.completedAt) || ls[ls.length - 1]; const pattern = cur ? `"${cur.title}"` : (w.topic ? `"${w.topic}"` : 'this week\'s pattern');
    const ask = isLow(u.cefr) ? `tell me about yourself and your job in two sentences` : `tell me about your current work and one thing you are working on this week`;
    const opener = personaOf(u) === 'formal' ? `Hello ${name}. ${w.topic ? `This week's topic is "${w.topic}". ` : ''}Let us begin with ${pattern}: could you ${ask}?` : `Hi there, ${name}! ${w.topic ? `This week: "${w.topic}". ` : ''}Let's start with ${pattern}: ${ask} 😊`;
    s = { id: uid('cs'), userId: u.id, week: wk, startedAt: new Date().toISOString(), messages: [{ role: 'assistant', content: opener }], turns: [] };
    S.coachSessions.push(s); save();
  }
  return s;
}
export const rubricCls = (v: number) => v >= 4 ? 'good' : v >= 3 ? 'mid' : 'low';
/** Tin nhắn + nhận xét từng lượt để UI render chat. */
export function chatView(s: CoachSession) { let ti = 0; return s.messages.map(m => { if (m.role === 'user') { const t = s.turns[ti++]; return { role: 'user' as const, content: m.content, turn: t || null }; } return { role: 'assistant' as const, content: m.content, turn: null }; }); }
export const foundWords = (s: CoachSession, u: User) => { const pairs = weekVocabPairs(u); const found = new Set<string>(); s.turns.forEach(t => { if (t.offTopic) return; if (Array.isArray(t.usedWords)) t.usedWords.forEach(w => { const p = pairs.find(p => p.e.toLowerCase() === String(w).toLowerCase()); if (p) found.add(p.e); }); else pairs.forEach(p => { if (usesWord(t.userText, p.e)) found.add(p.e); }); }); return pairs.filter(p => found.has(p.e)).map(p => p.e); };
export const isCurt = (text: string) => { const words = String(text || '').trim().split(/\s+/).filter(Boolean); return words.length < 3 || !/[a-zA-Z]{2,}.*\s.*[a-zA-Z]{2,}/.test(text); };
export const curtReply = (p: Persona, vi: boolean, pairs: { e: string; v: string }[]) => { const ex = pairs[0] ? (vi ? `I work in a small ${pairs[0].e === 'team' ? 'team' : 'office'}.` : `This week I am working on a new ${pairs[0].e === 'release' ? 'release' : 'report'}.`) : 'I work as a tester at GFT.';
  return { reply: p === 'formal' ? `That is rather brief. In a work conversation, please answer in a full sentence, for example: "${ex}" Could you try again?` : `Hmm, that's a bit short 😊 Give me a full sentence, not just a word – for example: "${ex}" Try again?`, note: vi ? 'Trả lời cộc lốc (một từ, không thành câu) là thiếu lịch sự trong giao tiếp công việc – không phải "thân mật". Hãy viết ít nhất một câu đầy đủ.' : 'A one-word or bare-keyword answer is impolite in a work conversation, not "informal". Write at least one full sentence.' }; };
/** Ô từ bí mật của tuần: đã mở / chưa mở. */
export function vocabSlots(s: CoachSession, u: User) { const pairs = weekVocabPairs(u); const found = foundWords(s, u); return { pairs: pairs.map(p => ({ ...p, found: found.includes(p.e), mask: p.v || p.e[0].toUpperCase() + ' ' + '_ '.repeat(Math.max(1, p.e.length - 1)).trim() })), found: found.length, total: pairs.length }; }
export function coachView(u: User) { const s = coachSession(u); const used = coachTurnsToday(u), cap = coachDailyLimit(); return { session: s, topic: weekInfo(s.week).topic, vi: isLow(u.cefr), used, cap, capped: used >= cap, weekTurns: coachTurnsThisWeek(u), hasAi: ai.hasKey(), persona: personaOf(u), chat: chatView(s), slots: vocabSlots(s, u) }; }
let coachBusy = false;
/** Gửi một lượt chat (coach thường hoặc thử thách lên mức). Trả về kết quả lượt + từ mới mở + kết quả thử thách nếu kết thúc. */
export async function coachSend(text: string, { challenge = false } = {}) {
  if (coachBusy) return { error: 'Đang xử lý lượt trước' }; const u = me()!; text = (text || '').trim(); if (!text) return { error: 'Chưa có nội dung' };
  if (coachTurnsToday(u) >= coachDailyLimit()) return { error: `Đã hết ${coachDailyLimit()} lượt chat hôm nay – mai quay lại nhé`, capped: true };
  const chal = challenge ? levelUpState(u) : null; if (chal && chal.phase !== 'challenge') return { error: 'Không có thử thách nào đang mở', redirect: '/home' };
  const s = chal ? challengeSession(u, chal.test!) : coachSession(u); coachBusy = true;
  const before = s.challenge ? [] : foundWords(s, u);
  s.messages.push({ role: 'user', content: text }); save();
  try {
    const pz = personaOf(u); let r: any, off: boolean;
    if (isCurt(text)) { const c = curtReply(pz, learnerWantsVi(u), weekVocabPairs(u)); r = { reply: c.reply, relevant: false, relevanceNote: c.note, rubric: { meaning: 0, vocab: 0, grammar: 0 }, suggestions: [], correctedText: '', usedWords: [] }; off = true; }
    else { r = await ai.coachTurn(s, u, weekVocab(u)); r.reply = personaText(r.reply, pz); (r.suggestions || []).forEach((g: any) => { g.explanation = personaText(g.explanation, pz); }); off = r.relevant === false; }
    const usedWords = off ? [] : (Array.isArray(r.usedWords) ? r.usedWords : []).map((w: any) => String(w).trim()).filter((w: string) => w && usesWord(text, w));
    const turn: CoachTurn = { at: new Date().toISOString(), userText: text, reply: r.reply, rubric: { meaning: clamp(off ? Math.min(r.rubric.meaning, 1) : r.rubric.meaning, 0, 5), vocab: clamp(r.rubric.vocab, 0, 5), grammar: clamp(r.rubric.grammar, 0, 5) }, suggestions: (r.suggestions || []).slice(0, 3), correctedText: r.correctedText || '', offTopic: off, relevanceNote: off ? personaText(r.relevanceNote || '', pz) : '', persona: pz, usedWords };
    s.turns.push(turn); s.messages.push({ role: 'assistant', content: r.reply });
    logActivity(u.id, 'coach', 4); save(true);
    const fresh = s.challenge ? [] : foundWords(s, u).filter(w => !before.includes(w));
    if (fresh.length) { bus.emit('reward', 'words'); notify(`Mở ô từ: ${fresh.join(', ')}`, 'ok'); }
    let challengeResult: any = null;
    if (s.challenge && s.turns.length >= CHALLENGE_TURNS) { challengeResult = finishChallenge(u, s); notify(challengeResult.pass ? 'Thử thách đạt! Yêu cầu lên mức đã gửi cho vận hành.' : `Thử thách chưa đạt (TB ${challengeResult.mean}/5, ${challengeResult.off} lượt lạc đề) – xem chi tiết ở Trang chủ`, challengeResult.pass ? 'ok' : 'err'); }
    if (off) notify(isCurt(text) ? 'Trả lời cộc lốc là thiếu lịch sự – viết ít nhất một câu đầy đủ nhé (lượt này không tính luyện)' : s.challenge ? 'Câu vừa rồi chưa trả lời đúng câu hỏi – tính là lạc đề' : 'Câu vừa rồi chưa trả lời đúng câu hỏi nên không tính lượt luyện và không mở ô từ', 'err');
    return { ok: true, turn, reply: r.reply, fresh, offTopic: off, speak: S.settings.coachVoice !== false ? r.reply : null, used: coachTurnsToday(u), cap: coachDailyLimit(), challengeResult, redirect: challengeResult ? '/home' : null };
  } catch (e: any) { s.messages.pop(); save(); return { error: e.message, restoreText: text }; }
  finally { coachBusy = false; }
}
/** Xoá chat (lưu trữ bằng cách âm hoá tuần: các lượt vẫn tính). */
export function coachClear() { const u = me()!; const s = coachSession(u); s.week = -s.week; save(true); }

// ---- Friday practice ----
export function practiceTask(u: User, week: number) {
  const w = weekInfo(week); const t = w.topic || 'your work';
  return isLow(u.cefr) ? { type: 'writing' as const, task: `Write 3–5 sentences about "${t}". Use at least 3 words from this week's lessons.`, vi: `Viết 3–5 câu tiếng Anh về chủ đề "${t}". Dùng ít nhất 3 từ trong bài học tuần này.` }
    : u.cefr === 'B1' ? { type: 'writing' as const, task: `Write a short paragraph or email (80–120 words) about "${t}", including one problem and one suggestion.`, vi: '' }
      : { type: 'dialogue' as const, task: `Write a short dialogue (8–12 lines) or a 120–180-word reflection on "${t}". Show a disagreement or a negotiation and how it is resolved.`, vi: '' };
}
export function weeklyPracticeView(u: User) { const wk = currentWeek(); const wl = u.cefrApproved ? approvedLessons(wk, u.cefr) : []; const wdone = doneCount(u, wl); const sub = weekSubmission(u, wk); return { week: wk, topic: weekInfo(wk).topic, task: practiceTask(u, wk), submission: sub, past: S.submissions.filter(s => s.userId === u.id && s.week !== wk).sort((a, b) => b.week - a.week), locked: wl.length > 0 && wdone < wl.length, done: wdone, total: wl.length, vi: isLow(u.cefr), hasAi: ai.hasKey(), appeal: sub ? appealFor(u.id, 'sub', sub.id) || null : null, canAppeal: !!sub && sub.total != null && !sub.manualReview }; }
export async function gradeSubmissionAI(s: Submission) { const x = userById(s.userId)!; const r = await ai.gradeSubmission(s, x); s.rubric = r.rubric; s.total = clamp(r.total, 0, 100); s.feedback = r.feedback; s.suggestions = (r.suggestions || []).slice(0, 3); s.correctedText = r.correctedText; s.aiGraded = true; s.gradedAt = new Date().toISOString(); save(true); }
export async function submitPracticeWeek(text: string) {
  const u = me()!; text = (text || '').trim(); if (wordCount(text) < 8) return { error: 'Bài quá ngắn (tối thiểu 8 từ)' };
  const wk = currentWeek(); const task = practiceTask(u, wk);
  const sub: Submission = { id: uid('sub'), userId: u.id, week: wk, type: task.type, task: task.task, text, rubric: null, total: null, feedback: '', suggestions: [], correctedText: '', aiGraded: false, operatorChecked: false, submittedAt: new Date().toISOString() };
  let aiError: string | null = null;
  if (ai.hasKey()) { try { const r = await ai.gradeSubmission(sub, u); sub.rubric = r.rubric; sub.total = clamp(r.total, 0, 100); sub.feedback = r.feedback; sub.suggestions = (r.suggestions || []).slice(0, 3); sub.correctedText = r.correctedText; sub.aiGraded = true; sub.gradedAt = new Date().toISOString(); } catch (e: any) { aiError = e.message; notify('AI chưa chấm được: ' + e.message + '. Bài đã lưu, vận hành sẽ chấm.', 'err'); } }
  S.submissions.push(sub); logActivity(u.id, 'practice', 10); save(true); notify('Đã nộp bài', 'ok'); return { ok: true, submission: sub, aiError };
}
// ---- survey ----
export function submitSurvey(rating: number, comment: string, when: string) { S.surveys.push({ userId: me()!.id, rating, comment: (comment || '').trim(), when, at: new Date().toISOString() }); save(true); notify('Cảm ơn bạn!', 'ok'); }
export const mySurvey = (u: User) => S.surveys.find(s => s.userId === u.id);

// ---- rewards ----
export function gooseLevel(points: number, earnedIds: string[]) {
  const has = new Set(earnedIds); let i = 0;
  while (i + 1 < GOOSE_LEVELS.length && points >= GOOSE_LEVELS[i + 1].min && GOOSE_LEVELS[i + 1].badges.every(b => has.has(b))) i++;
  const nx = GOOSE_LEVELS[i + 1];
  return { index: i, ...GOOSE_LEVELS[i], next: nx ? { index: i + 1, name: nx.name, icon: nx.icon, min: nx.min, badges: nx.badges, needPoints: Math.max(0, nx.min - points), missing: nx.badges.filter(b => !has.has(b)) } : null };
}
export function rewardState(points: number, earnedIds: string[], stats: Dict = {}) {
  const lv = gooseLevel(points, earnedIds);
  return { points, stats, lv, level: lv.name, badges: BADGES.map(([id, icon, name, desc]) => ({ id, icon, name, desc, earned: earnedIds.includes(id), tier: GOOSE_LEVELS.findIndex(l => l.badges.includes(id)) })) };
}
export function rewards(u: User) {
  const lessons = S.progress.filter(p => p.userId === u.id && p.completedAt).length;
  let partPts = 0, firstTry = 0;
  Object.entries(S.practiceResults || {}).forEach(([k, r]) => { if (!k.startsWith(u.id + '_')) return; const st = resState(r); if (st.ok) { partPts += Math.max(1, 6 - st.attempts); if (st.attempts === 1) firstTry++; } });
  const sessions = practiceSessions(u); const turns = sessions.reduce((n, c) => n + goodTurns(c).length, 0);
  const words = sessions.reduce((n, c) => { const seen = new Set<string>(); approvedLessons(Math.abs(c.week), cefrAt(u, Math.abs(c.week))).flatMap(l => l.vocab || []).forEach(v => { const e = (v.e || v.word || '').trim(); if (e && relevantUserTexts(c).some(txt => usesWord(txt, e))) seen.add(e.toLowerCase()); }); return n + seen.size; }, 0);
  const subs = S.submissions.filter(s => s.userId === u.id).length;
  const fullWeeks = Array.from({ length: S.settings.pilotWeeks }, (_, i) => i + 1).filter(w => { const ls = approvedLessons(w, cefrAt(u, w)); return ls.length >= LESSONS_PER_WEEK && ls.every(l => userProgress(u.id, l.id)?.completedAt); }).length;
  const days = [...new Set(S.activity.filter(a => a.userId === u.id).map(a => a.date))].filter(isStudyDay).sort(); let bestStreak = 0, run = 0;
  days.forEach((d, i) => { run = i && prevStudyDay(d) === days[i - 1] ? run + 1 : 1; bestStreak = Math.max(bestStreak, run); });
  const pr = S.practiceResults || {}; const firstGo = (key: string) => { const r = pr[u.id + '_' + key]; const st = resState(r); return st.ok === true && st.attempts === 1 && !(r && r.manual); };
  const perfectLessons = S.lessonSets.flatMap(ls => ls.lessons).filter(l => isMicroLesson(l) && SKILL_CODES.every(c => lessonParts(l).some(p => p.code === c) && firstGo(partKey(l.id, c)))).length;
  const stats = { lessons, firstTry, perfectLessons, turns, words, subs, fullWeeks, bestStreak };
  const points = lessons * 10 + partPts + turns * 2 + words * 2 + subs * 15 + fullWeeks * 20;
  return rewardState(points, BADGES.filter(b => b[4](stats)).map(b => b[0]), stats);
}
/** Huy hiệu / cấp mới kể từ lần xem trước (gọi ở trang chủ học viên). Trả về {fresh, levelUp, topReached}. */
export function announceBadges(u: User) {
  const r = rewards(u); const seen = (u.badgesSeen || []).filter(id => r.badges.some(b => b.id === id && b.earned));
  if (seen.length !== (u.badgesSeen || []).length) { u.badgesSeen = seen; save(); }
  const fresh = r.badges.filter(b => b.earned && !seen.includes(b.id));
  if (fresh.length) { u.badgesSeen = [...seen, ...fresh.map(b => b.id)]; save(); fresh.forEach(b => notify(`${b.icon} Huy hiệu mới: ${b.name}`, 'ok')); bus.emit('reward', 'badge'); }
  let levelUp: number | null = null, topReached = false;
  if (r.lv.index > (u.levelSeen || 0)) { u.levelSeen = r.lv.index; save(true); if (r.lv.index < GOOSE_LEVELS.length - 1) { levelUp = r.lv.index; bus.emit('reward', 'level'); } }
  else if (r.lv.index < (u.levelSeen || 0)) { u.levelSeen = r.lv.index; save(); }
  if (r.lv.index === GOOSE_LEVELS.length - 1 && !u.allBadgesAt) { u.allBadgesAt = new Date().toISOString(); save(true); topReached = true; }
  return { fresh, levelUp, topReached, rewards: r };
}
/** Dữ liệu chứng nhận (màn #/reward/:mode). */
export function certificate(u: User, preview: boolean) {
  const r = u.role === 'learner' ? rewards(u) : null; if (!preview && !(r && r.lv.index === GOOSE_LEVELS.length - 1)) return null;
  const name = u.role === 'learner' ? u.name : 'Nguyễn Văn A'; const points = preview ? Math.max(r?.points || 0, REWARD_LEVELS[REWARD_LEVELS.length - 1][0] + 60) : r!.points;
  const dateStr0 = preview ? todayStr() : (u.allBadgesAt || todayStr()).slice(0, 10); const d = new Date(dateStr0 + 'T00:00:00');
  return { preview, name, points, date: dateStr0, longDate: `ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`, certNo: `SE-${d.getFullYear()}-${String((u.id || 'x').replace(/\W/g, '')).slice(-6).toUpperCase()}`, level: GOOSE_LEVELS[GOOSE_LEVELS.length - 1], cefr: u.cefr ? LEVEL_NAMES[u.cefr] : '—', badges: BADGES.map(([id, icon, bname, desc]) => ({ id, icon, name: bname, desc })), earned: r ? r.badges.filter(b => b.earned).length : 0, operator: S.users.find(x => x.role === 'operator')?.name || '', manager: S.users.find(x => x.role === 'manager')?.name || '', orgName: S.settings.orgName, canPrint: !(u.role === 'learner' && !u.allBadgesAt), logo: 'design/gft-logo.png' };
}

// ---- level signals / level-up flow ----
export const levelUpCfg = () => ({ ...LEVELUP_DEFAULTS, ...(S.settings.levelUp || {}) });
export function resDate(key: string, r: any) { if (r && r.at) return dateStr(r.at); const f = lessonById(key.split('~')[0]); if (!f) return null; const i = f.set.lessons.indexOf(f.lesson); return addDays(weekStart(f.set.week), (f.lesson.day || i + 1) - 1); }
export function levelSignal(u: User, days?: number) {
  const cfg = levelUpCfg(); days = days || cfg.days; const today = todayStr(); const from = addDays(today, -(days - 1)); const wk = currentWeek();
  let due = 0, done = 0;
  for (let w = 1; w <= wk; w++) approvedLessons(w, cefrAt(u, w)).forEach((l, i) => { const d = addDays(weekStart(w), (l.day || i + 1) - 1); if (d >= from && d <= today) { due++; if (userProgress(u.id, l.id)?.completedAt) done++; } });
  let parts = 0, first = 0; const byWeek: Dict<{ n: number; wrong: number }> = {};
  Object.entries(S.practiceResults || {}).forEach(([k, r]) => {
    if (!k.startsWith(u.id + '_')) return; const key = k.slice(u.id.length + 1); if (key.endsWith('~P')) return; const st = resState(r); if (!st.done) return; const d = resDate(key, r); if (!d) return;
    if (d >= from && d <= today) { parts++; if (st.ok && st.attempts === 1) first++; }
    const w = weekOfDate(d); byWeek[w] = byWeek[w] || { n: 0, wrong: 0 }; byWeek[w].n++; if (!st.ok) byWeek[w].wrong++;
  });
  const sub = S.submissions.filter(s => s.userId === u.id && s.total != null && dateStr(s.submittedAt) >= from).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
  const turns = practiceSessions(u).flatMap(goodTurns).filter(t => t.rubric && t.at && dateStr(t.at) >= from);
  const coach = turns.length ? Math.round(10 * turns.reduce((s, t) => s + (t.rubric.meaning + t.rubric.vocab + t.rubric.grammar) / 3, 0) / turns.length) / 10 : 0;
  const m = (key: string, label: string, value: number, target: string, ok: boolean, text: string) => ({ key, label, value, target, ok, text });
  const metrics = [
    m('lessons', 'Bài học hoàn thành', pct(done, due), cfg.lessons + '%', due > 0 && pct(done, due) >= cfg.lessons, `${done}/${due} bài đến hạn trong ${days} ngày`),
    m('firstTry', 'Phần bài đúng ngay lần đầu', pct(first, parts), cfg.firstTry + '%', parts > 0 && pct(first, parts) >= cfg.firstTry, `${first}/${parts} phần`),
    m('submission', 'Bài thực hành tuần gần nhất', sub ? sub.total! : 0, cfg.submission + '/100', !!sub && sub.total! >= cfg.submission, sub ? `${sub.total}/100 (tuần ${sub.week})` : 'chưa có bài được chấm'),
    m('coach', 'Rubric khi luyện với Season', coach, cfg.coach + '/5', turns.length >= cfg.coachTurns && coach >= cfg.coach, `trung bình ${coach}/5 qua ${turns.length} lượt (cần ≥${cfg.coachTurns} lượt)`)
  ];
  const wrongWeeks = [wk - 1, wk].filter(w => w >= 1).map(w => { const b = byWeek[w] || { n: 0, wrong: 0 }; return { w, n: b.n, rate: pct(b.wrong, b.n) }; });
  const demote = u.cefr !== 'A1' && wrongWeeks.length === 2 && wrongWeeks.every(x => x.n >= cfg.minParts && x.rate > cfg.wrong);
  const ready = u.cefr !== 'C1' && metrics.every(x => x.ok);
  return { ready, demote, metrics, wrongWeeks, days, cfg, next: nextLevelOf(u.cefr) };
}
export const openLevelRequest = (u: User) => levelRequests().find(r => r.userId === u.id && r.status === 'pending');
export const levelupTests = (u: User) => S.tests.filter(t => t.userId === u.id && t.kind === 'levelup').sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
export const lastLevelupFail = (u: User) => levelupTests(u).filter(t => t.outcome === 'fail').sort((a, b) => (b.failedAt || b.submittedAt).localeCompare(a.failedAt || a.submittedAt))[0];
export const challengeOf = (test: TestRecord) => S.coachSessions.find(c => c.challenge && c.challenge.testId === test.id);
export function retakePlan(u: User, fail: TestRecord) {
  const since = fail.failedAt || fail.submittedAt; const from = dateStr(since); const retry = addDays(from, LEVELUP_RETRY_DAYS);
  const chal = challengeOf(fail); const byChallenge = !!(chal && chal.challenge!.result === 'fail'); const weak: string = byChallenge ? 'coach' : (fail.weakest || 'writing');
  const items: { label: string; ok: boolean; text: string }[] = [{ label: `Đợi đủ ${LEVELUP_RETRY_DAYS} ngày`, ok: retry <= todayStr(), text: `thi lại từ ${fmtDate(retry)}` }];
  const sig = levelSignal(u); items.push({ label: 'Giữ đủ 4 tín hiệu sẵn sàng', ok: sig.ready, text: `${sig.metrics.filter(m => m.ok).length}/4 chỉ số đạt (xem thẻ bên trên)` });
  if (weak === 'coach') { const turns = practiceSessions(u).flatMap(goodTurns).filter(t => t.at > since); const mean = turns.length ? Math.round(10 * turns.reduce((a, t) => a + (t.rubric.meaning + t.rubric.vocab + t.rubric.grammar) / 3, 0) / turns.length) / 10 : 0; items.push({ label: 'Luyện lại với Season', ok: turns.length >= 10 && mean >= 4, text: `cần ≥10 lượt mới có trung bình ≥4/5 – hiện ${turns.length} lượt, TB ${mean}/5` }); }
  else if (weak === 'writing') { const subs = S.submissions.filter(s => s.userId === u.id && s.total != null && s.submittedAt > since); const good = subs.filter(s => s.total! >= 80).length; items.push({ label: 'Luyện Viết: bài thực hành tuần', ok: good >= 2, text: `cần 2 bài thực hành tuần được chấm ≥80 – hiện ${good}/2 (${subs.length} bài đã chấm)` }); }
  else { const code = ({ listening: 'L', reading: 'R', speaking: 'S' } as Dict<string>)[weak]; let n = 0, first = 0;
    Object.entries(S.practiceResults || {}).forEach(([k, r]) => { if (!k.startsWith(u.id + '_')) return; const key = k.slice(u.id.length + 1); const c = key.includes('~') ? key.split('~')[1] : 'W'; if (c !== code) return; const st = resState(r); if (!st.done) return; const d = resDate(key, r); if (!d || d < from) return; n++; if (st.ok && st.attempts === 1) first++; });
    items.push({ label: `Luyện ${SECTION_NAMES[weak as Section]}: phần ${SECTION_NAMES[weak as Section]} trong bài học`, ok: n >= 4 && pct(first, n) >= 80, text: `cần ≥4 phần ${SECTION_NAMES[weak as Section]} mới với ≥80% đúng ngay lần đầu – hiện ${first}/${n}${n ? ` (${pct(first, n)}%)` : ''}` }); }
  return { items, ok: items.every(i => i.ok), retry, weak, byChallenge };
}
export function levelUpEligibility(u: User): any {
  const target = nextLevelOf(u.cefr); const no = (reason: string) => ({ ok: false, reason, target });
  if (!target) return no('Bạn đang ở mức cao nhất');
  if (u.pendingCefr) return no(`Đang chờ đổi mức sang ${u.pendingCefr.to} từ ${fmtDate(u.pendingCefr.effective)}`);
  if (openLevelRequest(u)) return no('Yêu cầu lên mức của bạn đang chờ vận hành duyệt');
  if (levelupTests(u).some(t => ['ungraded', 'challenge'].includes(t.outcome || ''))) return no('Bài thi lên mức đã nộp – hoàn thành thử thách với Season trước');
  const fail = lastLevelupFail(u); if (fail && fail.target === target) { const plan = retakePlan(u, fail); if (!plan.ok) return { ok: false, reason: `Chưa thi lại được: ${plan.items.filter(i => !i.ok).map(i => i.label.toLowerCase()).join(', ')}`, target, retry: plan.retry, plan, fail }; }
  if (!levelSignal(u).ready) return no('Chưa đủ 4 tín hiệu sẵn sàng');
  const form = approvedLevelForm(target); if (!form) return no(`Chưa có đề thi lên mức ${target} được duyệt`);
  return { ok: true, target, form };
}
/** Kết quả bài thi lên mức: ungraded / challenge / fail (đạt = tổng ≥70 và mỗi kỹ năng ≥50%). */
export function evalLevelupTest(test: TestRecord) {
  if (levelRequests().some(r => r.testId === test.id)) return;
  const ss = test.sectionScores; test.weakest = SECTIONS.reduce((a, k) => ss[k].pct < ss[a].pct ? k : a, SECTIONS[0]);
  const lrOut = ss.listening.pct < 50 || ss.reading.pct < 50 || ss.listening.points + ss.reading.points + 50 < 70;
  if (!lrOut && SECTIONS.some(k => ss[k].heuristic)) { test.outcome = 'ungraded'; return; }
  if (test.total >= 70 && SECTIONS.every(k => ss[k].pct >= 50)) { if (test.outcome !== 'challenge') { test.outcome = 'challenge'; delete test.failedAt; } }
  else { test.outcome = 'fail'; test.failedAt = test.failedAt || new Date().toISOString(); }
}
export function challengeSession(u: User, test: TestRecord): CoachSession {
  let s = challengeOf(test);
  if (!s) { const name = u.name.split(' ').pop(); s = { id: uid('cs'), userId: u.id, week: currentWeek(), startedAt: new Date().toISOString(), challenge: { target: test.target!, testId: test.id, result: null }, messages: [{ role: 'assistant', content: `Hi ${name}, this is your ${test.target} challenge: ${CHALLENGE_TURNS} turns, and I will talk to you at ${test.target} level. Let's start. Tell me about a recent problem at work and how you dealt with it.` }], turns: [] }; S.coachSessions.push(s); save(); }
  return s;
}
export const challengeScore = (s: CoachSession) => { const t = s.turns; const mean = t.length ? Math.round(10 * t.reduce((a, x) => a + (x.rubric.meaning + x.rubric.vocab + x.rubric.grammar) / 3, 0) / t.length) / 10 : 0; const off = t.filter(x => x.offTopic).length; return { mean, off, pass: mean >= 3.5 && off <= 1 }; };
export function finishChallenge(u: User, s: CoachSession) {
  const r = challengeScore(s); const now = new Date().toISOString(); Object.assign(s.challenge!, { result: r.pass ? 'pass' : 'fail', mean: r.mean, off: r.off, finishedAt: now });
  const test = S.tests.find(t => t.id === s.challenge!.testId);
  if (r.pass && test && test.outcome === 'challenge') { test.outcome = 'requested'; levelRequests().push({ id: uid('lr'), userId: u.id, from: u.cefr, to: s.challenge!.target, testId: test.id, sessionId: s.id, status: 'pending', at: now }); }
  else if (test) { test.outcome = 'fail'; test.failedAt = now; }
  save(true); return r;
}
export function levelUpState(u: User): any {
  const target = nextLevelOf(u.cefr); const req = openLevelRequest(u); if (req) return { phase: 'requested', req, target: req.to, test: S.tests.find(t => t.id === req.testId), session: S.coachSessions.find(c => c.id === req.sessionId) };
  if (draftStarted(u.id, 'levelup')) return { phase: 'testing', target };
  const t = levelupTests(u)[0];
  if (t && t.outcome === 'ungraded') return { phase: 'ungraded', test: t, target: t.target };
  if (t && t.outcome === 'challenge') return { phase: 'challenge', test: t, session: challengeOf(t), target: t.target };
  const e = levelUpEligibility(u); if (e.ok) return { phase: 'eligible', e, target, minutes: Math.round(sum(SECTIONS.map(s => testDurSec(s, 'levelup'))) / 60) };
  if (e.plan) { const test = e.fail; return { phase: 'failed', test, retry: e.retry, plan: e.plan, target, session: challengeOf(test), req: levelRequests().find(r => r.testId === test.id && r.status === 'rejected') }; }
  if (u.pendingCefr && levelRequests().some(r => r.userId === u.id && r.status === 'approved' && r.to === u.pendingCefr!.to)) return { phase: 'approved', target };
  return { phase: 'none', reason: e.reason, target };
}
export function challengeView(u: User) { const st = levelUpState(u); if (st.phase !== 'challenge') return null; const s = challengeSession(u, st.test); const used = coachTurnsToday(u), cap = coachDailyLimit(); return { state: st, session: s, score: challengeScore(s), used, cap, capped: used >= cap, hasAi: ai.hasKey(), chat: chatView(s), turns: CHALLENGE_TURNS }; }


// =====================================================================================
// OPERATOR – duyệt mức, đề lên mức, chủ đề tuần, ma trận bài, đọc mẫu, prompt
// =====================================================================================
/** Màn "Duyệt trình độ": chờ duyệt, tín hiệu đổi mức, yêu cầu lên mức, đã duyệt, chưa test, báo cáo chủ đề game. */
export function approvalView() {
  const pending = learners().filter(x => !x.cefrApproved && userTest(x.id, 'placement')).map(x => ({ user: x, test: userTest(x.id, 'placement')! }));
  const noTest = learners().filter(x => !x.cefrApproved && !userTest(x.id, 'placement'));
  const approved = learners().filter(x => x.cefrApproved);
  const sig = approved.map(x => ({ x, s: levelSignal(x), st: levelUpState(x) }));
  const ready = sig.filter(r => r.s.ready && !r.x.pendingCefr && (r.st.phase === 'eligible' || (r.st.phase === 'none' && !approvedLevelForm(nextLevelOf(r.x.cefr)!)))), weak = sig.filter(r => r.s.demote && !r.x.pendingCefr);
  const flow = sig.filter(r => ['testing', 'ungraded', 'challenge', 'failed'].includes(r.st.phase));
  const reqs = levelRequests().filter(r => r.status === 'pending').map(r => ({ r, x: userById(r.userId), test: S.tests.find(t => t.id === r.testId), s: S.coachSessions.find(c => c.id === r.sessionId) })).filter(q => q.x);
  return { week: currentWeek(), pilotWeeks: S.settings.pilotWeeks, topic: weekInfo(currentWeek()).topic, hasAi: ai.hasKey(), pending, noTest, approved: approved.map(x => ({ user: x, test: userTest(x.id, 'placement') })), ready, weak, flow, levelRequests: reqs, openAppeals: appeals().filter(a => a.status === 'pending').length, topicReports: topicReports().filter(r => r.status === 'open').map(r => ({ ...r, user: userById(r.userId) })), cfg: levelUpCfg(), deleteRequests: delReqView(me()!), trash: trashList(), gone: goneRequests() };
}
export function approveLevel(userId: string, level: Cefr) { const x = userById(userId)!; const pt = userTest(x.id, 'placement'); setLevel(x, level, me()!.id, 'Duyệt mức đầu vào', pt ? `Test đầu vào ${pt.total}/100${pt.aiSuggestedCefr ? ', AI gợi ý ' + pt.aiSuggestedCefr : ''}` : ''); x.cefrApproved = true; x.approvedAt = new Date().toISOString(); x.approvedBy = me()!.id; save(true); notify(`${x.name} → ${x.cefr}`, 'ok'); }
export function setLevelDirect(userId: string, level: Cefr) { const x = userById(userId)!; setLevel(x, level, me()!.id, 'Xếp mức trực tiếp (không làm test)', ''); x.cefrApproved = true; x.approvedAt = new Date().toISOString(); x.approvedBy = me()!.id; save(true); }
/** Đổi mức (có hiệu lực thứ Hai tuần sau khi đã duyệt). */
export function changeLevel(userId: string, to: Cefr, reason: string) {
  const x = userById(userId)!; if (to !== x.cefr && !reason.trim()) return { error: 'Cần ghi lý do đổi mức' };
  const rw = rewards(x); const r = setLevel(x, to, me()!.id, reason.trim(), `Tuần ${currentWeek()} · ${rw.stats.lessons} bài · ${rw.points} điểm`);
  save(true); notify(r === 'pending' ? `${x.name}: → ${to} từ ${fmtDate(x.pendingCefr!.effective)}` : r === 'now' ? `${x.name} → ${to}` : 'Giữ nguyên mức', r === 'same' ? '' : 'ok'); return { ok: true, result: r, effective: x.pendingCefr?.effective };
}
export function cancelPendingLevel(userId: string) { const x = userById(userId)!; x.pendingCefr = null; save(true); notify('Đã huỷ thay đổi mức đang chờ', 'ok'); }
export function setMonthlyGoal(userId: string, goal: string) { const x = userById(userId)!; x.monthlyGoal = goal.trim(); save(true); }
export function demote(userId: string, reason: string) {
  const u = userById(userId)!; const to = LEVELS[LEVELS.indexOf(u.cefr!) - 1]; if (!to) return { error: 'Đang ở mức thấp nhất' }; if (!reason.trim()) return { error: 'Cần ghi lý do' };
  const sig = levelSignal(u); setLevel(u, to, me()!.id, reason.trim(), sig.wrongWeeks.map(w => `tuần ${w.w}: ${w.rate}% sai / ${w.n} phần`).join('; ')); save(true); notify(`${u.name}: → ${to} từ ${fmtDate(u.pendingCefr?.effective || todayStr())}`, 'ok'); return { ok: true, to };
}
export const demoteDefaultReason = (u: User) => `Hai tuần liền sai nhiều: ${levelSignal(u).wrongWeeks.map(w => `tuần ${w.w} ${w.rate}%`).join(', ')}`;
export async function rescoreTest(testId: string) { const test = S.tests.find(x => x.id === testId)!; const x = userById(test.userId)!; const r = await ai.assessPlacement(test, x); applyAiAssessment(test, r); syncUserFromTest(x, test); if (test.kind === 'levelup') evalLevelupTest(test); save(true); notify('Đã chấm lại bằng AI', 'ok'); }
export function gradeTestManual(testId: string, writing: Dict<number>, speaking: Dict<number>, note?: string) {
  const test = S.tests.find(x => x.id === testId)!; const x = userById(test.userId)!; const val = (v: any) => clamp(+(v || 0), 0, 5);
  test.writingRubric = Object.fromEntries(WRITING_CRITERIA.map(([k]) => [k, val(writing[k])])); test.speakingRubric = Object.fromEntries(SPEAKING_CRITERIA.map(([k]) => [k, val(speaking[k])]));
  if (note?.trim()) test.rationale = note.trim();
  test.gradedBy = me()!.id; test.gradedAt = new Date().toISOString(); recomputeTest(test); test.aiSuggestedCefr = test.aiSuggestedCefr || test.rawLevel; syncUserFromTest(x, test); if (test.kind === 'levelup') evalLevelupTest(test); save(true); notify('Đã lưu điểm chấm tay', 'ok');
}
// ---- level-up forms ----
export function levelFormsView() { const byTarget = (t: Cefr) => levelForms().filter(f => f.target === t).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); return LEVELS.slice(1).map(t => ({ target: t, forms: byTarget(t).map(f => ({ ...f, uses: S.tests.filter(x => x.form === f.id).length })), approved: byTarget(t).find(f => f.status === 'approved') || null })); }
export async function generateLevelForm(target: Cefr) { const form = await ai.generateLevelForm(target); levelForms().push({ id: uid('lf'), target, status: 'draft', form, createdAt: new Date().toISOString(), by: me()!.id, byName: me()!.name }); save(true); notify(`Đã sinh đề mức ${target} – xem rồi duyệt`, 'ok'); }
export function approveLevelForm(id: string) { const f = levelForms().find(x => x.id === id); if (!f) return; levelForms().forEach(x => { if (x.target === f.target && x.status === 'approved') x.status = 'draft'; }); f.status = 'approved'; f.approvedAt = new Date().toISOString(); f.approvedBy = me()!.id; save(true); notify(`Đề mức ${f.target} đã duyệt (mỗi mức chỉ một đề đang dùng)`, 'ok'); }
export function deleteLevelForm(id: string) { const f = levelForms().find(x => x.id === id); if (!f) return { error: 'Không có đề' }; if (S.tests.some(x => x.form === f.id)) return { error: 'Đề này đã có bài thi nên không xoá được; sinh đề mới và duyệt để thay' }; S.levelForms = levelForms().filter(x => x.id !== f.id); save(true); return { ok: true }; }
// ---- level-up requests ----
export function approveLevelRequest(id: string) {
  const r = levelRequests().find(x => x.id === id); if (!r || r.status !== 'pending') return; const u = userById(r.userId)!; const test = S.tests.find(x => x.id === r.testId); const s = S.coachSessions.find(c => c.id === r.sessionId);
  const ev = `Bài thi lên mức ${test ? test.total + '/100 (' + SECTIONS.map(k => SECTION_NAMES[k] + ' ' + test.sectionScores[k].pct + '%').join(', ') + ')' : '—'}; thử thách Season ${s ? s.challenge!.mean + '/5, ' + s.challenge!.off + ' lạc đề' : '—'}`;
  setLevel(u, r.to, me()!.id, 'Thi lên mức đạt', ev); Object.assign(r, { status: 'approved', decidedBy: me()!.id, decidedAt: new Date().toISOString() }); if (test) test.outcome = 'pass';
  save(true); notify(`${u.name} → ${r.to} từ ${fmtDate(u.pendingCefr?.effective || todayStr())}`, 'ok');
}
export function rejectLevelRequest(id: string, reason: string) {
  const r = levelRequests().find(x => x.id === id); if (!r || r.status !== 'pending') return { error: 'Yêu cầu không còn chờ' }; if (!reason.trim()) return { error: 'Cần ghi lý do' }; const test = S.tests.find(x => x.id === r.testId);
  Object.assign(r, { status: 'rejected', reason: reason.trim(), decidedBy: me()!.id, decidedAt: new Date().toISOString() }); if (test) { test.outcome = 'fail'; test.failedAt = new Date().toISOString(); }
  save(true); notify('Đã từ chối; học viên thi lại được sau 14 ngày', 'ok'); return { ok: true };
}
export function closeTopicReport(id: string) { const r = topicReports().find(x => x.id === id); if (r) { r.status = 'done'; r.doneBy = me()!.id; r.doneAt = new Date().toISOString(); save(true); } }
// ---- weeks ----
export const weekSug: Dict<any> = {}; // gợi ý AI gần nhất, không lưu
export async function suggestWeeks(weekNos: number[]) { if (!weekNos.length) return { error: 'Không có tuần nào cần gợi ý' }; const res = await ai.suggestWeeks(weekNos); if (!res.length) throw new Error('AI không trả về gợi ý hợp lệ'); res.forEach((w: any) => { weekSug[w.week] = w; }); touch(); return { ok: true, weeks: res.map((w: any) => w.week) }; }
export function confirmWeekSuggestion(n: number, i: number) { const s = weekSug[n], o = s?.options[i], w = S.weeks.find(x => x.n === n); if (!o || !w) return null; Object.assign(w, { topic: o.topic, description: o.description, objectives: o.objectives, keyVocabHint: o.keyVocabHint, plan: o.levels }); save(true); s.confirmed = i; notify(`Đã lưu chủ đề tuần ${n}`, 'ok'); return o; }
export function closeWeekSuggestion(n: number) { delete weekSug[n]; touch(); }
export function reopenWeekSuggestion(n: number) { if (weekSug[n]) { weekSug[n].confirmed = null; touch(); } }
export function saveWeeks(forms: { n: number; topic: string; description: string; objectives: string; keyVocabHint: string }[]) { forms.forEach(f => { const w = S.weeks.find(x => x.n === f.n); if (!w || w.n > S.settings.pilotWeeks) return; const nt = (f.topic || '').trim(); if (nt !== w.topic) delete w.plan; w.topic = nt; w.description = (f.description || '').trim(); w.objectives = (f.objectives || '').trim(); w.keyVocabHint = (f.keyVocabHint || '').trim(); }); save(true); notify('Đã lưu', 'ok'); }
export const weeksView = () => ({ weeks: S.weeks.slice(0, S.settings.pilotWeeks).map(w => ({ ...w, start: weekStart(w.n), end: addDays(weekStart(w.n), 6), current: w.n === currentWeek(), suggestion: weekSug[w.n] || null })), pilotWeeks: S.settings.pilotWeeks, pilotStart: S.settings.pilotStartDate, hasAi: ai.hasKey() });
// ---- lesson matrix ----
const extraLevels = new Set<Cefr>();
export function addLevelColumn(l: Cefr) { extraLevels.add(l); touch(); }
export function lessonMatrix() {
  const lv = levelsInUse(extraLevels); const count = (l: Cefr) => activeLearners().filter(x => x.cefr === l).length;
  return { levels: lv.map(l => ({ cefr: l, learners: count(l) })), extra: LEVELS.filter(l => !lv.includes(l)), hasAi: ai.hasKey(), rows: S.weeks.slice(0, S.settings.pilotWeeks).map(w => ({ week: w, cells: lv.map(l => { const ls = lessonSet(w.n, l); const plan = (w.plan || {})[l] || []; return { cefr: l, set: ls || null, full: !!ls && (!ls.lessons.length || ls.lessons.every(isFullLesson)), days: Array.from({ length: LESSONS_PER_WEEK }, (_, k) => { const les = ls?.lessons.find((x, xi) => (x.day || xi + 1) === k + 1); return { label: DAY_SHORT[k], title: les?.title || null, planned: plan[k] || null }; }) }; }) })) };
}
export async function generateSet(week: number, cefr: Cefr, onStatus?: (m: string) => void) {
  const w = weekInfo(week); if (!w.topic) return { error: 'Tuần này chưa có chủ đề' };
  ai.onStatus = onStatus || null;
  const lessons = await ai.generateLessonSet(week, cefr);
  lessons.forEach((l: any, i: number) => { l.id = uid('l'); l.order = i + 1; l.day = l.day || i + 1; l.cefr = cefr; l.week = week; l.explanationLang = isLow(cefr) ? 'vi' : 'en'; });
  const existing = lessonSet(week, cefr);
  const set: LessonSet = { id: existing?.id || uid('ls'), week, cefr, status: 'draft', lessons, generatedAt: new Date().toISOString(), generatedBy: me()?.id || null, approvedAt: null, approvedBy: null };
  S.lessonSets = S.lessonSets.filter(x => !(x.week === week && x.cefr === cefr)); S.lessonSets.push(set); save(true);
  notify(`Đã sinh ${lessons.length} bài (bản nháp)`, 'ok'); return { ok: true, set };
}
export function createManualSet(week: number, cefr: Cefr) { const set: LessonSet = { id: uid('ls'), week, cefr, status: 'draft', lessons: [], generatedAt: new Date().toISOString() }; S.lessonSets.push(set); save(true); return set; }
export function setView(week: number, cefr: Cefr) { const ls = lessonSet(week, cefr); if (!ls) return null; return { set: ls, topic: weekInfo(week).topic, vi: isLow(cefr), hasAi: ai.hasKey(), notFull: ls.lessons.filter(l => !isFullLesson(l)).length, issues: ls.lessons.map((l, i) => ({ day: DAY_SHORT[(l.day || i + 1) - 1], levelWarn: l.levelWarn || '', pronBad: !!(l.pron && l.pron.verified === false) })).filter(x => x.levelWarn || x.pronBad), phrasesMissing: ls.lessons.filter(l => isMicroLesson(l) && phrasesMissing(l).length).length, detailsMissing: ls.lessons.filter(detailsMissing).length, lessons: ls.lessons.map((l, i) => ({ lesson: l, index: i, day: DAY_SHORT[(l.day || i + 1) - 1] || 'Bài ' + (i + 1), micro: isMicroLesson(l), practice: normPractice(l.practice), view: isMicroLesson(l) ? lessonView(l) : null })), days: Array.from({ length: LESSONS_PER_WEEK }, (_, i) => ({ day: i + 1, label: DAY_SHORT[i], lesson: ls.lessons.find((z, zi) => (z.day || zi + 1) === i + 1) || null })) }; }
export function approveSet(id: string) { const ls = S.lessonSets.find(x => x.id === id)!; ls.status = 'approved'; ls.approvedAt = new Date().toISOString(); ls.approvedBy = me()!.id; save(true); notify('Đã duyệt. Người học mức ' + ls.cefr + ' sẽ thấy bộ bài này.', 'ok'); }
export function unapproveSet(id: string) { const ls = S.lessonSets.find(x => x.id === id)!; ls.status = 'draft'; save(true); }
export function deleteSet(id: string) { S.lessonSets = S.lessonSets.filter(x => x.id !== id); save(true); }
export function deleteLessonAt(setId: string, i: number) { const ls = S.lessonSets.find(x => x.id === setId)!; ls.lessons.splice(i, 1); save(true); }
export function editLessonJson(setId: string, i: number, json: string) { try { const obj = JSON.parse(json); const ls = S.lessonSets.find(x => x.id === setId)!; obj.id = ls.lessons[i].id; obj.editedBy = me()!.id; obj.editedAt = new Date().toISOString(); ls.lessons[i] = obj; save(true); return { ok: true }; } catch (e: any) { return { error: 'JSON lỗi: ' + e.message }; } }
export function lessonFormInitial(setId: string, day: number) { const ls = S.lessonSets.find(x => x.id === setId)!; const l = ls.lessons.find((z, zi) => (z.day || zi + 1) === day); return l && isMicroLesson(l) ? lessonToFields(l) : {}; }
/** Lưu form soạn tay. `force`=false: trả về problems để UI hỏi; true: lưu dù thiếu. */
export function saveLessonForm(setId: string, day: number, fields: Dict<string>, force = false) {
  const ls = S.lessonSets.find(x => x.id === setId); if (!ls) return { error: 'Không có bộ bài' }; const f = mergeLessonFormInputs(fields);
  const { problems, lesson } = fieldsToLesson(f, day, ls.week, ls.cefr, ls.lessons, me()?.id);
  if (problems.length && !force) return { problems };
  ls.lessons.forEach((z, zi) => { if (!z.day) z.day = zi + 1; });
  ls.lessons = ls.lessons.filter(z => z.day !== day); ls.lessons.push(lesson); ls.lessons.sort((a, b) => (a.day || 99) - (b.day || 99));
  const was = ls.status; ls.status = 'draft'; ls.approvedAt = null; ls.generatedBy = ls.generatedBy || me()!.id; ls.generatedAt = ls.generatedAt || new Date().toISOString(); ls.editedAt = new Date().toISOString();
  save(true); notify(`Đã lưu bài ${DAY_SHORT[day - 1]}${problems.length ? ` (còn ${problems.length} mục thiếu)` : ''}${was === 'approved' ? ' – bộ bài trở về Bản nháp, cần duyệt lại' : ''}`, problems.length ? '' : 'ok'); return { ok: true, problems, lesson };
}
export async function enrichSet(setId: string, onStatus?: (m: string) => void) {
  const ls = S.lessonSets.find(x => x.id === setId); if (!ls) return { error: 'Không có bộ bài' }; const todo = ls.lessons.filter(detailsMissing); if (!todo.length) return { ok: true, done: 0 };
  let done = 0, i = 0; const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
  for (const l of todo) { i++; onStatus?.(`Đang bổ sung chi tiết từ vựng & bài tập mới (bài ${i}/${todo.length})…`);
    try { if (await enrichLesson(l, ls.cefr, weekInfo(ls.week).topic)) done++; } catch (e: any) { if (/429/.test(e.message)) { onStatus?.(`Hết hạn mức phút – đợi 60 giây rồi làm tiếp (bài ${i}/${todo.length})…`); await wait(60000); try { if (await enrichLesson(l, ls.cefr, weekInfo(ls.week).topic)) done++; } catch (e2: any) { notify(`Bài ${i}: ${e2.message}`, 'err'); } } else notify(`Bài ${i}: ${e.message}`, 'err'); }
    if (i < todo.length) await wait(1500); }
  const was = ls.status; if (done && was === 'approved') { ls.status = 'draft'; ls.approvedAt = null; }
  save(true); notify(done ? `Đã bổ sung cho ${done} bài${was === 'approved' ? ' – bộ bài trở về Bản nháp, đọc lại rồi duyệt' : ''}` : 'Không bổ sung được – thử lại sau', done ? 'ok' : 'err'); return { ok: true, done };
}
export async function fillPhrases(setId: string) {
  const ls = S.lessonSets.find(x => x.id === setId); if (!ls) return { error: 'Không có bộ bài' }; const need: string[] = []; ls.lessons.filter(isMicroLesson).forEach(l => phrasesMissing(l).forEach(e => { if (!need.includes(e)) need.push(e); })); if (!need.length) return { ok: true, done: 0 };
  const map = await fetchPhrases(need, ls.cefr, weekInfo(ls.week).topic);
  let done = 0; ls.lessons.filter(isMicroLesson).forEach(l => (l.vocab || []).forEach(v => { if ((v.phrases || []).length >= 3) return; const got = cleanPhrases([...(v.phrases || []), ...(map[v.e.toLowerCase()] || [])], v.e); if (got.length > (v.phrases || []).length) { v.phrases = got; done++; } }));
  const was = ls.status; if (done && was === 'approved') { ls.status = 'draft'; ls.approvedAt = null; }
  save(true); notify(done ? `Đã bổ sung cụm từ cho ${done} từ${was === 'approved' ? ' – bộ bài trở về Bản nháp, đọc lại rồi duyệt' : ''}` : 'AI không trả về cụm từ dùng được – thử lại sau', done ? 'ok' : 'err'); return { ok: true, done };
}
// ---- review ----
export function reviewView(tab = S.session.reviewTab || 'subs') {
  const subs = S.submissions.slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).map(s => ({ ...s, user: userById(s.userId) }));
  const turns: any[] = []; S.coachSessions.forEach(cs => cs.turns.forEach(t => turns.push({ ...t, userId: cs.userId, week: cs.week, sessionId: cs.id, user: userById(cs.userId) }))); turns.sort((a, b) => b.at.localeCompare(a.at));
  const micro = (S.microLessons || []).slice().sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)).slice(0, 60).map(m => ({ ...m, user: userById(m.userId), practice: normPractice(m.practice) }));
  const ap = appeals().slice().sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.at.localeCompare(a.at)).slice(0, 60).map(a => ({ ...a, user: userById(a.userId) }));
  const rows: any[] = []; const pr = S.practiceResults || {};
  learners().forEach(x => S.lessonSets.filter(ls => ls.cefr === x.cefr).forEach(ls => ls.lessons.filter(isMicroLesson).forEach(l => { const cells = (['L', 'R', 'W', 'S'] as PartCode[]).map(c => { const has = lessonParts(l).some(p => p.code === c); const st = resState(pr[x.id + '_' + partKey(l.id, c)]); return { code: c, has, ...st }; }); if (cells.some(c => c.attempts)) rows.push({ user: x, set: ls, lesson: l, day: DAY_SHORT[(l.day || 1) - 1] || '', cells, total: sum(cells.map(c => c.attempts)), failed: cells.filter(c => c.done && !c.ok).length }); })));
  rows.sort((a, b) => b.failed - a.failed || b.total - a.total);
  const tests = S.tests.slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).map(t => ({ ...t, user: userById(t.userId) }));
  return { tab, counts: { subsUnread: subs.filter(s => !s.operatorChecked).length, turnsUnchecked: turns.filter(t => !t.checked).length, micro: (S.microLessons || []).length, appealsPending: appeals().filter(a => a.status === 'pending').length, tests: S.tests.length }, subs, turns: turns.slice(0, 40), micro, appeals: ap, attempts: rows, tests, hasAi: ai.hasKey(), maxAttempts: MAX_ATTEMPTS };
}
export function setReviewTab(tab: string) { S.session.reviewTab = tab; save(); }
export function checkSubmission(id: string, checked: boolean) { const s = S.submissions.find(x => x.id === id)!; s.operatorChecked = checked; s.checkedBy = me()!.id; save(true); }
export function checkTurn(sessionId: string, at: string, checked: boolean) { const cs = S.coachSessions.find(x => x.id === sessionId); const turn = cs?.turns.find(x => x.at === at); if (turn) { turn.checked = checked; turn.checkedBy = me()!.id; save(true); } }
export function gradeSubmissionManual(id: string, meaning: number, vocab: number, grammar: number, feedback: string) { const s = S.submissions.find(x => x.id === id)!; const m = clamp(+meaning, 0, 5), v = clamp(+vocab, 0, 5), g = clamp(+grammar, 0, 5); s.rubric = { meaning: m, vocab: v, grammar: g }; s.total = Math.round((m * 0.4 + v * 0.3 + g * 0.3) * 20); s.feedback = (feedback || '').trim(); s.suggestions = s.suggestions || []; s.aiGraded = false; s.operatorChecked = true; s.gradedAt = new Date().toISOString(); save(true); }
// ---- prompts ----
export const PROMPT_KEYS: [string, string][] = [['base', 'Quy tắc chung (mọi lời gọi trừ sinh bài siêu ngắn)'], ['placement', 'Chấm test & xếp trình độ'], ['lesson', 'Sinh 5 bài siêu ngắn cho tuần (giữ nguyên các biến {n} {cefr_level} {topic} {job} {learning_style} {explain_lang} và key JSON lessons[]…)'], ['weeks', 'Gợi ý khung chủ đề tuần (giữ các biến {n} {learners} {levels} {used})'], ['mgrade', 'Chấm bài thực hành siêu ngắn (giữ {cefr_level} {explain_lang} {theory} {vocab} {practice} {answer})'], ['coach', 'AI coach hội thoại'], ['grade', 'Chấm bài thực hành thứ Sáu']];
export const promptsView = () => PROMPT_KEYS.map(([k, label]) => ({ key: k, label, value: S.settings.prompts[k] || (k === 'base' ? PROMPTS_DEFAULT_BASE : (PROMPTS as Dict<string>)[k]), isDefault: !S.settings.prompts[k], defaultValue: k === 'base' ? PROMPTS_DEFAULT_BASE : (PROMPTS as Dict<string>)[k] }));
export function savePrompts(values: Dict<string>) { PROMPT_KEYS.forEach(([k]) => { const v = (values[k] || '').trim(); const def = k === 'base' ? PROMPTS_DEFAULT_BASE : (PROMPTS as Dict<string>)[k]; if (v && v !== def) S.settings.prompts[k] = v; else delete S.settings.prompts[k]; }); applyBasePromptOverride(); save(true); notify('Đã lưu prompt', 'ok'); }

// ---- settings ----
export function saveSettings(patch: Partial<Settings>) {
  const s = S.settings; Object.assign(s, patch);
  s.model = s.model || 'claude-opus-5-5'; s.geminiModel = s.geminiModel || 'gemini-3.8-flash'; s.sttModel = s.sttModel || 'whisper-large-v3-turbo';
  s.minMinutesPerDay = +s.minMinutesPerDay || 15; s.coachDailyLimit = clamp(+s.coachDailyLimit! || 20, 1, 200); s.theme = s.theme || 'auto';
  s.testTimes = Object.fromEntries(SECTIONS.map(k => [k, clamp(+(s.testTimes || {})[k] || 15, 1, 60)])) as any; s.testWarnLimit = clamp(+s.testWarnLimit || 3, 1, 10);
  s.levelUp = Object.fromEntries(Object.keys(LEVELUP_DEFAULTS).map(k => { const v = parseFloat(String((s.levelUp || {})[k])); return [k, Number.isFinite(v) ? v : (LEVELUP_DEFAULTS as Dict<number>)[k]]; }));
  s.webhookTemplate = (s.webhookTemplate || '').trim() || '{"base_content":"{message}"}';
  save(true); applyThemeToDocument(S); notify('Đã lưu cài đặt', 'ok');
}
export function setTheme(t: ThemeKey | 'auto') { S.settings.theme = t || 'auto'; save(true); applyThemeToDocument(S); notify(`Giao diện: ${S.settings.theme === 'auto' ? 'tự động (' + (THEMES as Dict)[autoTheme()].name + ')' : (THEMES as Dict)[S.settings.theme].name}`, 'ok'); }
export const settingsView = () => ({ settings: S.settings, provider: ai.provider(), providerLabel: ai.providerLabel(), model: ai.modelName(), hasKey: ai.hasKey(), presets: OAI_PRESETS, imgSources: IMG_SOURCES, themes: THEMES, autoTheme: autoTheme(), currentWeek: currentWeek(), weekRange: [weekStart(currentWeek()), addDays(weekStart(currentWeek()), 6)], levelUp: levelUpCfg(), levelUpDefaults: LEVELUP_DEFAULTS, users: S.users.map(x => ({ user: x, canManage: canManage(me(), x) })), role: me()?.role, maxAttempts: MAX_ATTEMPTS });

// =====================================================================================
// MANAGER – KPI, từng học viên, hiệu suất vận hành, nhắc học, báo cáo, CSV, giả lập thưởng
// =====================================================================================
export function weekCompleted(u: User, wk: number) { const ls = approvedLessons(wk, cefrAt(u, wk)); return ls.length ? ls.every(l => userProgress(u.id, l.id)?.completedAt) : sessionsThisWeek(u.id, wk) >= 3; }
export function kpis() {
  const L = activeLearners(), wk = currentWeek(), n = L.length; const weeksSoFar = Array.from({ length: wk }, (_, i) => i + 1);
  const regular = L.filter(u => sessionsThisWeek(u.id, wk) >= 3).length; const byWeek = weeksSoFar.map(w => ({ w, pct: pct(L.filter(u => sessionsThisWeek(u.id, w) >= 3).length, n) }));
  const completed = L.filter(u => weeksSoFar.every(w => weekCompleted(u, w))).length;
  const both = L.map(u => ({ p: userTest(u.id, 'placement'), f: userTest(u.id, 'final') })).filter(x => x.p && x.f); const improved = both.filter(x => x.f!.total > x.p!.total).length;
  const ratings = S.surveys.map(s => s.rating);
  return { n, wk, regular, regularPct: pct(regular, n), byWeek, completed, completedPct: pct(completed, n), both: both.length, improved, improvedPct: pct(improved, both.length), surveys: ratings.length, satisfaction: ratings.length ? Math.round(avg(ratings) * 10) / 10 : null };
}
export function learnerRow(u: User) { const wk = currentWeek(), ls = approvedLessons(wk, u.cefr); const miss = missedDays(u.id), sessions = sessionsThisWeek(u.id); return { u, wk, lessons: ls.length, done: ls.filter(l => userProgress(u.id, l.id)?.completedAt).length, turns: coachTurnsThisWeek(u), sessions, last: lastActiveDate(u.id), miss, rw: rewards(u), sub: weekSubmission(u, wk), p: userTest(u.id, 'placement'), f: userTest(u.id, 'final'), risk: miss >= 2 ? 2 : (sessions === 0 && dowIndex(todayStr()) >= 2 ? 1 : 0), dots: weekDotsMini(u.id, wk) }; }
export function managerView() { const k = kpis(); const rows = activeLearners().map(learnerRow).sort((a, b) => b.risk - a.risk || a.sessions - b.sessions); return { kpis: k, rows, pendingReminders: S.reminders.filter(r => r.status === 'pending').length, waiting: learners().filter(x => !x.cefrApproved).map(x => ({ user: x, status: userTest(x.id, 'placement') ? 'Đã làm test, chờ vận hành duyệt mức' : x.profile ? 'Đã điền hồ sơ, chưa làm test' : 'Chưa điền hồ sơ' })), pin: pinOverview(), deleteRequests: delReqView(me()!), trash: trashList(), gone: goneRequests(), pilotWeeks: S.settings.pilotWeeks }; }
export function opStats(op: User) {
  const weeks = Array.from({ length: S.settings.pilotWeeks }, (_, i) => i + 1);
  const mine = S.lessonSets.filter(ls => (ls.generatedBy || ls.approvedBy) === op.id || ls.approvedBy === op.id);
  const byWeek = weeks.map(w => { const sets = mine.filter(ls => ls.week === w); return { w, sets: sets.length, lessons: sum(sets.map(s => s.lessons.length)), approved: sets.filter(s => s.status === 'approved').length }; });
  const lessons = mine.flatMap(ls => ls.lessons); const full = lessons.filter(l => isMicroLesson(l) && lessonParts(l).length === 4 && l.pron && (l.vocab || []).length).length;
  const ids = lessons.map(l => l.id); const idSet = new Set(ids); const prog = S.progress.filter(p => idSet.has(p.lessonId) && p.completedAt);
  let parts = 0, first = 0, failed = 0, attempts = 0;
  Object.entries(S.practiceResults || {}).forEach(([k, r]) => { if (!ids.some(id => k.endsWith('_' + id) || k.includes('_' + id + '~'))) return; const st = resState(r); if (!st.attempts) return; parts++; attempts += st.attempts; if (st.ok && st.attempts === 1) first++; if (st.done && !st.ok) failed++; });
  const approvals = learners().filter(x => x.approvedBy === op.id);
  const waits = approvals.map(x => { const t = userTest(x.id, 'placement'); return t && x.approvedAt ? (new Date(x.approvedAt).getTime() - new Date(t.submittedAt).getTime()) / 3600000 : null; }).filter((v): v is number => v != null && v >= 0);
  const avgScore = prog.length ? Math.round(avg(prog.map(p => p.score ?? 0))) : null; const failPct = parts ? pct(failed, parts) : null;
  const verdict = avgScore == null && !parts ? ['', 'Chưa đủ dữ liệu'] : ((avgScore ?? 100) < 60 || (failPct ?? 0) > 20) ? ['danger', 'Cần xem lại'] : ((avgScore ?? 100) >= 75 && (failPct ?? 0) <= 10) ? ['ok', 'Tốt'] : ['warn', 'Ổn'];
  return { byWeek, sets: mine.length, lessons: lessons.length, full, edited: lessons.filter(l => l.editedBy === op.id).length, completions: prog.length, avgScore, parts, firstPct: parts ? pct(first, parts) : null, failPct, avgAttempts: parts ? Math.round(attempts / parts * 10) / 10 : null, approvals: approvals.length, waitH: waits.length ? Math.round(avg(waits) * 10) / 10 : null, subsRead: S.submissions.filter(s => s.operatorChecked && s.checkedBy === op.id).length, turnsRead: S.coachSessions.reduce((n, c) => n + c.turns.filter(t => t.checked && t.checkedBy === op.id).length, 0), delReqs: delReqs().filter(r => r.by === op.id).length, verdict };
}
export function opsView() { const ops = S.users.filter(x => x.role === 'operator'); const wk = currentWeek(); const lv = levelsInUse(); const need: any[] = []; for (let w = 1; w <= Math.min(wk, S.settings.pilotWeeks); w++) lv.forEach(l => need.push({ w, l, set: lessonSet(w, l) })); return { ops: ops.map(op => ({ user: op, stats: opStats(op) })), week: wk, ready: need.filter(n => n.set?.status === 'approved').length, need: need.length, missing: need.filter(n => n.set?.status !== 'approved').map(n => ({ week: n.w, cefr: n.l, draft: !!n.set })), orphan: S.lessonSets.filter(ls => !ls.generatedBy && !ls.approvedBy).length, pin: pinOverview(), deleteRequests: delReqView(me()!), trash: trashList(), gone: goneRequests() }; }
export function remindersView() { computeReminders(); return { pending: S.reminders.filter(r => r.status === 'pending').map(r => ({ r, user: userById(r.userId)!, message: reminderMessage(userById(r.userId)!) })).filter(x => x.user), history: S.reminders.filter(r => r.status !== 'pending').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(r => ({ ...r, user: userById(r.userId), label: REMINDER_STATUS_LABEL[r.status] || r.status })), hasWebhook: !!S.settings.webhookUrl }; }
export async function reminderCopy(id: string) { const r = remById(id)!; const ok = await copyText(reminderMessage(userById(r.userId)!)); r.status = 'copied'; r.handledAt = new Date().toISOString(); save(true); notify(ok ? 'Đã copy vào clipboard' : 'Không copy được', ok ? 'ok' : 'err'); }
export function reminderDismiss(id: string) { const r = remById(id)!; r.status = 'dismissed'; r.handledAt = new Date().toISOString(); save(true); }
export async function reminderSend(id: string) { await sendReminder(remById(id)); notify('Đã gửi request tới Base.vn', 'ok'); }
export async function reminderSendAll() { let n = 0; for (const r of S.reminders.filter(r => r.status === 'pending')) { try { await sendReminder(r); n++; } catch (e: any) { notify(e.message, 'err'); break; } } notify(`Đã gửi ${n} tin nhắc`, 'ok'); return n; }
/** Báo cáo tổng kết: số liệu + bản chữ (copy / .txt). */
export function reportView(author: User) {
  const k = kpis(); const rows = activeLearners().map(learnerRow); const verdict = (has: boolean, ok: boolean) => has ? (ok ? '✅ Đạt' : '❌ Chưa đạt') : 'chưa có dữ liệu';
  const line = (r: any) => `- ${r.u.name} (${r.u.cefr}): ${r.sessions} buổi tuần này, ${r.done}/${r.lessons || '–'} bài, ${r.turns} lượt coach, bài T6: ${r.sub ? (r.sub.total ?? 'chờ chấm') : 'chưa'}, đầu vào ${r.p?.total ?? '–'}${r.f ? ` → cuối ${r.f.total}` : ''}${r.miss >= 2 ? ` ⚠ bỏ ${r.miss} ngày` : ''}`;
  const text = [`BÁO CÁO PILOT SEASON ENGLISH – ${S.settings.orgName} – ${new Date().toLocaleDateString('vi-VN')}`, `Tuần ${k.wk}/${S.settings.pilotWeeks} · ${k.n} người học hoạt động (${learners().length} đăng ký)`, '', 'BỐN CHỈ SỐ',
    `1. Học đều (≥3 buổi/tuần): ${k.regularPct}% (${k.regular}/${k.n}) – ngưỡng 70% – ${verdict(k.n > 0, k.regularPct >= 70)}`, `   Theo tuần: ${k.byWeek.map(x => `T${x.w}: ${x.pct}%`).join(', ')}`,
    `2. Học đến cuối: ${k.completedPct}% (${k.completed}/${k.n}) – ngưỡng 60% – ${verdict(k.n > 0, k.completedPct >= 60)}`,
    `3. Có tiến bộ (điểm cuối > đầu vào, cùng rubric): ${k.both ? `${k.improvedPct}% (${k.improved}/${k.both}) – ngưỡng 70% – ${verdict(true, k.improvedPct >= 70)}` : 'chưa có bài cuối kỳ'}`,
    `4. Hài lòng: ${k.surveys ? `${k.satisfaction}/5 (${k.surveys} phản hồi) – ngưỡng 4/5 – ${verdict(true, k.satisfaction! >= 4)}` : 'chưa có khảo sát'}`, '',
    `PHÂN BỐ TRÌNH ĐỘ: ${LEVELS.map(l => [l, activeLearners().filter(x => x.cefr === l).length]).filter(x => x[1]).map(x => `${x[0]}: ${x[1]}`).join(' · ') || '—'}`,
    `BỘ BÀI ĐÃ DUYỆT: ${S.lessonSets.filter(s => s.status === 'approved').map(s => `T${s.week}-${s.cefr} (${s.lessons.length} bài)`).join(', ') || 'chưa có'}`,
    `LƯỢT COACH: ${S.coachSessions.reduce((n, c) => n + goodTurns(c).length, 0)} · BÀI NỘP: ${S.submissions.length} (${S.submissions.filter(s => s.operatorChecked).length} đã đọc mẫu) · NHẮC HỌC: ${S.reminders.length}`, '', 'TỪNG NGƯỜI', ...(rows.length ? rows.map(line) : ['- (chưa có)']), '', 'PHẢN HỒI KHẢO SÁT', ...(S.surveys.length ? S.surveys.map(s => `- ${userById(s.userId)?.name}: ${s.rating}/5${s.comment ? ' – "' + s.comment + '"' : ''}${s.when ? ' (' + s.when + ')' : ''}`) : ['- (chưa có)'])].join('\n');
  const kp = [
    { name: 'Học đều', def: '≥3 buổi mỗi tuần', has: k.n > 0, val: k.regularPct, unit: '%', detail: `${k.regular}/${k.n} người`, thr: '≥ 70%', ok: k.regularPct >= 70, bar: k.regularPct },
    { name: 'Học đến cuối', def: 'hoàn thành các tuần đã qua', has: k.n > 0, val: k.completedPct, unit: '%', detail: `${k.completed}/${k.n} người`, thr: '≥ 60%', ok: k.completedPct >= 60, bar: k.completedPct },
    { name: 'Có tiến bộ', def: 'điểm cuối kỳ cao hơn đầu vào', has: k.both > 0, val: k.improvedPct, unit: '%', detail: `${k.improved}/${k.both} người có đủ 2 bài`, thr: '≥ 70%', ok: k.improvedPct >= 70, bar: k.improvedPct },
    { name: 'Hài lòng', def: 'điểm khảo sát trung bình', has: k.surveys > 0, val: k.satisfaction, unit: '/5', detail: `${k.surveys} phản hồi`, thr: '≥ 4/5', ok: (k.satisfaction || 0) >= 4, bar: (k.satisfaction || 0) * 20 }
  ];
  const measured = kp.filter(x => x.has), passed = measured.filter(x => x.ok); const atRisk = rows.filter(r => r.risk === 2), notStarted = rows.filter(r => r.risk === 1);
  const summary = !k.n ? 'Chưa có học viên nào được duyệt mức, nên chưa có số liệu để đánh giá.' : `Đến tuần ${k.wk}/${S.settings.pilotWeeks}, pilot đạt ${passed.length}/${measured.length} chỉ số đã đo được${measured.length < 4 ? ` (${4 - measured.length} chỉ số chưa có dữ liệu)` : ''}. ${passed.length ? 'Đạt: ' + passed.map(x => x.name.toLowerCase()).join(', ') + '. ' : ''}${measured.length - passed.length ? 'Chưa đạt: ' + measured.filter(x => !x.ok).map(x => `${x.name.toLowerCase()} (${x.val}${x.unit}, ngưỡng ${x.thr})`).join(', ') + '. ' : ''}${atRisk.length ? `${atRisk.length} học viên đã bỏ từ 2 ngày trở lên và cần được nhắc.` : 'Không có học viên nào bỏ quá 2 ngày.'}`;
  const todo = [atRisk.length && `Nhắc ${atRisk.length} học viên đã bỏ từ 2 ngày: ${atRisk.map(r => r.u.name).join(', ')}.`, notStarted.length && `${notStarted.length} học viên chưa học buổi nào trong tuần này: ${notStarted.map(r => r.u.name).join(', ')}.`, learners().filter(x => !x.cefrApproved).length && `${learners().filter(x => !x.cefrApproved).length} người đăng ký chưa được duyệt mức.`, appeals().filter(a => a.status === 'pending').length && `${appeals().filter(a => a.status === 'pending').length} kháng nghị chấm điểm chờ Vận hành xử lý.`, !k.both && 'Chưa có bài kiểm tra cuối kỳ nên chưa đo được tiến bộ.', !k.surveys && 'Chưa có khảo sát hài lòng.'].filter(Boolean) as string[];
  const approvedSets = S.lessonSets.filter(s => s.status === 'approved');
  return { kpis: k, kp, measured: measured.length, passed: passed.length, summary, rows, atRisk, notStarted, text, author: author.name, orgName: S.settings.orgName, courseTheme: courseTheme(), pilotStart: S.settings.pilotStartDate, registered: learners().length, levelDist: LEVELS.map(l => [l, activeLearners().filter(x => x.cefr === l).length] as [Cefr, number]).filter(x => x[1]), approvedSets: { count: approvedSets.length, lessons: sum(approvedSets.map(s => s.lessons.length)) }, turnsAll: S.coachSessions.reduce((n, c) => n + goodTurns(c).length, 0), submissions: { total: S.submissions.length, checked: S.submissions.filter(s => s.operatorChecked).length }, reminders: S.reminders.length, appeals: { total: appeals().length, pending: appeals().filter(a => a.status === 'pending').length }, surveys: S.surveys.map(s => ({ ...s, user: userById(s.userId) })), todo, openQuestions: { webhook: !!S.settings.webhookUrl, when: S.surveys.map(s => s.when).filter(Boolean), model: ai.modelName(), provider: ai.providerLabel() } };
}
export function exportCSV() {
  const rows = activeLearners().map(learnerRow);
  const head = ['Ten', 'Phong ban', 'Vi tri', 'Muc', 'Buoi tuan nay', 'Bai xong', 'Tong bai', 'Luot coach', 'Hoat dong gan nhat', 'Ngay bo', 'Diem T6', 'Dau vao', 'Cuoi ky', 'Hai long', 'Diem thuong', 'Huy hieu', 'Cap ngong'];
  const lines = rows.map(r => [r.u.name, r.u.profile?.department || '', r.u.profile?.position || '', r.u.cefr, r.sessions, r.done, r.lessons, r.turns, r.last || '', r.miss, r.sub?.total ?? '', r.p?.total ?? '', r.f?.total ?? '', S.surveys.find(s => s.userId === r.u.id)?.rating ?? '', r.rw.points, r.rw.badges.filter(b => b.earned).length, `${r.rw.lv.index + 1} - ${r.rw.lv.name}`]);
  const csv = [head, ...lines].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download(`aec-tien-do-${todayStr()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8'); return csv;
}
/** Giả lập phần thưởng của quản lý (không ghi dữ liệu học viên). */
export const rewardSim = { points: 0, badges: [] as string[] };
export const rewardSimView = () => ({ sim: rewardSim, state: rewardState(rewardSim.points, rewardSim.badges), cases: SIM_CASES, levels: GOOSE_LEVELS, badges: BADGES.map(([id, icon, name, desc]) => ({ id, icon, name, desc })) });
export function rewardSimCase(i: number) { const c = SIM_CASES[i]; rewardSim.points = c[1]; rewardSim.badges = [...c[2]]; touch(); }
export function rewardSimPoints(p: number) { rewardSim.points = clamp(Math.round(+p || 0), 0, 600); touch(); }
export function rewardSimToggleBadge(id: string) { rewardSim.badges = rewardSim.badges.includes(id) ? rewardSim.badges.filter(x => x !== id) : [...rewardSim.badges, id]; touch(); }
/** Danh sách yêu cầu xoá cho người xem (quản lý thấy tất cả, vận hành thấy của mình). */
export function delReqView(viewer: User) { const mine = delReqs().filter(r => !r.cleared && (viewer.role === 'manager' || r.by === viewer.id)).sort((a, b) => b.at.localeCompare(a.at)); return { pending: mine.filter(r => r.status === 'pending'), past: mine.filter(r => r.status !== 'pending').slice(0, 5) }; }


// =====================================================================================
// MINI GAMES – bộ từ, kiểm tra chủ đề, kết quả, đấu trường; engine thuần (UI vẽ canvas/DOM)
// =====================================================================================
Object.keys(HERO_NAMES).forEach(k => ['idle', 'run1', 'run2', 'jump'].forEach(p => { (GAME_ART as Dict<string>)[`hero_${k}_${p}`] = heroSprite(k, p); })); // sprite nhân vật theo mùa
export const gameSets = () => (S.gameSets = S.gameSets || []);
export const gameResults = () => (S.gameResults = S.gameResults || []);
export const topicReports = () => (S.topicReports = S.topicReports || []);
export const duels = () => (S.duels = S.duels || []);
export const gshuffle = shuffle;
export const gletters = (w: string) => w.toUpperCase().replace(/[^A-Z]/g, '');
export const myGameSets = (u: User) => gameSets().filter(s => s.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const currentGameSet = (u: User) => { const sets = myGameSets(u); return sets.find(s => s.id === u.gameSetId) || sets[0] || null; };
export const bestGame = (u: User, setId: string, game: string) => gameResults().filter(r => r.userId === u.id && r.setId === setId && r.game === game).sort((a, b) => b.score - a.score)[0];
export const gameOthers = (set: GameSet, cefr: Cefr): GameWord[] => set.others && set.others.length ? set.others : (GAME_POOL as Dict<any[]>)[isLow(cefr) ? 'low' : 'high'].map(([e, v]) => ({ e, v }));
export const gameHint = (w: GameWord, u: User) => isLow(u.cefr) ? { main: w.v, sub: w.def || '' } : { main: w.def || w.v, sub: w.def ? w.v : '' };
/** Kiểm tra chủ đề trước khi gọi AI. kind: short | long | chars | nonsense | banned | group (chỉ nonsense và banned tính strike). */
export function validateTopic(raw: string): { ok: boolean; kind?: string; reason?: string; topic?: string } {
  const t = String(raw || '').trim().replace(/\s+/g, ' ');
  if (t.length < 3) return { ok: false, kind: 'short', reason: 'Chủ đề quá ngắn (ít nhất 3 ký tự)' };
  if (t.length > 60) return { ok: false, kind: 'long', reason: 'Chủ đề quá dài (tối đa 60 ký tự)' };
  if (!/^[\p{L}\p{M}\d' &,/-]+$/u.test(t)) return { ok: false, kind: 'chars', reason: 'Chỉ dùng chữ, số và dấu cách' };
  if (!/\p{L}/u.test(t) || t.split(' ').length > 6) return { ok: false, kind: 'nonsense', reason: 'Chủ đề cần là 1–6 từ có nghĩa' };
  const low = t.toLowerCase();
  if (hasTerm(low, GROUP_TERMS)) return { ok: false, kind: 'group', reason: 'Chủ đề chưa hợp bối cảnh đời sống / học tập ở đây – bạn chọn chủ đề khác nhé' };
  const letters = low.replace(/[^\p{L}]/gu, '');
  if (/(.)\1{3,}/.test(letters) || !/[aeiouyàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/.test(letters)) return { ok: false, kind: 'nonsense', reason: 'Chủ đề trông không có nghĩa – nhập lại nhé' };
  if (hasTerm(low, BANNED_TOPIC)) return { ok: false, kind: 'banned', reason: 'Chủ đề không phù hợp để học tiếng Anh công sở' };
  return { ok: true, topic: t };
}
/** Chủ đề sai/vi phạm = 1 strike; đủ 3 → báo cáo vận hành. Trả về true khi vừa tạo báo cáo. */
export function topicStrike(u: User, input: string, reason: string) {
  u.topicStrikes = [...(u.topicStrikes || []), { input, reason, at: new Date().toISOString() }]; const n = u.topicStrikes.length;
  if (n % 3 === 0) { topicReports().push({ id: uid('tr'), userId: u.id, at: new Date().toISOString(), inputs: u.topicStrikes.slice(-3), status: 'open' }); save(true); notify('Nhập chủ đề sai / vi phạm 3 lần – đã báo cho Người vận hành', 'err'); return true; }
  save(true); notify(`Chủ đề không hợp lệ (lần ${n % 3}/3). Đủ 3 lần sẽ báo cho Người vận hành.`, 'err'); return false;
}
export function weekGameSet(u: User) { const words: GameWord[] = []; const seen = new Set<string>(); learnerLessons(u).forEach(l => (l.vocab || []).forEach(v => { const e = String(v.e || v.word || '').toLowerCase().trim(); if (e && !seen.has(e)) { seen.add(e); words.push({ e, v: String(v.v || v.meaning || '').trim(), def: (v.phrases || [])[0] || '', ipa: v.ipa || '', pos: v.pos || '' }); } })); return { topic: weekInfo(currentWeek()).topic || 'Tuần này', words, others: [] as GameWord[] }; }
let gameBusy = false;
/** Tạo bộ từ từ chủ đề tự do (validate → AI). */
export async function makeGameSet(topicInput: string) {
  const u = me()!; if (gameBusy) return { error: 'Đang tạo bộ từ' };
  const v = validateTopic(topicInput); if (!v.ok) { if (v.kind === 'nonsense' || v.kind === 'banned') topicStrike(u, topicInput.trim(), v.reason!); return { error: v.reason }; }
  if (!ai.hasKey()) return { error: 'Chưa có API key' };
  gameBusy = true; touch();
  try { const r = await ai.gameVocab(v.topic!, u.cefr || 'A2'); const set: GameSet = { id: uid('gs'), userId: u.id, topic: r.topic, input: v.topic, cefr: u.cefr || 'A2', words: r.words, others: r.others, createdAt: new Date().toISOString() }; gameSets().push(set); u.gameSetId = set.id; save(true); notify(`Đã tạo ${set.words.length} từ cho "${set.topic}"`, 'ok'); return { ok: true, set }; }
  catch (e: any) { if (e.rejected && !e.soft) topicStrike(u, v.topic!, e.message); return { error: e.message, rejected: !!e.rejected, soft: !!e.soft }; }
  finally { gameBusy = false; touch(); }
}
export const isGameBusy = () => gameBusy;
export function useWeekGameSet() { const u = me()!; const w = weekGameSet(u); if (w.words.length < 4) return { error: 'Tuần này chưa có đủ từ vựng được duyệt' }; let set = gameSets().find(s => s.userId === u.id && s.week === currentWeek()); if (set) set.words = w.words; else { set = { id: uid('gs'), userId: u.id, topic: 'Tuần ' + currentWeek() + ': ' + w.topic, week: currentWeek(), cefr: u.cefr!, words: w.words, others: [], createdAt: new Date().toISOString() }; gameSets().push(set); } u.gameSetId = set.id; save(true); return { ok: true, set }; }
export function pickGameSet(id: string) { const u = me()!; u.gameSetId = id; save(true); }
export function deleteGameSet(id: string) { const u = me()!; const s = gameSets().find(x => x.id === id && x.userId === u.id); if (!s) return false; S.gameSets = gameSets().filter(x => x !== s); u.gameSetId = null; save(true); return true; }
export function gamesView(u: User) { const sets = myGameSets(u); const cur = currentGameSet(u); return { sets, current: cur, hasAi: ai.hasKey(), busy: gameBusy, games: GAME_LIST.map((g: any) => ({ ...g, best: cur ? bestGame(u, cur.id, g.id) || null : null })), arena: { open: arenaOpen(u), points: arenaOpen(u) ? arenaPoints(u) : null, pendingDuel: duels().some(d => d.toId === u.id && d.status !== 'done' && !(d.scores || {})[u.id]) } }; }
/** Thông tin trước khi chơi (hướng dẫn, kỷ lục, thách đấu). */
export function gameIntro(game: string, set: GameSet, duel?: any) { const u = me()!; const g = GAME_LIST.find((x: any) => x.id === game); if (!set || !g) return null; return { game: g, set, duel: duel || null, opponent: duel ? userById(duel.fromId === u.id ? duel.toId : duel.fromId) : null, best: bestGame(u, set.id, game) || null, alreadyPlayed: !!(duel && duel.scores && duel.scores[u.id]) }; }
/** Ghi kết quả: lưu gameResults, cộng activity, cập nhật duel; trả về dữ liệu Game Over. */
export function finishGame(game: string, set: GameSet, score: number, max: number, note = '', details: [string, string][] = [], duel?: any) {
  const u = me(); if (!u) return null; const best = bestGame(u, set.id, game); const record = score > 0 && (!best || score > best.score);
  gameResults().push({ id: uid('gr'), userId: u.id, setId: set.id, game, score, max, at: new Date().toISOString(), duelId: duel ? duel.id : undefined }); logActivity(u.id, 'game', 5); save(true);
  const duelRes = duel ? recordDuel(duel, u, score, max) : null; const p = max ? Math.round(100 * score / max) : 0; const g = GAME_LIST.find((x: any) => x.id === game);
  const rows: [string, string][] = [['Điểm', `${score} / ${max}`], ...details, ['Kỷ lục trước', best ? `${best.score} / ${best.max}` : '—'], ['Bộ từ', set.topic], ...(duelRes ? [['Thách đấu', ({ win: 'Bạn thắng. +50 điểm đấu trường', lose: 'Bạn thua ván này', draw: 'Hoà', wait: 'Đã ghi kết quả – chờ đối thủ chơi' } as Dict<string>)[duelRes]] as [string, string]] : [])];
  if (record || duelRes === 'win') bus.emit('reward', 'record'); else if (p >= 70) beep(2);
  return { game: g, score, max, pct: p, record, best, note, rows, duelResult: duelRes, headline: record ? 'Kỷ lục mới!' : best && best.score >= score ? `Chưa phá được kỷ lục ${best.score}/${best.max} – thử lại nhé!` : 'Hãy thử lại để lập kỷ lục!' };
}
// ---- arena ----
export const arenaOpen = (u?: User | null) => !!u && u.role === 'learner' && u.cefrApproved && !isLow(u.cefr);
export const arenaPlayers = () => learners().filter(arenaOpen);
export function arenaPoints(u: User) { const byGame: Dict<number> = {}; gameResults().filter(r => r.userId === u.id && r.max).forEach(r => { const p = Math.round(100 * r.score / r.max); if (!byGame[r.game] || p > byGame[r.game]) byGame[r.game] = p; }); const games = GAME_LIST.reduce((s: number, g: any) => s + (byGame[g.id] || 0), 0); const won = duels().filter(d => d.status === 'done' && d.winnerId === u.id).length, lost = duels().filter(d => d.status === 'done' && d.winnerId && d.winnerId !== u.id && (d.fromId === u.id || d.toId === u.id)).length; return { total: games + won * 50, games, won, lost, played: Object.keys(byGame).length }; }
export function arenaView(u: User) { if (!arenaOpen(u)) return { open: false, cefr: u.cefr }; const players = arenaPlayers().map(x => ({ user: x, points: arenaPoints(x) })).sort((a, b) => b.points.total - a.points.total); const mine = duels().filter(d => d.fromId === u.id || d.toId === u.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12).map(d => { const opp = userById(d.fromId === u.id ? d.toId : d.fromId); const my = (d.scores || {})[u.id], his = opp && (d.scores || {})[opp.id]; return { duel: d, game: GAME_LIST.find((x: any) => x.id === d.game), opponent: opp, mine: my || null, theirs: his || null, state: d.status === 'done' ? (d.winnerId === u.id ? 'win' : d.winnerId ? 'lose' : 'draw') : my ? 'wait' : 'yourTurn', canPlay: !my && d.status !== 'done', challenged: d.toId === u.id }; }); return { open: true, players, duels: mine, current: currentGameSet(u), others: arenaPlayers().filter(x => x.id !== u.id), games: GAME_LIST.filter((g: any) => g.id !== 'crossword'), maxPoints: GAME_LIST.length * 100 }; }
export function newDuel(toId: string, game: string) { const u = me()!; const to = userById(toId); const cur = currentGameSet(u); if (!to || !cur || !GAME_LIST.some((g: any) => g.id === game)) return { error: 'Thiếu đối thủ, bộ từ hoặc trò chơi' }; if (duels().some(d => d.status !== 'done' && d.game === game && ((d.fromId === u.id && d.toId === to.id) || (d.fromId === to.id && d.toId === u.id)))) return { error: 'Hai bạn đã có một trận trò này đang chờ' }; const d = { id: uid('du'), fromId: u.id, toId: to.id, game, set: { id: uid('gs'), topic: cur.topic, cefr: cur.cefr, words: cur.words, others: cur.others || [] }, scores: {}, status: 'open', at: new Date().toISOString() }; duels().push(d); save(true); notify(`Đã gửi lời thách đấu cho ${to.name}. Chơi ván của bạn ngay nhé!`, 'ok'); return { ok: true, duel: d }; }
export function duelById(id: string) { const u = me()!; const d = duels().find(x => x.id === id); if (!d || (d.fromId !== u.id && d.toId !== u.id) || !arenaOpen(u)) return null; return { duel: d, played: !!(d.scores || {})[u.id] }; }
export function recordDuel(d: any, u: User, score: number, max: number) { d.scores = d.scores || {}; d.scores[u.id] = { score, max, at: new Date().toISOString() }; const ids = [d.fromId, d.toId]; if (ids.every(i => d.scores[i])) { const p = (i: string) => d.scores[i].score / (d.scores[i].max || 1); d.status = 'done'; d.winnerId = p(d.fromId) > p(d.toId) ? d.fromId : p(d.toId) > p(d.fromId) ? d.toId : null; d.doneAt = new Date().toISOString(); } save(true); return d.status === 'done' ? (d.winnerId === u.id ? 'win' : d.winnerId ? 'lose' : 'draw') : 'wait'; }

// ---- pure game engines (UI vẽ; engine giữ luật & điểm) ----
/** 1. Word scramble: xếp chữ cái. */
export function scrambleEngine(set: GameSet, u: User) {
  const words = gshuffle(set.words.filter(w => gletters(w.e).length >= 3)).slice(0, 8); let i = 0, score = 0, over = false, tiles: any[] = [], picked: any[] = [], wrong = 0, hints = 0, best = 0, streak = 0, totalWrong = 0, totalHints = 0, finished = false;
  const setup = () => { const L = gletters(words[i].e).split(''); let sh = gshuffle(L); if (L.length > 2 && sh.join('') === L.join('')) sh = [...L.slice(1), L[0]]; tiles = sh.map((ch, k) => ({ ch, k, used: false })); picked = []; wrong = 0; hints = 0; };
  const state = (msg = '') => ({ word: words[i] || null, hint: words[i] ? gameHint(words[i], u) : null, index: i, total: words.length, score, wrong, slots: words[i] ? gletters(words[i].e).split('').map((_, k) => picked[k]?.ch || '') : [], tiles: tiles.map(t => ({ ...t })), over, finished, msg, speak: null as string | null });
  const result = () => finished ? finishGame('scramble', set, score, words.length * 2, '', [['Từ xếp đúng', `${score ? words.filter((_, k) => k < i).length : 0} / ${words.length}`], ['Lần xếp sai', `${totalWrong}`], ['Gợi ý đã dùng', `${totalHints}`], ['Chuỗi đúng dài nhất', `${best}`]]) : null;
  const next = () => { i++; over = false; if (i >= words.length) { finished = true; return; } setup(); };
  const check = () => { const w = words[i]; const L = gletters(w.e); if (picked.length < L.length) return state(); const got = picked.map(p => p.ch).join(''); if (got === L) { const pts = (wrong || hints) ? 1 : 2; score += pts; streak++; best = Math.max(best, streak); over = true; const st = state(`✅ ${w.e} +${pts}`); st.speak = w.e; return { ...st, advance: 1200 }; } wrong++; totalWrong++; streak = 0; if (wrong >= 2) { over = true; picked = L.split('').map(ch => ({ ch })); const st = state(`❌ Từ đúng: ${w.e}`); st.speak = w.e; return { ...st, advance: 1800 }; } picked.forEach(p => { if (p.t) p.t.used = false; }); picked = []; return { ...state('Chưa đúng – xếp lại nhé'), shake: true }; };
  if (!words.length) return null; setup();
  return { words, state, result, pick: (k: number) => { if (over) return state(); const t = tiles.find(t => t.k === k); if (!t || t.used) return state(); t.used = true; picked.push({ ch: t.ch, t }); return check(); }, typeLetter: (ch: string) => { const t = tiles.find(t => !t.used && t.ch === ch.toUpperCase()); return t ? (function () { t.used = true; picked.push({ ch: t.ch, t }); return check(); })() : state(); }, backspace: () => { if (over || !picked.length) return state(); const p = picked.pop(); if (p.t) p.t.used = false; return state(); }, hint: () => { if (over) return state(); const L = gletters(words[i].e); const want = L[picked.length]; const t = tiles.find(t => !t.used && t.ch === want); if (!t) return state(); hints++; totalHints++; t.used = true; picked.push({ ch: t.ch, t }); return check(); }, advance: () => { next(); return state(); } };
}
/** 2. Crossword grid builder (pure). */
export function buildCrossword(entries: { w: string; word: GameWord }[]) {
  const N = 17; const grid: (string | null)[][] = Array.from({ length: N }, () => Array(N).fill(null)); const placed: any[] = [];
  const canPlace = (w: string, r: number, c: number, dir: string) => { const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0; if (r < 0 || c < 0 || r + dr * (w.length - 1) >= N || c + dc * (w.length - 1) >= N) return -1;
    const br = r - dr, bc = c - dc, ar = r + dr * w.length, ac = c + dc * w.length; if ((br >= 0 && bc >= 0 && grid[br][bc]) || (ar < N && ac < N && grid[ar][ac])) return -1;
    let cross = 0; for (let k = 0; k < w.length; k++) { const rr = r + dr * k, cc = c + dc * k; const g = grid[rr][cc]; if (g) { if (g !== w[k]) return -1; cross++; } else { const s1 = dir === 'across' ? [rr - 1, cc] : [rr, cc - 1], s2 = dir === 'across' ? [rr + 1, cc] : [rr, cc + 1]; if ((s1[0] >= 0 && s1[1] >= 0 && grid[s1[0]][s1[1]]) || (s2[0] < N && s2[1] < N && grid[s2[0]][s2[1]])) return -1; } }
    return cross; };
  const put = (e: any, r: number, c: number, dir: string) => { const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0; for (let k = 0; k < e.w.length; k++) grid[r + dr * k][c + dc * k] = e.w[k]; placed.push({ ...e, r, c, dir }); };
  const list = entries.filter(e => e.w.length >= 3).sort((a, b) => b.w.length - a.w.length).slice(0, 10);
  list.forEach((e, idx) => { if (!idx) { put(e, Math.floor(N / 2), Math.floor((N - e.w.length) / 2), 'across'); return; } let best: any = null; placed.forEach(p => { const pdr = p.dir === 'down' ? 1 : 0, pdc = p.dir === 'across' ? 1 : 0; for (let k = 0; k < p.w.length; k++) for (let m = 0; m < e.w.length; m++) { if (p.w[k] !== e.w[m]) continue; const dir = p.dir === 'across' ? 'down' : 'across'; const r = p.r + pdr * k - (dir === 'down' ? m : 0), c = p.c + pdc * k - (dir === 'across' ? m : 0); const cr = canPlace(e.w, r, c, dir); if (cr > 0 && (!best || cr > best.cr)) best = { r, c, dir, cr }; } }); if (best) put(e, best.r, best.c, best.dir); });
  let r0 = N, r1 = -1, c0 = N, c1 = -1; placed.forEach(p => { const dr = p.dir === 'down' ? 1 : 0, dc = p.dir === 'across' ? 1 : 0; r0 = Math.min(r0, p.r); c0 = Math.min(c0, p.c); r1 = Math.max(r1, p.r + dr * (p.w.length - 1)); c1 = Math.max(c1, p.c + dc * (p.w.length - 1)); });
  const cells = grid.slice(r0, r1 + 1).map(row => row.slice(c0, c1 + 1)); placed.forEach(p => { p.r -= r0; p.c -= c0; });
  let n = 0; const nums: Dict<number> = {}; cells.forEach((row, r) => row.forEach((ch, c) => { if (ch && placed.some(p => p.r === r && p.c === c)) { nums[r + ',' + c] = ++n; } })); placed.forEach(p => { p.n = nums[p.r + ',' + p.c]; });
  return { cells, placed, nums };
}
export function crosswordEngine(set: GameSet, u: User) {
  const cw = buildCrossword(set.words.map(w => ({ w: gletters(w.e), word: w })).filter(e => e.w.length >= 3)); if (cw.placed.length < 3) return null;
  let hints = 0, done = false, checks = 0; const values: Dict<string> = {};
  const clues = (dir: string) => cw.placed.filter(p => p.dir === dir).sort((a, b) => a.n - b.n).map(p => ({ n: p.n, hint: gameHint(p.word, u), len: p.w.length }));
  return { grid: cw, across: clues('across'), down: clues('down'), get hints() { return hints; }, get done() { return done; }, values, set: (r: number, c: number, ch: string) => { values[r + ',' + c] = ch.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(-1); },
    check: () => { if (done) return null; let ok = 0, total = 0; const marks: Dict<'ok' | 'bad' | ''> = {}; cw.cells.forEach((row, r) => row.forEach((want, c) => { if (!want) return; total++; const v = values[r + ',' + c] || ''; const good = v === want; marks[r + ',' + c] = good ? 'ok' : v ? 'bad' : ''; if (good) ok++; })); const wordsOk = cw.placed.filter(p => { const dr = p.dir === 'down' ? 1 : 0, dc = p.dir === 'across' ? 1 : 0; return p.w.split('').every((ch: string, k: number) => values[(p.r + dr * k) + ',' + (p.c + dc * k)] === ch); }).length; checks++; if (ok === total) { done = true; return { complete: true, marks, result: finishGame('crossword', set, Math.max(0, cw.placed.length - hints), cw.placed.length, '', [['Từ trong lưới', `${cw.placed.length}`], ['Crosswords', `${total}`], ['Gợi ý đã dùng', `${hints}`], ['Lần kiểm tra', `${checks}`]]) }; } return { complete: false, marks, wordsOk, ok, total, words: cw.placed.length }; },
    hint: () => { if (done) return null; const empty: [number, number][] = []; cw.cells.forEach((row, r) => row.forEach((want, c) => { if (want && values[r + ',' + c] !== want) empty.push([r, c]); })); if (!empty.length) return null; const [r, c] = empty[Math.floor(Math.random() * empty.length)]; values[r + ',' + c] = cw.cells[r][c]!; hints++; return { r, c, ch: cw.cells[r][c] }; } };
}
/** 3. Season catch – thiết kế màn (UI tự vẽ canvas và va chạm theo luật này). */
export function catchLevel(set: GameSet) { const words = gshuffle(set.words).slice(0, 10); return { words, rounds: words.length, lives: 3, item: seasonCatch(), hero: heroKind(), round: (i: number, width: number) => { const w = words[i]; const others = gshuffle(set.words.filter(x => x !== w)).slice(0, 3); const all = gshuffle([w, ...others]); const lane = (width - 40) / all.length; return all.map((x, k) => ({ w: x, x: 20 + lane * k + lane / 2, y: 60 - Math.random() * 160, vy: 0.5 + Math.random() * 0.4 + i * 0.05, gone: false })); }, finish: (score: number, lives: number, wrongCatch: number, dropped: number) => finishGame('eggs', set, score, words.length, lives > 0 ? 'hết lượt' : 'hết mạng', [[`${seasonCatch().label} hứng đúng`, `${score} / ${words.length}`], ['Hứng nhầm', `${wrongCatch}`], [`${seasonCatch().label} rơi xuống đất`, `${dropped}`], ['Mạng còn lại', '❤️'.repeat(lives) || '0']]) }; }
/** 4. Season-rio – thiết kế màn: hộp quà là cổng chắn, 3 kiểu bục, Boss 3 HP trước cờ. */
export function marioLevel(set: GameSet, H = 320) {
  const G = H - 40; const TIERS = [{ h: 0, p: [] as number[][] }, { h: 60, p: [[-10, 60, 150]] }, { h: 110, p: [[-150, 55, 90], [-10, 110, 150]] }]; const order = [0, 1, 0, 2, 1, 0, 2, 1];
  const qs = gshuffle(set.words).slice(0, 8); const blocks: any[] = [], plats: any[] = []; qs.forEach((w, i) => { const t = TIERS[order[i % order.length]]; const bx = 360 + i * 330; blocks.push({ x: bx, y: G - t.h - 36 - 44, w, state: 'q', base: G - t.h }); t.p.forEach(([dx, h, pw]) => plats.push({ x: bx + dx, y: G - h, w: pw, h })); });
  const bossX = 360 + qs.length * 330 + 60; const boss = { hp: 3, max: 3, busy: false, hitFlash: 0 }; const flagX = bossX + 220; const worldW = flagX + 200;
  let bossPool = gshuffle(set.words);
  return { G, H, qs, blocks, plats, boss, bossX, flagX, worldW, hero: heroKind(), gates: () => blocks.filter(b => b.state === 'q').map(b => ({ x: b.x + 10, y: b.y + 36, w: 16, h: b.base - (b.y + 36), b })), unopened: () => blocks.filter(b => b.state === 'q').length, options: (w: GameWord) => gshuffle([w, ...gshuffle(set.words.filter(x => x !== w)).slice(0, 3)]), bossWord: () => { const w = bossPool.shift() || gshuffle(set.words)[0]; if (!bossPool.length) bossPool = gshuffle(set.words); return w; }, answerBlock: (b: any, ok: boolean) => { b.state = ok ? 'm' : 'x'; }, hitBoss: () => { boss.hp--; boss.hitFlash = 12; }, finish: (win: boolean, score: number, lives: number, wrongAns: number, seconds: number) => finishGame('mario', set, score, qs.length + boss.max, win ? 'về đích' : 'hết mạng', [['Hộp quà đúng 🍄', `${blocks.filter(b => b.state === 'm').length} / ${qs.length}`], ['Đòn trúng Boss', `${boss.max - boss.hp} / ${boss.max}`], ['Trả lời sai', `${wrongAns}`], ['Mạng còn lại', '❤️'.repeat(Math.max(0, lives)) || '0'], ['Về đích', win ? 'Có 🏁' : 'Chưa'], ['Thời gian', `${seconds} giây`]]) };
}
/** 5. Word sort – xếp từ loại. */
export function sortEngine(set: GameSet, u: User) {
  const words = gshuffle(set.words.filter(w => posGroup(w.pos))).slice(0, 12); const groups = POS_GROUPS.filter(([k]) => words.some(w => posGroup(w.pos) === k) || ['noun', 'verb', 'adjective'].includes(k)); let i = 0, score = 0, streak = 0, best = 0, lock = false, finished = false;
  if (words.length < 4) return null;
  const state = () => ({ word: words[i] || null, index: i, total: words.length, score, streak, groups: groups.map(([k, lbl]) => ({ key: k, label: lbl, vi: POS_VI[k] || '' })), finished, vi: isLow(u.cefr) });
  return { state, pick: (g: string) => { if (lock || finished) return null; const w = words[i]; const right = posGroup(w.pos); const ok = g === right; lock = true; if (ok) { score++; streak++; best = Math.max(best, streak); beep(); } else streak = 0; return { ok, right, rightVi: POS_VI[right] || right, delay: ok ? 700 : 1500 }; }, advance: () => { lock = false; i++; if (i >= words.length) { finished = true; return { finished: true, result: finishGame('sort', set, score, words.length, '', [['Phân loại đúng', `${score} / ${words.length}`], ['Chuỗi đúng dài nhất', `${best}`], ['Nhóm từ loại', groups.map(g => g[1]).join(', ')]]) }; } return { finished: false, state: state() }; } };
}
/** 6. Typing race – combo + đồng hồ theo độ dài từ. */
export function typingEngine(set: GameSet) {
  const words = gshuffle(set.words.filter(w => /^[a-z][a-z\s'-]*$/i.test(w.e))).slice(0, 10); const total = words.length; let i = 0, score = 0, combo = 1, best = 1, typed = '', locked = false, finished = false, okWords = 0, timeouts = 0, wrongs = 0;
  const timeFor = (w: GameWord) => Math.max(4000, 900 * w.e.replace(/\s/g, '').length);
  if (!total) return null;
  const state = () => ({ word: words[i] || null, index: i, total, score, combo, typed, cells: words[i] ? words[i].e.toLowerCase().split('').map((ch, k) => ({ ch, t: typed[k], cls: typed[k] === undefined ? '' : typed[k] === ch ? 'ok' : 'bad' })) : [], maxMs: words[i] ? timeFor(words[i]) : 0, finished, locked, KB: ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'] });
  const next = () => { i++; typed = ''; if (i >= total) { finished = true; return { finished: true, result: finishGame('typing', set, score, total * 50, '', [['Từ gõ đúng', `${okWords} / ${total}`], ['Hết giờ', `${timeouts}`], ['Gõ sai', `${wrongs}`], ['Combo cao nhất', `×${best}`]]) }; } return { finished: false, state: state() }; };
  const check = () => { if (finished || locked) return null; const w = words[i]; if (typed.toLowerCase() === w.e.toLowerCase()) { score += 10 * combo; okWords++; best = Math.max(best, combo); combo = Math.min(5, combo + 1); locked = true; beep(); return { ok: true, speak: w.e, delay: 500 }; } combo = 1; wrongs++; typed = ''; return { ok: false, shake: true }; };
  return { state, timeFor, key: (k: string) => { if (finished || locked) return null; if (k === 'enter') return check(); if (k === 'bs') typed = typed.slice(0, -1); else if (typed.length < words[i].e.length) typed += k; if (typed.length === words[i].e.length && k !== 'bs') return check(); return { ok: null }; }, timeout: () => { if (finished || locked) return null; locked = true; combo = 1; timeouts++; const w = words[i]; notify(`⏰ Hết giờ: ${w.e} = ${w.v}`, 'err'); return { word: w, delay: 1200 }; }, advance: () => { locked = false; return next(); } };
}
export const heroKind = () => (SEASON_HERO as Dict<string>)[themeOf(S)] || 'rabbit';
export const heroArt = (pose: string) => `hero_${heroKind()}_${pose}`;
export const seasonCatch = () => (SEASON_CATCH as Dict<any>)[themeOf(S)] || (SEASON_CATCH as Dict<any>).summer;
export const artSrc = (name: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent((GAME_ART as Dict<string>)[name]);


// =====================================================================================
// PLATFORM SERVICES – TTS/STT, ghi âm, IndexedDB audio, nhạc nền / hiệu ứng, ảnh từ vựng
// =====================================================================================
const ttsClean = (s: any) => String(s || '')
  .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, ' ')
  .replace(/[←-⇿⌀-⏿■-➿⤀-⯿〰〽㊗㊙•·▢]/g, ' ')
  .replace(/(^|\s)[:;][-^']?[)(\]\[DPpOo3|\/\\*]+(?=\s|$)/g, ' ').replace(/(^|\s)<3(?=\s|$)/g, ' ')
  .replace(/[*_#`~]+/g, ' ').replace(/\s+([.,!?;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
export const speech = {
  hasVoice: (lang: string) => typeof window !== 'undefined' && 'speechSynthesis' in window && speechSynthesis.getVoices().some(v => v.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())),
  speak(text: string, onEnd?: () => void, lang = 'en-US') {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) { notify('Trình duyệt không hỗ trợ đọc văn bản', 'err'); return false; }
    speechSynthesis.cancel(); text = ttsClean(text); if (!text) { onEnd && onEnd(); return true; }
    const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = 0.92;
    const voices = speechSynthesis.getVoices(); const v = lang.startsWith('en') ? voices.find(v => /^en[-_](US|GB)/.test(v.lang)) : voices.find(v => v.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())); if (v) u.voice = v;
    if (onEnd) { u.onend = onEnd; u.onerror = onEnd as any; }
    speechSynthesis.speak(u); return true;
  },
  speakLines: (lines: string[]) => speech.speak(lines.map(speakable).join('. ')),
  rec: null as any,
  canListen: () => typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
  listen(onText: (t: string) => void, onEnd?: () => void) {
    const R = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; if (!R) return false;
    if (speech.rec) { try { speech.rec.stop(); } catch { } }
    const r = new R(); r.lang = 'en-US'; r.interimResults = false; r.continuous = true; r.maxAlternatives = 1;
    r.onresult = (e: any) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript); };
    r.onerror = (e: any) => { if (e.error !== 'no-speech') notify('Lỗi nhận dạng giọng nói: ' + e.error, 'err'); };
    r.onend = () => { speech.rec = null; onEnd && onEnd(); };
    r.start(); speech.rec = r; return true;
  },
  stop() { if (speech.rec) { try { speech.rec.stop(); } catch { } speech.rec = null; } if (typeof window !== 'undefined' && 'speechSynthesis' in window) speechSynthesis.cancel(); },
  /** Phát mẫu âm IPA: file Wikimedia hoặc đọc bằng giọng máy. */
  playSound(sound: string) { const src = soundSource(sound); if (!src) { notify(`Chưa có mẫu âm riêng cho /${sound}/ – hãy nghe qua 3 từ luyện bên dưới`, ''); return; } if (src.kind === 'spoken') { speech.speak(src.text); return; } speech.stop(); const a = new Audio(src.url); a.onerror = () => notify('Không tải được mẫu âm (cần có mạng) – hãy nghe qua 3 từ luyện bên dưới', 'err'); a.play().catch(() => { }); }
};
if (typeof window !== 'undefined' && 'speechSynthesis' in window) speechSynthesis.getVoices();

/** File ghi âm lưu trong IndexedDB của trình duyệt (quá lớn cho localStorage). */
export const audioStore = {
  db: null as Promise<IDBDatabase> | null,
  open() { return this.db || (this.db = new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('aec-audio', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async put(id: string, blob: Blob) { const db = await this.open(); return new Promise<void>((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(blob, id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); },
  async get(id: string) { const db = await this.open(); return new Promise<Blob | null>((res, rej) => { const rq = db.transaction('files').objectStore('files').get(id); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error); }); },
  async play(id: string) { const b = await audioStore.get(id).catch(() => null); if (!b) { notify('File ghi âm không có trên trình duyệt này (file nằm trên máy của người nộp).', 'err'); return false; } const a = new Audio(URL.createObjectURL(b)); a.play().catch(() => notify('Trình duyệt không phát được định dạng file này', 'err')); return true; }
};
/** Ghi âm ngay trong trang → File. `onState` báo 'recording' | 'stopped'. */
export const recorder = {
  mr: null as MediaRecorder | null,
  can: () => typeof navigator !== 'undefined' && !!(navigator.mediaDevices && (window as any).MediaRecorder),
  stop() { if (this.mr) this.mr.stop(); },
  async toggle(onFile: (f: File) => void, onState?: (s: 'recording' | 'stopped') => void, grace?: () => void) {
    if (this.mr) { this.mr.stop(); return; }
    grace?.();
    let stream: MediaStream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { notify('Không dùng được micro – hãy tải file ghi âm lên', 'err'); return; }
    const chunks: Blob[] = []; const mr = new MediaRecorder(stream); this.mr = mr;
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => { stream.getTracks().forEach(x => x.stop()); this.mr = null; onState?.('stopped'); const type = (mr.mimeType || 'audio/webm').split(';')[0]; onFile(new File(chunks, 'ghi-am-' + Date.now() + (/mp4|aac/.test(type) ? '.m4a' : /ogg/.test(type) ? '.ogg' : '.webm'), { type })); };
    mr.start(); onState?.('recording');
  },
  /** Thử micro 3 giây: trả về {ok, peak, blobUrl|null, error|null}. */
  async micCheck(seconds = 3) {
    let stream: MediaStream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return { ok: false, peak: 0, blobUrl: null, error: 'Không truy cập được micro – hãy cho phép micro trong trình duyệt' }; }
    const chunks: Blob[] = []; const mr = new MediaRecorder(stream); let peak = 0, raf = 0;
    try { const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)(); const an = ctx.createAnalyser(); ctx.createMediaStreamSource(stream).connect(an); const buf = new Uint8Array(an.fftSize); const loop = () => { an.getByteTimeDomainData(buf); buf.forEach(v => { peak = Math.max(peak, Math.abs(v - 128)); }); raf = requestAnimationFrame(loop); }; loop(); mr.addEventListener('stop', () => { cancelAnimationFrame(raf); ctx.close(); }); } catch { }
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    return new Promise<{ ok: boolean; peak: number; blobUrl: string | null; error: string | null }>(res => { mr.onstop = () => { stream.getTracks().forEach(x => x.stop()); if (peak < 4) res({ ok: false, peak, blobUrl: null, error: 'Micro không thu được tiếng – kiểm tra micro rồi thử lại' }); else res({ ok: true, peak, blobUrl: URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })), error: null }); }; mr.start(); setTimeout(() => { if (mr.state !== 'inactive') mr.stop(); }, seconds * 1000); });
  }
};
/** Kiểm tra + lưu file âm thanh; chép lời nếu AI hỗ trợ. */
export async function takeAudio(file: File, id: string) {
  if (!file) return null;
  if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|wav|ogg|oga|webm|aac|flac|amr|3gp)$/i.test(file.name)) { notify('Hãy chọn file âm thanh (mp3, m4a, wav, webm…)', 'err'); return null; }
  if (file.size > 20 * 1048576) { notify('File quá lớn (tối đa 20 MB)', 'err'); return null; }
  try { await audioStore.put(id, file); } catch (e) { console.warn('audio not stored', e); }
  const meta: any = { id, name: file.name, size: file.size, at: new Date().toISOString() };
  let transcript: string | null = null, error: string | null = null;
  if (ai.canTranscribe()) { try { transcript = await ai.transcribe(file); meta.transcribed = true; } catch (e: any) { error = e.message + ' Hãy gõ lại nội dung bạn đã nói.'; notify(error, 'err'); } }
  return { meta, transcript, error, label: `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB` };
}

/** Âm thanh: SFX (beep/alarm) + BGM (YouTube ẩn → fallback tiếng ồn nâu) với 3 công tắc độc lập, lưu theo máy. */
export const audio = {
  KEY: 'aec:audio', st: { sfx: true, bgm: true, mute: false }, ctx: null as AudioContext | null, bgmNodes: null as any, armed: false,
  YT_VIDEO: 'DSWYAclv2I8', YT_LIST: 'PLQwRmTwWx0uaoRXVcKbUDW0wm8G_WJzDI', YT_VOLUME: 22,
  yt: { player: null as any, ready: false, failed: false, loading: false },
  load() { try { Object.assign(audio.st, JSON.parse(localStorage.getItem(audio.KEY) || '{}')); } catch { } },
  save() { try { localStorage.setItem(audio.KEY, JSON.stringify(audio.st)); } catch { } },
  context() { if (!audio.ctx) { const C = (window as any).AudioContext || (window as any).webkitAudioContext; if (!C) return null; audio.ctx = new C(); } if (audio.ctx!.state === 'suspended') audio.ctx!.resume().catch(() => { }); return audio.ctx; },
  sfxOn: () => audio.st.sfx && !audio.st.mute,
  bgmOn: () => audio.st.bgm && !audio.st.mute,
  loadYt() {
    const y = audio.yt; if (y.player || y.loading || y.failed || typeof document === 'undefined') return; if (!/^https?:/.test(location.protocol)) { y.failed = true; return; }
    y.loading = true;
    const host = document.createElement('div'); host.id = 'bgm-yt'; host.setAttribute('aria-hidden', 'true'); host.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:0;opacity:0;pointer-events:none'; document.body.appendChild(host);
    const YT = () => (window as any).YT;
    const make = () => { try { y.player = new (YT().Player)('bgm-yt', { width: 1, height: 1, videoId: audio.YT_VIDEO, playerVars: { autoplay: 1, mute: 1, controls: 0, playsinline: 1, loop: 1, listType: 'playlist', list: audio.YT_LIST, rel: 0 }, events: {
      onReady: () => { y.ready = true; y.loading = false; if (audio.armed && audio.bgmOn()) audio.startBgm(); },
      onError: () => { y.failed = true; y.loading = false; try { y.player.destroy(); } catch { } y.player = null; host.remove(); if (audio.armed && audio.bgmOn()) audio.startBgm(); },
      onStateChange: (e: any) => { if (e.data === YT().PlayerState.ENDED && audio.bgmOn()) { try { y.player.playVideo(); } catch { } } }
    } }); } catch { y.failed = true; y.loading = false; } };
    if (YT() && YT().Player) { make(); return; }
    const prev = (window as any).onYouTubeIframeAPIReady; (window as any).onYouTubeIframeAPIReady = () => { prev && prev(); make(); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => { y.failed = true; y.loading = false; if (audio.armed && audio.bgmOn()) audio.startBgm(); }; document.head.appendChild(s);
    setTimeout(() => { if (!y.ready && !y.failed) { y.failed = true; y.loading = false; if (audio.armed && audio.bgmOn()) audio.startBgm(); } }, 12000);
  },
  startBgm() { if (!audio.bgmOn()) return; const y = audio.yt; if (!y.failed) { if (!y.player) { audio.loadYt(); return; } if (!y.ready) return; try { y.player.setVolume(audio.YT_VOLUME); y.player.unMute(); y.player.playVideo(); } catch { } if (audio.bgmNodes) audio.stopAmbience(); return; } audio.startAmbience(); },
  stopBgm() { const y = audio.yt; if (y.player && y.ready) { try { y.player.pauseVideo(); } catch { } } audio.stopAmbience(); },
  startAmbience() {
    if (!audio.bgmOn() || audio.bgmNodes) return; const ctx = audio.context(); if (!ctx) return;
    try {
      const len = ctx.sampleRate * 4; const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0); let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 0.4;
      const swell = ctx.createGain(); swell.gain.value = 0.5; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lfoG = ctx.createGain(); lfoG.gain.value = 0.25; lfo.connect(lfoG); lfoG.connect(swell.gain);
      const master = ctx.createGain(); master.gain.value = 0; master.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 3);
      src.connect(lp); lp.connect(swell); swell.connect(master); master.connect(ctx.destination);
      const tones = [196, 293.66].map((f, i) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.012 - i * 0.004; o.connect(g); g.connect(master); o.start(); return o; });
      src.start(); lfo.start(); audio.bgmNodes = { src, lfo, master, tones };
    } catch { }
  },
  stopAmbience() { const n = audio.bgmNodes; if (!n) return; audio.bgmNodes = null; try { const ctx = audio.ctx!; n.master.gain.cancelScheduledValues(ctx.currentTime); n.master.gain.setValueAtTime(n.master.gain.value, ctx.currentTime); n.master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8); setTimeout(() => { try { n.src.stop(); n.lfo.stop(); n.tones.forEach((o: any) => o.stop()); } catch { } }, 900); } catch { } },
  sync() { if (audio.bgmOn()) { if (audio.armed) audio.startBgm(); } else audio.stopBgm(); audio.save(); bus.emit('audio'); },
  label: (k: 'sfx' | 'bgm' | 'mute') => k === 'sfx' ? `Hiệu ứng âm thanh: ${audio.st.sfx && !audio.st.mute ? 'bật' : 'tắt'}` : k === 'bgm' ? `Nhạc nền: ${audio.st.bgm && !audio.st.mute ? 'bật' : 'tắt'}` : audio.st.mute ? 'Đang tắt tất cả âm thanh – bấm để bật lại' : 'Tắt tất cả âm thanh',
  /** Bật lần đầu sau cử chỉ người dùng (autoplay policy). UI gọi ở pointerdown/keydown capture. */
  arm() { if (audio.armed) return; audio.armed = true; if (audio.bgmOn()) audio.startBgm(); },
  toggle(k: 'sfx' | 'bgm' | 'mute') { if (k === 'mute') audio.st.mute = !audio.st.mute; else { audio.st[k] = !audio.st[k]; if (audio.st[k]) audio.st.mute = false; } audio.sync(); if (k === 'sfx' && audio.sfxOn()) beep(); },
  state: () => ({ sfx: audio.sfxOn(), bgm: audio.bgmOn(), mute: audio.st.mute, labels: { sfx: audio.label('sfx'), bgm: audio.label('bgm'), mute: audio.label('mute') } }),
  /** Gọi một lần khi mount UI: nạp prefs, preload player, dừng khi ẩn tab. */
  init() { audio.load(); if (typeof document === 'undefined') return; ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => audio.arm(), { capture: true, passive: true })); if (audio.st.bgm && !audio.st.mute) setTimeout(() => audio.loadYt(), 1500); document.addEventListener('visibilitychange', () => { if (document.hidden) audio.stopBgm(); else if (audio.armed && audio.bgmOn()) audio.startBgm(); }); }
};
export function beep(n = 1) { if (!audio.sfxOn()) return; try { const ctx = audio.context(); if (!ctx) return; for (let i = 0; i < n; i++) { const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.08; const t = ctx.currentTime + i * 0.25; o.start(t); o.stop(t + 0.15); } } catch { } }
/** Chuông cảnh báo rời màn thi (luôn kêu, không phụ thuộc công tắc SFX như bản gốc). */
export function alarm() { try { const ctx = (alarm as any).ctx || ((alarm as any).ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)()); [880, 660, 880].forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.connect(g); g.connect(ctx.destination); o.frequency.value = f; g.gain.value = 0.2; const t = ctx.currentTime + i * 0.3; o.start(t); o.stop(t + 0.25); }); } catch { } }
export function buzz() { try { if ((navigator as any).userActivation && !(navigator as any).userActivation.hasBeenActive) return; navigator.vibrate?.([100, 50, 100]); } catch { } }

// ---- vocabulary images (free sources, cached in localStorage) ----
async function stockImage(word: string) {
  const src = S.settings.imgSource || 'wikimedia'; const q = encodeURIComponent(word.trim());
  try {
    if (src === 'pexels' && S.settings.pexelsKey) { const r = await fetch(`https://api.pexels.com/v1/search?query=${q}&per_page=3&orientation=square&size=small`, { headers: { Authorization: S.settings.pexelsKey } }); if (r.ok) { const j = await r.json(); const p = (j.photos || [])[0]; return p ? (p.src.tiny || p.src.small) : ''; } }
    if (src === 'pixabay' && S.settings.pixabayKey) { const r = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(S.settings.pixabayKey)}&q=${q}&image_type=photo&safesearch=true&per_page=3`); if (r.ok) { const j = await r.json(); const h = (j.hits || [])[0]; return h ? h.previewURL : ''; } }
    if (src === 'openverse') { const r = await fetch(`https://api.openverse.org/v1/images/?q=${q}&page_size=3&mature=false&license_type=all-cc`, { headers: { accept: 'application/json' } }); if (r.ok) { const j = await r.json(); const it = (j.results || []).find((x: any) => x.thumbnail || x.url); return it ? (it.thumbnail || it.url) : ''; } }
  } catch { }
  return null;
}
export async function vocabImage(word: string): Promise<string> {
  const src = S.settings.imgSource || 'wikimedia'; if (src === 'none') return '';
  const key = IMG_CACHE_KEY + src + ':' + word.toLowerCase(); try { const c = localStorage.getItem(key); if (c !== null) return c; } catch { }
  let url = '';
  if (src !== 'wikimedia') { const s = await stockImage(word); if (s) { try { localStorage.setItem(key, s); } catch { } return s; } if (s === '') { try { localStorage.setItem(key, ''); } catch { } return ''; } }
  const q = word.trim().replace(/\s+/g, '_');
  try { const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}?redirect=true`, { headers: { accept: 'application/json' } }); if (r.ok) { const j = await r.json(); if (j.thumbnail?.source && j.type !== 'disambiguation') url = j.thumbnail.source; } } catch { }
  if (!url) { const isBitmap = /^image\/(jpeg|png|webp)/; try { const u2 = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=' + encodeURIComponent(word + ' filetype:bitmap') + '&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=160&format=json&origin=*'; const r = await fetch(u2); if (r.ok) { const j = await r.json(); const pages = Object.values((j.query && j.query.pages) || {}) as any[]; const p = pages.map(x => (x.imageinfo || [])[0]).find(i => i && isBitmap.test(i.mime || '')); if (p) url = p.thumburl || p.url; } } catch { } }
  try { localStorage.setItem(key, url); } catch { }
  return url;
}
export function clearImageCache() { let n = 0; Object.keys(localStorage).filter(k => k.startsWith(IMG_CACHE_KEY)).forEach(k => { localStorage.removeItem(k); n++; }); return n; }


// =====================================================================================
// AUTH / ACCOUNTS (các action màn chọn vai trò, đăng nhập, đăng ký, quản lý tài khoản)
// =====================================================================================
let entryRole: Role | null = null; // vai trò chọn ở màn vào (không lưu)
let testEngine: TestEngine;
/** Nơi duy nhất đổi người dùng đăng nhập: mọi thứ trong bộ nhớ của người trước bị bỏ. */
function setSessionUser(id: string | null) { S.session.userId = id; testEngine.reset(); speech.stop(); recorder.stop(); Object.keys(weekSug).forEach(k => delete weekSug[k]); bus.emit('session'); }
export function entryView() { if (me()) return { phase: 'in' as const, user: me()!, home: me()!.role === 'learner' ? '/home' : me()!.role === 'operator' ? '/op' : '/mgr' }; if (S.users.length === 0) return { phase: 'empty' as const }; if (!entryRole) return { phase: 'role' as const }; if (entryRole === 'learner') return { phase: 'learner-login' as const }; const protectedRole = entryRole === 'operator' ? !!S.settings.pinOperator : !!S.settings.pinManager; return { phase: 'staff-pick' as const, role: entryRole, list: S.users.filter(x => x.role === entryRole), protected: protectedRole, canForgotPin: entryRole === 'operator' && protectedRole }; }
export function chooseRole(r: Role | null) { entryRole = r; touch(); }
/** Đăng nhập học viên: tên phải khớp y hệt (HOA/thường, dấu); PIN 4–6 số; PIN đặt ở lần đầu nếu chưa có. */
export function learnerLogin(name: string, pin: string) {
  name = (name || '').trim(); pin = (pin || '').trim();
  if (!name) return { error: 'Chưa nhập họ tên.' };
  const matches = learners().filter(x => exactName(x.name) === exactName(name));
  if (!matches.length) { const near = learners().some(x => normName(x.name) === normName(name)); return { error: near ? `Họ tên chưa đúng chữ HOA/thường hoặc dấu. Có tài khoản gần giống với "${name}", nhưng họ tên phải gõ y như lúc đăng ký.` : `Không tìm thấy học viên tên "${name}". Kiểm tra lại họ tên. Lần đầu dùng thì bấm "Tôi là người mới".` }; }
  if (!/^\d{4,6}$/.test(pin)) return { error: 'Mã PIN học viên gồm 4–6 chữ số, không có chữ cái hay khoảng trắng.' };
  let u = matches.find(x => x.pin && x.pin === pin);
  if (!u) { if (matches.some(x => x.pin)) return { error: 'Mã PIN không đúng. PIN phải khớp từng ký tự. Quên PIN thì nhờ Người vận hành đặt lại.' }; u = matches[0]; u.pin = pin; notify('Đã đặt PIN cho lần vào đầu tiên. Nhớ PIN này nhé!', 'ok'); }
  setSessionUser(u.id); save(true); computeReminders(); return { ok: true, user: u };
}
export function learnerRegister(name: string, pin: string, pin2: string) {
  name = (name || '').trim(); pin = (pin || '').trim(); pin2 = (pin2 || '').trim();
  if (!name) return { error: 'Nhập họ tên' }; if (!/^\d{4,6}$/.test(pin)) return { error: 'Mã PIN gồm 4–6 chữ số' }; if (pin !== pin2) return { error: 'Hai lần nhập PIN không khớp' };
  if (learners().some(x => normName(x.name) === normName(name))) return { error: 'Tên này đã có. Nếu là bạn, hãy đăng nhập; nếu trùng tên, thêm bộ phận vào tên (VD: "Lan – Sales").' };
  const u: User = { id: uid('u'), name, role: 'learner', pin, cefr: null, cefrSuggested: null, cefrApproved: false, sectionScores: null, monthlyGoal: '', createdAt: new Date().toISOString(), avatar: { color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)][0], acc: 'none', bg: Math.floor(Math.random() * AVATAR_BG.length) } };
  S.users.push(u); setSessionUser(u.id); save(true); notify('Chào mừng ' + name + '! Bấm vào avatar ở góc trên để chọn avatar của bạn.', 'ok'); return { ok: true, user: u };
}
/** Đăng nhập vận hành / quản lý (PIN vai trò nếu có). */
export function staffLogin(userId: string, pin?: string) { const u = userById(userId); if (!u) return { error: 'Không có tài khoản' }; const need = u.role === 'operator' ? S.settings.pinOperator : u.role === 'manager' ? S.settings.pinManager : ''; if (need) { if (pin == null) return { needPin: true }; if (pin !== need) return { error: 'PIN không đúng. PIN phân biệt chữ HOA/thường – kiểm tra phím Caps Lock rồi nhập lại.' }; } setSessionUser(u.id); save(true); computeReminders(); return { ok: true, user: u }; }
export function logout() { setSessionUser(null); entryRole = null; save(true); }
export function addUser(name: string, role: Role) { name = (name || '').trim(); if (!name) return { error: 'Nhập họ tên' }; if (me()?.role === 'operator') role = 'learner'; const u: User = { id: uid('u'), name, role, cefr: null, cefrSuggested: null, cefrApproved: false, sectionScores: null, monthlyGoal: '', createdAt: new Date().toISOString() }; S.users.push(u); save(true); notify('Đã tạo ' + name, 'ok'); return { ok: true, user: u }; }
export function setRole(userId: string, role: Role) { const u = userById(userId); if (!u) return { error: 'Không có tài khoản' }; if (me()!.role !== 'manager') return { error: 'Chỉ Quản lý mới đổi được vai trò tài khoản' }; if (u.id === me()!.id && role !== 'manager') return { error: 'Bạn không tự hạ vai trò của tài khoản đang đăng nhập được' }; u.role = role; save(true); notify('Đã đổi vai trò', 'ok'); return { ok: true }; }
export function resetPin(userId: string) { const u = userById(userId); if (!u || u.role !== 'learner' || !isStaff(me())) return false; u.pin = ''; save(true); notify('Đã xoá PIN', 'ok'); return true; }
export function renameUser(userId: string, name: string) { const u = userById(userId); if (!u) return { error: 'Không có tài khoản' }; if (!canManage(me(), u)) return { error: 'Người vận hành chỉ đổi tên được học viên (và tên của mình)' }; if (!name.trim()) return { error: 'Nhập họ tên' }; u.name = name.trim(); save(true); return { ok: true }; }
export function saveAvatar(userId: string | null, a: { color: string; acc: string; bg: number }) { const u = userId ? userById(userId) : me(); if (!u) return false; if (u.id !== me()?.id && !canManage(me(), u)) { notify('Bạn không đổi được avatar của tài khoản này', 'err'); return false; } if (!AVATAR_COLORS.some(c => c[0] === a.color)) a.color = 'ink'; if (!AVATAR_ACC.some(x => x[0] === a.acc)) a.acc = 'leaf'; u.avatar = { color: a.color, acc: a.acc, bg: +a.bg || 0 }; save(true); notify('Đã lưu avatar', 'ok'); return true; }
/** Xoá tài khoản: quản lý xoá thẳng (vào thùng rác); vận hành gửi yêu cầu (cần `reason`). UI confirm trước. */
export function requestDeleteUser(userId: string, reason?: string) {
  const u = userById(userId); if (!u) return { error: 'Không có tài khoản' }; const actor = me()!;
  if (actor.role === 'manager') { if (u.id === actor.id) return { error: 'Bạn không tự xoá tài khoản đang đăng nhập được' }; const r = pendingDelReq(u.id); if (r) Object.assign(r, { status: 'approved', decidedBy: actor.id, decidedByName: actor.name, decidedAt: new Date().toISOString() }); deleteUser(u, actor, r?.id); save(true); notify(`Đã chuyển ${u.name} vào danh sách đã xoá`, 'ok'); return { ok: true, deleted: true }; }
  if (u.role !== 'learner') return { error: 'Người vận hành chỉ được yêu cầu xoá tài khoản học viên; tài khoản Vận hành / Quản lý do Quản lý xử lý' };
  if (pendingDelReq(u.id)) return { error: 'Tài khoản này đã có yêu cầu xoá đang chờ Quản lý duyệt' };
  if (!reason || !reason.trim()) return { needReason: true };
  delReqs().push({ id: uid('dr'), userId: u.id, userName: u.name, userRole: u.role, by: actor.id, byName: actor.name, reason: reason.trim(), at: new Date().toISOString(), status: 'pending' });
  save(true); notify('Đã gửi yêu cầu xoá. Tài khoản chỉ bị xoá khi Quản lý duyệt.', 'ok'); return { ok: true, requested: true };
}
export function cancelDeleteRequest(id: string) { const r = delReqs().find(x => x.id === id); if (r && r.status === 'pending') { r.status = 'cancelled'; r.decidedAt = new Date().toISOString(); save(true); } }
export function decideDeleteRequest(id: string, ok: boolean, note = '') { const r = delReqs().find(x => x.id === id); const actor = me()!; if (!r || r.status !== 'pending' || actor.role !== 'manager') return { error: 'Yêu cầu không còn chờ hoặc bạn không phải Quản lý' }; const u = userById(r.userId); Object.assign(r, { status: ok ? 'approved' : 'rejected', decidedBy: actor.id, decidedByName: actor.name, decidedAt: new Date().toISOString(), note: (note || '').trim() }); if (ok && u) deleteUser(u, actor, r.id); save(true); notify(ok ? `Đã chuyển ${r.userName} vào danh sách đã xoá` : 'Đã từ chối yêu cầu', 'ok'); return { ok: true }; }
export function trashRestore(trashId: string) { const it = (S.trash || []).find(x => x.id === trashId); if (me()!.role !== 'manager') return { error: 'Chỉ Quản lý khôi phục được tài khoản đã xoá' }; if (!it) return { error: 'Tài khoản này không còn trong danh sách đã xoá' }; const name0 = it.user.name; if (restoreUser(it)) { delReqs().forEach(r => { if (r.userId === it.user.id && r.status === 'approved') { r.status = 'restored'; r.restoredAt = new Date().toISOString(); } }); save(true); notify(`Đã khôi phục ${it.user.name}${it.user.name !== name0 ? ' (đổi tên vì trùng với tài khoản khác)' : ''}`, 'ok'); return { ok: true }; } S.trash = (S.trash || []).filter(x => x.id !== it.id); save(true); notify('Tài khoản này đang hoạt động sẵn rồi nên không cần khôi phục; đã bỏ khỏi danh sách.', ''); return { ok: true, noop: true }; }
export function trashPurge() { if (me()!.role !== 'manager') return { error: 'Chỉ Quản lý xoá vĩnh viễn được' }; const n = (S.trash || []).length, g = goneRequests().length; if (!n && !g) return { error: 'Danh sách đã xoá đang trống' }; S.trash = []; delReqs().forEach(r => { if (r.status === 'approved' && !userById(r.userId)) r.cleared = true; }); save(true); notify(n ? 'Đã xoá vĩnh viễn' : 'Đã dọn danh sách', 'ok'); return { ok: true, purged: n, cleared: g }; }
export function pinForgotSend(operatorId: string, note = '') { const x = userById(operatorId); if (!x) return { error: 'Không có tài khoản' }; const open = pinReports().find(r => r.userId === operatorId && r.status === 'open'); if (open) { open.at = new Date().toISOString(); open.count = (open.count || 1) + 1; if (note.trim()) open.note = note.trim(); } else pinReports().push({ id: uid('pr'), userId: operatorId, userName: x.name, role: x.role, note: note.trim(), at: new Date().toISOString(), status: 'open', count: 1 }); save(true); notify('Đã gửi yêu cầu tới Quản lý. Quản lý sẽ báo lại PIN cho bạn.', 'ok'); return { ok: true }; }
export function pinReportDone(id: string) { const r = pinReports().find(x => x.id === id); if (!r || me()?.role !== 'manager') return false; r.status = 'done'; r.doneAt = new Date().toISOString(); r.doneBy = me()!.id; save(true); return true; }
export function saveProfile(name: string, f: Partial<Profile>, persona?: Persona) { const u = me()!; const err = validateProfile(name, f); if (err) return { error: err }; const isNew = !u.profile; u.name = name.trim(); u.persona = persona || personaOf(u); u.profile = { ...(f as Profile), explain: 'auto', sessionsPerWeek: 5, completedAt: u.profile?.completedAt || new Date().toISOString(), updatedAt: new Date().toISOString() }; delete u.profileDraft; save(true); notify('Đã lưu hồ sơ', 'ok'); return { ok: true, next: isNew && !u.cefrApproved ? '/test/placement' : '/profile' }; }
export function saveProfileDraft(f: Partial<Profile>) { const u = me()!; u.profileDraft = f; save(true); notify('Đã lưu tạm – quay lại điền tiếp bất cứ lúc nào', 'ok'); }

// =====================================================================================
// DEMO SEED (dữ liệu mẫu để xem mọi màn không cần API key; giữ settings)
// =====================================================================================
export function seedDemo() {
  const T = todayStr(); const ago = (n: number) => addDays(T, -n); const iso = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
  const keepSettings = S.settings; const fresh = defaultState(); fresh.settings = Object.assign(fresh.settings, keepSettings, { pilotStartDate: mondayOf(T), pilotWeeks: 2, weekOverride: 0 }); store.S = fresh; S = fresh;
  const mk = (name: string, role: Role, cefr: Cefr | null, goal = ''): User => ({ id: uid('u'), name, role, cefr, cefrSuggested: cefr, cefrApproved: !!cefr, sectionScores: null, monthlyGoal: goal, createdAt: iso(10), approvedAt: cefr ? iso(8) : null });
  const [l1, l2, l3, l4, l5, l6, l7] = [mk('Học viên A', 'learner', 'A1', 'Tự giới thiệu bằng 5 câu đơn giản.'), mk('Học viên B', 'learner', 'A2', 'Viết email ngắn xin dời lịch họp.'), mk('Học viên C', 'learner', 'B1', 'Trình bày một vấn đề và đề xuất giải pháp.'), mk('Học viên D', 'learner', 'B2', 'Dẫn dắt một cuộc họp ngắn.'), mk('Học viên E', 'learner', 'A2', 'Trả lời 3 câu hỏi của khách.'), mk('Học viên F', 'learner', null), mk('Học viên G', 'learner', null)];
  S.users = [l1, l2, l3, l4, l5, l6, l7, mk('Vận hành', 'operator', null), mk('Quản lý', 'manager', null)];
  [l1, l2, l3, l4, l5, l6, l7].forEach(x => x.pin = '1234');
  S.users.forEach((x, i) => x.avatar = { color: AVATAR_COLORS[i % AVATAR_COLORS.length][0], acc: AVATAR_ACC[i % AVATAR_ACC.length][0], bg: i % AVATAR_BG.length });
  const prof = (u: User, department: string, position: string, goals: string[], styles: string[], selfLevel: string, situations: string, concerns: string) => { u.profile = { department, position, email: u.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '.').replace(/đ/g, 'd') + '@gft.example', contact: '', goals, envUse: 'weekly', familyUse: 'monthly', habits: ['movies', 'social'], situations, styles, explain: 'auto', timeOfDay: 'noon', duration: '10', sessionsPerWeek: 3, device: 'phone', selfLevel, certs: [], experience: 'Học ở trường', concerns, completedAt: iso(10) }; };
  prof(l1, 'QA', 'Tester', ['email', 'confidence'], ['quiz', 'examples'], 'A1', 'Đọc ticket và trả lời ngắn cho dev nước ngoài', 'Sợ nói sai');
  prof(l2, 'Sales', 'Sales executive', ['customer', 'email'], ['speaking', 'examples'], 'A2', 'Email báo giá, chat với khách', 'Không nhớ từ');
  prof(l3, 'QA', 'QA lead', ['meeting', 'docs'], ['reading', 'writing'], 'B1', 'Họp daily với team Singapore', 'Muốn nói trôi chảy hơn'); l3.profile!.certs = [{ type: 'toeic', score: '650', year: '2023' }];
  prof(l4, 'Delivery', 'Delivery manager', ['meeting', 'career'], ['speaking', 'listening'], 'B2', 'Kickoff với khách', 'Diễn đạt ý phức tạp');
  prof(l5, 'Sales', 'Sales executive', ['customer'], ['listening', 'games'], 'unknown', 'Trả lời câu hỏi về sản phẩm', 'Nghe không kịp');
  prof(l6, 'Marketing', 'Content', ['email', 'docs'], ['reading', 'quiz'], 'B1', 'Đọc tài liệu marketing', '');
  S.weeks[0] = { n: 1, topic: 'Introducing yourself & your job', description: 'Tự giới thiệu trong buổi họp đầu với khách hoặc đồng nghiệp mới.', objectives: 'Nói/viết 4–6 câu về bản thân và công việc.', keyVocabHint: 'colleague, in charge of, department, deadline' };
  S.weeks[1] = { n: 2, topic: 'Emails & rescheduling meetings', description: 'Viết email ngắn xin dời lịch và xác nhận lịch mới.', objectives: 'Viết email 60–100 từ xin dời lịch.', keyVocabHint: 'reschedule, postpone, available, confirm' };
  const mkTest = (u: User, pts25: number[], note: string) => { const maxes = [20, 40, 20, 20]; const pts = pts25.map((p, i) => Math.round(p / 25 * maxes[i])); const sectionScores = Object.fromEntries(SECTIONS.map((s, i) => [s, secScore(pts[i], maxes[i])])) as Record<Section, SectionScore>; const total = sum(pts); const t: TestRecord = { id: uid('t'), userId: u.id, kind: 'placement', form: 'A', target: null, answers: {}, audio: {}, sectionScores, total, rawLevel: totalCefr(total), aiSuggestedCefr: totalCefr(total), rationale: note, aiScored: true, warnings: [], timing: {}, autoSubmitted: false, autoReason: '', submittedAt: iso(9) }; S.tests.push(t); u.sectionScores = sectionScores; };
  mkTest(l1, [5, 6, 4, 4], 'Hiểu thông tin cơ bản phần A nghe/đọc; bài viết rất ngắn, thiếu động từ to be.'); mkTest(l2, [9, 10, 8, 8], 'Nắm hiện tại đơn; nhầm thì khi kể chuyện quá khứ. Viết được tin nhắn ngắn đúng ý.'); mkTest(l3, [14, 15, 13, 12], 'Hiểu ý chính bài đọc; bài viết nêu được vấn đề và giải pháp nhưng câu nối còn vụng.'); mkTest(l4, [19, 20, 18, 17], 'Hiểu ý ngầm trong hội thoại; viết mạch lạc, còn vài lỗi mạo từ.'); mkTest(l5, [7, 9, 7, 6], 'Phần nghe yếu hơn các phần khác; câu viết đúng nhưng ngắn.'); mkTest(l6, [13, 14, 11, 10], 'Ngữ pháp khá; bài viết hơi ngắn so với yêu cầu 150 từ.');
  (['A1', 'A2', 'B1', 'B2'] as Cefr[]).forEach(c => S.lessonSets.push({ id: uid('ls'), week: 1, cefr: c, status: 'approved', lessons: demoLessons(c), generatedAt: iso(7), approvedAt: iso(7) }));
  const act = (u: User, daysAgo: number, type = 'lesson', minutes = 12) => { if (ago(daysAgo) >= S.settings.pilotStartDate || type === 'test') S.activity.push({ userId: u.id, date: ago(daysAgo), type, minutes, at: new Date(Date.now() - daysAgo * 86400000).toISOString() }); };
  [l1, l2, l3, l4, l5, l6].forEach(u => act(u, 9, 'test', 20));
  const dow = dowIndex(T);
  for (let d = 0; d <= dow; d++) { if (d % 2 === 0) act(l1, d); act(l3, d); if (d !== 1) act(l4, d, d % 2 ? 'coach' : 'lesson'); if (d % 3 === 0) act(l2, d); }
  if (dow >= 3) act(l5, dow); else act(l5, 3);
  const done = (u: User, n: number, score: number) => approvedLessons(1, u.cefr).slice(0, n).forEach((l, i) => S.progress.push({ userId: u.id, lessonId: l.id, week: 1, completedAt: iso(Math.max(0, dow - i)), score, minutes: 11 }));
  done(l1, 1, 80); done(l2, 2, 70); done(l3, 5, 90); done(l4, 1, 100);
  approvedLessons(1, 'B1').forEach(l => (['L', 'R', 'W', 'S'] as PartCode[]).forEach(c => { S.practiceResults[l3.id + '_' + partKey(l.id, c)] = { answer: 'ok', ok: true, localOk: true, attempts: 1, done: true, at: iso(1) }; }));
  const turn = (userText: string, reply: string, m: number, v: number, g: number, sugg: any[]): CoachTurn => ({ at: iso(1), userText, reply, rubric: { meaning: m, vocab: v, grammar: g }, suggestions: sugg, correctedText: sugg.length ? sugg[0].corrected : '' });
  S.coachSessions.push({ id: uid('cs'), userId: l2.id, week: 1, startedAt: iso(1), messages: [{ role: 'assistant', content: 'Hi B! I\'m Season. What do you do at work?' }, { role: 'user', content: 'My name is B. I work at marketing.' }, { role: 'assistant', content: 'Nice to meet you, B! What do you do in marketing every day?' }], turns: [turn('My name is B. I work at marketing.', 'Nice to meet you, B! What do you do in marketing every day?', 4, 3, 3, [{ original: 'I work at marketing', corrected: 'I work in marketing', explanation: 'Dùng "in" trước tên phòng ban.' }])] });
  S.coachSessions.push({ id: uid('cs'), userId: l3.id, week: 1, startedAt: iso(2), messages: [{ role: 'assistant', content: 'Hi C, what does a typical day look like for you?' }, { role: 'user', content: 'I have been working as QA lead since two years. Most days I review test plans and talk with the client.' }, { role: 'assistant', content: 'That sounds busy! Which part of the day do you enjoy most?' }], turns: [turn('I have been working as QA lead since two years.', 'That sounds busy! Which part of the day do you enjoy most?', 5, 4, 3, [{ original: 'since two years', corrected: 'for two years', explanation: 'Use "for" with a period of time and "since" with a starting point.' }])] });
  S.submissions.push({ id: uid('sub'), userId: l3.id, week: 1, type: 'writing', task: practiceTask(l3, 1).task, text: 'Dear team,\nI am writing to introduce myself. I have been working at GFT since 2022 as QA lead. On this project I am responsible for test planning and I will join your weekly call. One problem I see is that bug reports often miss steps to reproduce. I suggest we use a short template for every report.\nBest regards, C', rubric: { meaning: 5, vocab: 4, grammar: 4 }, total: 86, feedback: 'Clear structure and a concrete suggestion. Watch article use ("a short template" is right; "the weekly call" needs "your").', suggestions: [{ original: 'I will join your weekly call', corrected: 'I will join your weekly call', explanation: 'Correct as written – good use of "will" for a commitment.' }], correctedText: '', aiGraded: true, operatorChecked: false, submittedAt: iso(0) });
  const [, fC1] = (['B2', 'C1'] as Cefr[]).map(t => { const f = { id: uid('lf'), target: t, status: 'approved', form: demoLevelForm(t), createdAt: iso(5), approvedAt: iso(5), by: null, byName: 'Đề mẫu' }; S.levelForms.push(f); return f; });
  const cs3 = S.coachSessions.find(c => c.userId === l3.id)!; ([['Most days I start with a stand-up, then I review the test plans that the team wrote the day before.', 'Sounds structured. What do you do when a plan has gaps?', 5, 4, 4], ['I write comments in the document and discuss them with the tester in a short call, because written feedback alone can sound harsh.', 'Good point. How does the client react to delays?', 4, 4, 4], ['They are usually fine if we tell them early and explain the reason, so I send a short update as soon as I know.', 'That is a good habit. Which part of your job is the most difficult?', 5, 4, 5], ['Estimating how long testing will take, because the requirements often change in the middle of the sprint.', 'That is common. How do you handle the changes?', 4, 5, 4], ['We keep a list of changes and re-estimate every Friday, then I show the client what moved and why.', 'Clear process. What would you improve first?', 5, 4, 4], ['I would like a better template for bug reports so that developers get the steps to reproduce without asking us.', 'Great idea – thanks for the conversation!', 4, 5, 4]] as [string, string, number, number, number][]).forEach(([q, a, m, v, g]) => { cs3.messages.push({ role: 'user', content: q }, { role: 'assistant', content: a }); cs3.turns.push(turn(q, a, m, v, g, [])); });
  const luScores = Object.fromEntries(SECTIONS.map((s, i) => [s, secScore([20, 19, 18, 17][i], 25)])) as Record<Section, SectionScore>;
  const luTest: TestRecord = { id: uid('t'), userId: l4.id, kind: 'levelup', form: fC1.id, target: 'C1', answers: {}, audio: {}, sectionScores: luScores, total: 74, rawLevel: totalCefr(74), aiSuggestedCefr: 'B2', rationale: 'Bài viết mạch lạc, lập luận rõ; phần nói còn vài lỗi mạo từ.', aiScored: true, gradedBy: 'ai', warnings: [], timing: {}, autoSubmitted: false, autoReason: '', submittedAt: iso(2), outcome: 'requested', weakest: 'speaking' };
  S.tests.push(luTest);
  const chal: CoachSession = { id: uid('cs'), userId: l4.id, week: 1, startedAt: iso(1), challenge: { target: 'C1', testId: luTest.id, result: 'pass', mean: 4.2, off: 0, finishedAt: iso(1) }, messages: [{ role: 'assistant', content: 'Hi D, this is your C1 challenge. Tell me about a recent problem at work and how you dealt with it.' }], turns: [] };
  ([['Last month a client changed the scope two days before the kickoff, which meant our estimates were no longer realistic. I asked for a short call, laid out the trade-offs and we agreed to move one feature to phase two.', 'Sensible. Had you anticipated the change?', 4, 4, 4], ['Partly – we had flagged the risk in the proposal, but I underestimated how late the request would come. In hindsight I should have confirmed the scope in writing a week earlier.', 'What would you do differently with a new client?', 4, 5, 4], ['I would set a scope freeze date and explain why it protects both sides; most clients accept it once they understand the cost of late changes.', 'How do you handle a client who refuses?', 5, 4, 4], ['I would separate what is negotiable from what is not, offer options with their consequences, and escalate only if the delivery date itself is at risk.', 'Do you think remote kickoffs make this harder?', 4, 4, 5], ['Somewhat, because you lose the informal signals; so I schedule a shorter follow-up two days later to catch anything that was not said in the meeting.', 'Last question: what makes a good delivery manager?', 4, 4, 4], ['Someone who keeps the team calm under pressure, communicates bad news early, and treats the client as a partner rather than an opponent.', 'Well put – thank you!', 5, 4, 4]] as [string, string, number, number, number][]).forEach(([q, a, m, v, g]) => { chal.messages.push({ role: 'user', content: q }, { role: 'assistant', content: a }); chal.turns.push(turn(q, a, m, v, g, [])); });
  S.coachSessions.push(chal);
  S.levelRequests.push({ id: uid('lr'), userId: l4.id, from: 'B2', to: 'C1', testId: luTest.id, sessionId: chal.id, status: 'pending', at: iso(1) });
  learners().filter(x => x.cefrApproved).forEach(x => { const r = rewards(x); x.badgesSeen = r.badges.filter(b => b.earned).map(b => b.id); x.levelSeen = r.lv.index; });
  entryRole = null; save(true); notify('Đã nạp dữ liệu mẫu. PIN của mọi học viên mẫu là 1234.', 'ok');
}

// =====================================================================================
// BOOT MIGRATIONS (như cuối core.js; chạy sau khi mọi helper đã có)
// =====================================================================================
function runMigrations() {
  try { (S.microLessons || []).forEach(fixLessonPractice); (S.lessonSets || []).forEach(set => (set.lessons || []).forEach(fixLessonPractice)); } catch (e) { console.warn('migration skipped', e); }
  try { let fixed = 0; const fix = (l: any) => { if (l && l.pron && l.pron.verified === undefined) { const p = parsePron(l.pron); if (p) { l.pron = p; fixed++; } } }; (S.microLessons || []).forEach(fix); (S.lessonSets || []).forEach(set => (set.lessons || []).forEach(fix)); if (fixed) save(true); } catch (e) { console.warn('pron migration skipped', e); }
  try { if (upgradeOldDemoSets()) save(true); } catch (e) { console.warn('demo upgrade skipped', e); }
  try { let n = 0; (S.lessonSets || []).forEach(set => { if (!(set.lessons || []).some(l => l.demo && detailsMissing(l))) return; const fresh = demoLessons(set.cefr, set.week); set.lessons = set.lessons.map(l => { const f = l.demo ? fresh.find(x => x.title === l.title) : null; if (!f) return l; n++; return { ...f, id: l.id, day: l.day || f.day, order: l.order || f.order }; }); }); if (n) save(true); } catch (e) { console.warn('demo refresh skipped', e); }
  try { let n = 0; S.users.forEach(u => { if (u.role === 'learner' && u.cefrApproved && u.cefr && !(u.cefrHistory || []).length) { u.cefrHistory = [{ from: null, to: u.cefr, at: dateStr(u.approvedAt || u.createdAt), by: u.approvedBy || null, reason: 'Duyệt mức đầu vào (ghi lại từ dữ liệu cũ)', evidence: '' }]; n++; } }); n += applyPendingLevels(); if (n) save(true); } catch (e) { console.warn('level history migration skipped', e); }
  applyBasePromptOverride();
}

// =====================================================================================
// FACADE – createAppLogicV2(): state + actions cho UI V2
// =====================================================================================
export interface AppLogicOptions extends StoreOptions { /** tự gắn audio listeners + theme vào document (mặc định true khi có DOM) */ attachToDocument?: boolean }
export function createAppLogicV2(opts: AppLogicOptions = {}) {
  const st = createStore(opts); bindStore(st); testEngine = new TestEngine();
  testEngine.on('beep', (n: number) => beep(n)); testEngine.on('alarm', () => alarm()); testEngine.on('stop-speech', () => speech.stop());
  bus.on('reward', (kind: string) => { beep(2); buzz(); bus.emit('celebrate', kind); });
  runMigrations(); computeReminders();
  const attach = opts.attachToDocument ?? (typeof document !== 'undefined');
  if (attach) { audio.init(); applyThemeToDocument(S); document.addEventListener('visibilitychange', () => { if (document.hidden) testEngine.integrityWarning('chuyển tab hoặc thu nhỏ cửa sổ'); }); window.addEventListener('blur', () => setTimeout(() => { if (!document.hasFocus()) testEngine.integrityWarning('chuyển sang cửa sổ khác'); }, 300)); window.addEventListener('focus', () => setTimeout(() => { testEngine.pickerGrace = false; }, 800)); }

  const api = {
    /** ---- state ---- */
    getState: () => S, subscribe: (fn: () => void) => bus.on('change', fn), on: (ev: string, fn: Listener) => bus.on(ev, fn), store: st, sandbox: st.KEY.endsWith(':sandbox'),
    select: {
      me, userById, learners, activeLearners, isStaff, canManage, currentWeek, weekInfo, weekStart, isLastWeek, courseTheme, theme: () => themeOf(S), themeMarkSvg: (size?: number, key?: ThemeKey) => themeMarkSvg(key || themeOf(S), size), autoTheme, avatarSpec, themes: THEMES as Dict<{ name: string; mark: string }>,
      entry: entryView, learnerHome, lessonAccess, lessonView, practiceView, coachView, challengeView, weeklyPractice: weeklyPracticeView, profileRows, rewards, rewardView: (u: User) => rewards(u), certificate, levelSignal, levelUpState, levelUpEligibility,
      approval: approvalView, levelForms: levelFormsView, weeks: weeksView, lessonMatrix, lessonSet: setView, review: reviewView, prompts: promptsView, settings: settingsView, testReview, userQuickView, pinOverview, delReqView, trashList, goneRequests,
      manager: managerView, ops: opsView, reminders: remindersView, report: reportView, rewardSim: rewardSimView, kpis, learnerRow,
      games: gamesView, gameIntro, arena: arenaView, duel: duelById, gameSets: myGameSets, currentGameSet, bestGame, vocabOf, vocabDetailsOf, todayMicro, mySurvey, weekDots, streakDays, sessionsThisWeek, missedDays, audio: audio.state, ai: { hasKey: ai.hasKey, provider: ai.provider, modelName: ai.modelName, providerLabel: ai.providerLabel, canTranscribe: ai.canTranscribe }
    },
    /** ---- actions ---- */
    auth: { chooseRole, learnerLogin, learnerRegister, staffLogin, logout, pinForgotSend },
    users: { addUser, setRole, resetPin, renameUser, saveAvatar, requestDeleteUser, cancelDeleteRequest, decideDeleteRequest, trashRestore, trashPurge, pinReportDone },
    profile: { save: saveProfile, saveDraft: saveProfileDraft, validate: validateProfile, setPersona, opts: PROFILE_OPTS },
    settings: { save: saveSettings, setTheme, testAi: () => ai.ping(), testWebhook: async () => { await sendWebhook('Tin nhắn thử từ Season English – ' + new Date().toLocaleString('vi-VN'), me()); }, testImage: () => vocabImage('notebook'), clearImageCache, exportJSON: st.exportJSON, importJSON: st.importJSON, exportCSV, seedDemo, wipe: () => { st.wipe(); S = st.S; entryRole = null; } },
    test: testEngine,
    lesson: { markStudied, submitPractice, attachAudio: attachPracticeAudio, drill, complete: completeLesson, ensureTrans, appealPart, appealSubmission, micro: { generate: () => generateMyMicro(me()!), complete: completeMicro, delete: deleteMicro } },
    coach: { send: coachSend, clear: coachClear, setPersona },
    practice: { submit: submitPracticeWeek, task: practiceTask },
    survey: { submit: submitSurvey },
    rewards: { announce: announceBadges, sim: { pick: rewardSimCase, points: rewardSimPoints, toggle: rewardSimToggleBadge } },
    operator: { approveLevel, setLevelDirect, changeLevel, cancelPendingLevel, setMonthlyGoal, demote, demoteDefaultReason, rescoreTest, gradeTestManual, generateLevelForm, approveLevelForm, deleteLevelForm, approveLevelRequest, rejectLevelRequest, closeTopicReport,
      suggestWeeks, confirmWeekSuggestion, closeWeekSuggestion, reopenWeekSuggestion, saveWeeks, addLevelColumn, generateSet, createManualSet, approveSet, unapproveSet, deleteSet, deleteLessonAt, editLessonJson, lessonFormInitial, saveLessonForm, enrichSet, fillPhrases,
      setReviewTab, checkSubmission, checkTurn, gradeSubmissionAI: (id: string) => gradeSubmissionAI(S.submissions.find(x => x.id === id)!), gradeSubmissionManual, decideAppeal, savePrompts },
    manager: { reminderCopy, reminderDismiss, reminderSend, reminderSendAll, exportCSV, copyReport: async (u: User) => copyText(reportView(u).text), downloadReport: (u: User) => download(`aec-bao-cao-${todayStr()}.txt`, reportView(u).text, 'text/plain;charset=utf-8') },
    games: { makeSet: makeGameSet, useWeekSet: useWeekGameSet, pickSet: pickGameSet, deleteSet: deleteGameSet, validateTopic, finish: finishGame, newDuel, engines: { scramble: scrambleEngine, crossword: crosswordEngine, catch: catchLevel, mario: marioLevel, sort: sortEngine, typing: typingEngine }, art: { src: artSrc, hero: heroArt, heroKind, item: seasonCatch, list: GAME_LIST as any[] } },
    platform: { speech, recorder, audioStore, audio, beep, alarm, buzz, vocabImage, takeAudio, copyText, download },
    ai,
    consts: { LEVELS, LEVEL_NAMES, ROLE_NAMES, SECTIONS, SECTION_NAMES, PROFILE_OPTS, AVATAR_COLORS, AVATAR_ACC, AVATAR_BG, BADGES, GOOSE_LEVELS, REWARD_RULES, SIM_CASES, DOC_FIELDS, PART_NAMES, POS_VI, MAX_ATTEMPTS, LESSONS_PER_WEEK, CHALLENGE_TURNS, LEVELUP_DEFAULTS, DELREQ_STATUS, APPEAL_STATUS, PERSONAS: PERSONAS as any, THEMES, OAI_PRESETS, IMG_SOURCES, GAME_LIST, PROMPT_KEYS, WRITING_CRITERIA, SPEAKING_CRITERIA, DAY_SHORT, DOW_FULL }
  };
  return api;
}
export type AppLogicV2 = ReturnType<typeof createAppLogicV2>;

// ---------- React hook (xoá import ở đầu file nếu UI V2 không dùng React) ----------
let singleton: AppLogicV2 | null = null;
export function getAppLogicV2(opts?: AppLogicOptions) { return singleton || (singleton = createAppLogicV2(opts)); }
/** `const { state, logic } = useAppLogicV2();` – re-render khi state đổi (subscribe vào store). */
export function useAppLogicV2(opts?: AppLogicOptions) {
  const logic = useMemo(() => getAppLogicV2(opts), []);
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => logic.subscribe(() => force()), [logic]);
  return { state: logic.getState(), logic, select: logic.select };
}

// ---------- re-export dữ liệu tĩnh (được khai báo không có `export` ở các khối [DATA]) ----------
export { THEME_MARKS, THEMES, TET_DATES, MIDAUTUMN_DATES, PROMPTS, LEVEL_SCOPE, levelScopeNote, SOUND_WORDS, SOUND_FILES, SOUND_SPOKEN, MCQ_SCHEMA, VOCAB_SCHEMA, SCHEMAS, mcq, TEST_FORMS, PERSONAS, personaOf, personaNote, personaText, RELEVANCE_RULE_COACH, RELEVANCE_RULE_GRADE, DEMO_LESSONS, DEMO_VI, DEMO_UMB, DEMO_LEX, demoLevelForm, GAME_LIST, POS_GROUPS, posGroup, GAME_POOL, BANNED_TOPIC, GROUP_TERMS, hasTerm, GAME_ART, SEASON_HERO, HERO_NAMES, heroSprite, SUN_SPRITE, SEASON_CATCH };
export default useAppLogicV2;

