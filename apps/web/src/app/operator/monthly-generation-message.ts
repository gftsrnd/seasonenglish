const sectionLabels: Record<string, string> = { listening: "Nghe", reading: "Đọc", writing: "Viết", grammar: "Ngữ pháp", pronunciation: "Phát âm", vocabulary: "Từ vựng", speaking: "Nói", word_class: "Từ loại", word_use: "Dùng từ" };

/**
 * nginx closes a long monthly resource request after proxy_read_timeout (504)
 * while the API keeps generating and checkpointing. That is not a failure: the
 * Operator should keep watching the existing progress endpoint.
 */
export function isGatewayTimeout(reason: unknown): boolean {
  const error = reason && typeof reason === "object" ? reason as { code?: unknown; status?: unknown } : {};
  return error.status === 504 || error.code === "HTTP_504";
}

/** Describe the failed stage without displaying model output, validator text or technical codes. */
export function monthlyGenerationMessage(reason: unknown): string {
  const error = reason && typeof reason === "object" ? reason as { code?: string; details?: { report?: { severe?: Array<{ component?: string }> }; issues?: Array<{ component?: string }>; components?: string[] } } : {};
  const details = error.details;
  const components = [...(details?.report?.severe ?? []), ...(details?.issues ?? [])].flatMap(item => item.component ?? []);
  const sections = [...new Set([...components, ...(details?.components ?? [])].map(code => sectionLabels[code]).filter(Boolean))];
  const where = sections.length ? ` ở phần ${sections.join(", ")}` : "";
  if (error.code === "AI_OUTPUT_INVALID") return `AI trả về nội dung chưa đúng cấu trúc${where}. Chưa lưu bản nháp; hãy thử sinh lại.`;
  if (error.code === "AI_OUTPUT_TRUNCATED") return `Nội dung AI trả về bị ngắt giữa chừng${where}. Chưa lưu bản nháp; hãy thử sinh lại.`;
  if (error.code === "AI_TIMEOUT") return "AI phản hồi quá lâu. Chưa lưu bản nháp; hãy thử lại sau.";
  if (error.code === "AI_PROVIDER_RATE_LIMIT") return "Dịch vụ AI đang giới hạn lượt gọi. Chưa lưu bản nháp; hãy chờ rồi thử lại.";
  if (error.code === "MONTHLY_GENERATION_QUALITY_FAILED") return `Bài sinh chưa đạt yêu cầu${where}. Bản nháp hiện có vẫn được giữ; bấm "Lỗi" ở ô ngày để xem lý do và bản sinh lỗi.`;
  if (error.code === "MONTHLY_DAY_ALREADY_APPROVED") return "Bài này đã được duyệt nên đang khoá. Hãy bấm \"Yêu cầu mở lại\" để Quản lý mở lại bài trước khi sinh lại.";
  if (error.code === "NETWORK_UNAVAILABLE") return "Mất kết nối khi sinh bài. Hãy kiểm tra mạng trước khi thử lại.";
  return sections.length ? `Bài sinh chưa đạt yêu cầu${where}. Chưa lưu bản nháp; hãy thử lại.` : "Không sinh được bài học. Hãy thử lại.";
}

export function monthlyFinalGenerationMessage(reason:unknown):string {
  const error=reason && typeof reason === "object" ? reason as {code?:string;details?:{report?:{checks?:Array<{code:string}>}}} : {};
  const labels:Record<string,string>={GEN04:"độ phủ từ",GEN10:"bằng chứng ngữ pháp",GEN11:"từ luyện âm",GEN18:"bảo mật đề học viên",GEN22:"độ dài và level"};
  if(error.code === "MONTHLY_FINAL_GENERATION_QUALITY_FAILED") {
    const areas=[...new Set((error.details?.report?.checks??[]).map(check=>labels[check.code]??"kiểm tra nội dung"))];
    return `AI đã thử sửa nhiều lượt nhưng đề chưa đạt${areas.length ? ` về ${areas.join(", ")}` : ""}. Bản nháp cũ giữ nguyên — bấm sinh lại để thử tiếp.`;
  }
  if(error.code === "AI_OUTPUT_INVALID")return monthlyFinalAiRetryMessage(reason);
  if(error.code === "MONTHLY_FINAL_EXAM_DATE_LOCKED")return "Đã đến ngày thi; đề tháng đã khóa chỉnh sửa.";
  if(error.code === "MONTHLY_FINAL_ALREADY_PUBLISHED")return "Đề tháng đã phát hành. Cần mở khóa theo luồng quản lý trước khi thay đổi.";
  return "Không sinh được đề thi tháng. Bản nháp hiện có vẫn được giữ; hãy thử lại.";
}

/** Consecutive unfinished resource runs after which manual completion is suggested. */
export const MONTHLY_RESOURCE_MANUAL_SUGGESTION_AFTER = 3;

export function monthlyResourceManualSuggestion(failedAttempts: number | undefined): string | undefined {
  return failedAttempts !== undefined && failedAttempts >= MONTHLY_RESOURCE_MANUAL_SUGGESTION_AFTER
    ? `Đã thử ${failedAttempts} lần chưa xong — có thể soạn tay phần còn thiếu.`
    : undefined;
}

/**
 * Operator messages the API writes for a resource run that stopped (AI-call
 * cap, partial progress kept, AI provider throttling/blocking). They are shown
 * as-is; any other issue text (validator detail, English) is not.
 */
const KNOWN_RESOURCE_OPERATOR_MESSAGE = /^(Đã dùng hết (hạn mức )?\d+ lượt gọi AI|Đã sinh thêm một phần|Mới có \d+\/\d+ từ cốt lõi|Nhà cung cấp AI)/u;

export type MonthlyResourceNotice = { message: string; tone: "info" | "warn" | "danger"; progressSaved: boolean };

/**
 * Toast for a failed monthly RESOURCE generation. A run that ended short but
 * kept its progress is normal (the next run continues it): neutral tone, no
 * manual-editing hint until the 3rd unfinished run in a row. Provider/network
 * problems get warn tone with the reason; red only when something broke and
 * nothing was kept.
 */
export function monthlyResourceGenerationNotice(reason: unknown): MonthlyResourceNotice {
  const error = reason && typeof reason === "object" ? reason as { code?: unknown; message?: unknown; details?: unknown } : {};
  const code = typeof error.code === "string" ? error.code : typeof error.message === "string" ? error.message : "";
  const details = error.details && typeof error.details === "object" ? error.details as { issues?: unknown; progressSaved?: unknown; failedAttempts?: unknown } : {};
  const progressSaved = details.progressSaved === true;
  const failedAttempts = typeof details.failedAttempts === "number" ? details.failedAttempts : undefined;
  const firstIssue = Array.isArray(details.issues) && typeof details.issues[0] === "string" ? details.issues[0].trim() : "";
  const withSuggestion = (message: string) => [message, monthlyResourceManualSuggestion(failedAttempts)].filter(Boolean).join(" ");
  if (code === "AI_UNAVAILABLE" || code === "AI_PROMPT_NOT_READY") return { message: "Chưa kết nối AI, bạn có thể soạn tay.", tone: "warn", progressSaved };
  if (code === "AI_PROVIDER_RATE_LIMIT") return { message: withSuggestion("Nhà cung cấp AI đang giới hạn tốc độ; chưa tốn lượt sinh. Thử lại sau ít phút."), tone: "warn", progressSaved };
  if (code === "AI_PROVIDER_REJECTED") return { message: withSuggestion(`Nhà cung cấp AI đang chặn yêu cầu (có thể do hạn mức tài khoản)${progressSaved ? "; phần đã làm được vẫn được lưu" : ""}. Hãy báo quản trị hệ thống.`), tone: "warn", progressSaved };
  if (code === "AI_TIMEOUT" || code === "AI_PROVIDER_UNAVAILABLE" || code === "AI_PROVIDER_NETWORK" || code === "AI_PROVIDER_FAILED" || code === "AI_PROVIDER_MALFORMED_RESPONSE") {
    return { message: withSuggestion(`Dịch vụ AI tạm thời không phản hồi${progressSaved ? "; phần đã làm được vẫn được lưu" : ""}. Thử lại sau ít phút.`), tone: "warn", progressSaved };
  }
  if (code === "NETWORK_UNAVAILABLE") return { message: "Mất kết nối tới E4S. Kiểm tra mạng rồi bấm Tiếp tục.", tone: "warn", progressSaved };
  if (firstIssue && KNOWN_RESOURCE_OPERATOR_MESSAGE.test(firstIssue)) return { message: withSuggestion(firstIssue), tone: "info", progressSaved: progressSaved || !firstIssue.startsWith("Nhà cung cấp AI") };
  if (progressSaved) return { message: withSuggestion("Đã sinh thêm một phần. Bấm Tiếp tục để sinh tiếp."), tone: "info", progressSaved };
  return { message: withSuggestion("AI chưa tạo được tài nguyên lần này. Hãy thử lại."), tone: code.startsWith("HTTP_5") || code === "API_INVALID_RESPONSE" ? "danger" : "warn", progressSaved };
}

/** Which parts of a failed monthly final the gate issues point at, in plain Vietnamese. */
function monthlyFinalIssueAreas(reason: unknown): string[] {
  const details = reason && typeof reason === "object" ? (reason as { details?: unknown }).details : undefined;
  const raw = details && typeof details === "object" ? (details as { issues?: unknown }).issues : undefined;
  const texts = (Array.isArray(raw) ? raw : []).map((issue) => typeof issue === "string" ? issue : issue && typeof issue === "object" ? `${(issue as { path?: unknown }).path ?? ""} ${(issue as { message?: unknown }).message ?? ""}` : "");
  const areas: string[] = [];
  const add = (area: string) => { if (!areas.includes(area)) areas.push(area); };
  for (const text of texts) {
    if (/exact matches in this passage|spelled exactly as in this pool|read.?aloud/iu.test(text)) add("phần Đọc to (thiếu từ luyện âm)");
    if (/uniquely longest|comparable lengths/iu.test(text)) add(/reading/iu.test(text) ? "phần Đọc (đáp án đúng dài hơn các lựa chọn)" : "phần Nghe (đáp án đúng dài hơn các lựa chọn)");
  }
  return areas;
}

function monthlyFinalAiRetryMessage(reason: unknown): string {
  const areas = monthlyFinalIssueAreas(reason);
  return `AI đã thử sửa nhiều lượt nhưng đề chưa đạt${areas.length ? ` ở ${areas.join(" và ")}` : ""}. Bản nháp cũ giữ nguyên — bấm sinh lại để thử tiếp.`;
}

/** Quality misses after AI repair rounds are not breakages: show them calmly (info); keep danger for real failures. */
export function monthlyFinalGenerationTone(reason: unknown): "info" | "warn" | "danger" {
  const code = reason && typeof reason === "object" ? (reason as { code?: unknown }).code : undefined;
  if (code === "AI_OUTPUT_INVALID" || code === "MONTHLY_FINAL_GENERATION_QUALITY_FAILED") return "info";
  if (code === "MONTHLY_FINAL_EXAM_DATE_LOCKED" || code === "MONTHLY_FINAL_ALREADY_PUBLISHED" || code === "AI_PROVIDER_RATE_LIMIT") return "warn";
  return "danger";
}
