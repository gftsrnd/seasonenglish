/**
 * The one place a thrown error becomes text for a person. Every toast (and inline error) built from a caught
 * error goes through here, so a raw system code such as "HTTP_500" is never the message someone reads:
 *   1. a known code (the caller's own table first, then the shared one) maps to Vietnamese text;
 *   2. otherwise the server's own message is used when it is user-safe Vietnamese;
 *   3. otherwise an Error whose message is already a Vietnamese sentence is shown as is;
 *   4. otherwise the generic text below, with the code kept aside (`code`) for a tooltip, never as the text.
 */
export const GENERIC_ERROR_MESSAGE = "Có lỗi xảy ra, vui lòng thử lại.";

export const commonErrorMessages: Readonly<Record<string, string>> = {
  NETWORK_UNAVAILABLE: "Không thể kết nối tới E4S. Kiểm tra mạng rồi thử lại.",
  API_INVALID_RESPONSE: "Máy chủ trả về dữ liệu không đọc được. Vui lòng thử lại.",
  INTERNAL_ERROR: GENERIC_ERROR_MESSAGE,
  REQUEST_INVALID: "Dữ liệu gửi lên chưa hợp lệ. Hãy kiểm tra lại rồi thử lại.",
  HTTP_400: "Dữ liệu gửi lên chưa hợp lệ. Hãy kiểm tra lại rồi thử lại.",
  HTTP_401: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
  HTTP_403: "Bạn không có quyền thực hiện thao tác này.",
  HTTP_404: "Không tìm thấy dữ liệu cần dùng. Hãy tải lại trang.",
  HTTP_409: "Dữ liệu vừa được thay đổi ở nơi khác. Hãy tải lại trang rồi thử lại.",
  HTTP_413: "Tệp hoặc dữ liệu gửi lên quá lớn.",
  HTTP_429: "Hệ thống đang nhận quá nhiều yêu cầu; hãy thử lại sau một chút.",
  HTTP_500: GENERIC_ERROR_MESSAGE,
  HTTP_502: "Máy chủ tạm thời không phản hồi. Vui lòng thử lại sau ít phút.",
  HTTP_503: "Máy chủ tạm thời không phản hồi. Vui lòng thử lại sau ít phút.",
  HTTP_504: "Máy chủ phản hồi quá lâu. Vui lòng thử lại sau ít phút.",
  AI_UNAVAILABLE: "AI hiện không khả dụng. Vui lòng thử lại sau.",
  AI_OUTPUT_INVALID: "AI trả về nội dung chưa đạt. Hãy thử lại.",
  AI_TIMEOUT: "AI phản hồi quá lâu. Hãy thử lại."
};

export interface ErrorFeedback {
  /** Text a person reads: always Vietnamese, never a bare code. */
  message: string;
  /** The underlying code when the text is a fallback, for a tooltip or a staff view only. */
  code?: string;
}

const CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/u;
const VIETNAMESE_LETTER = /[À-ỹĐđ]/u;
const TECHNICAL_TEXT = /(\bat\s+\S+\s*\(|\bError:|[{}<>]|https?:\/\/|\bstack\b|\bundefined\b|\bnull\b|\bSQL\b|ECONN|FST_ERR)/u;

/** True when a server or Error message can be shown as is: a short Vietnamese sentence, not a trace or a code. */
export function isUserSafeMessage(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const text = value.trim();
  return text.length > 0 && text.length <= 400 && !CODE_PATTERN.test(text) && VIETNAMESE_LETTER.test(text) && !TECHNICAL_TEXT.test(text);
}

/** The machine code an error carries (ApiError.code, an Error whose message is a code), if any. */
export function errorCode(reason: unknown): string | undefined {
  if (reason && typeof reason === "object" && "code" in reason) {
    const code = (reason as { code?: unknown }).code;
    if (typeof code === "string" && CODE_PATTERN.test(code)) return code;
  }
  const text = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : undefined;
  return text && CODE_PATTERN.test(text) ? text : undefined;
}

function serverMessage(reason: unknown): unknown {
  const details = reason && typeof reason === "object" && "details" in reason ? (reason as { details?: unknown }).details : undefined;
  return details && typeof details === "object" && "message" in details ? (details as { message?: unknown }).message : undefined;
}

/** Text plus the code kept aside. `known` is a screen's own code table; it wins over the shared one. */
/** `fallback` replaces the generic text when the screen has a more specific one ("Không công bố được tháng."). */
export function errorFeedback(reason: unknown, known: Readonly<Record<string, string>> = {}, fallback = GENERIC_ERROR_MESSAGE): ErrorFeedback {
  const raw = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
  const code = errorCode(reason);
  for (const key of [raw, code]) {
    if (key && Object.prototype.hasOwnProperty.call(known, key)) return { message: known[key]! };
  }
  // The API's error handler already replaces every unexpected 5xx message with the generic text.
  const server = serverMessage(reason);
  if (isUserSafeMessage(server)) return server.trim() === GENERIC_ERROR_MESSAGE && code ? { message: GENERIC_ERROR_MESSAGE, code } : { message: server.trim() };
  for (const key of [raw, code]) {
    if (key && Object.prototype.hasOwnProperty.call(commonErrorMessages, key)) {
      const message = commonErrorMessages[key]!;
      return message === GENERIC_ERROR_MESSAGE && code ? { message, code } : { message };
    }
  }
  if (isUserSafeMessage(raw)) return { message: raw.trim() };
  return code ? { message: fallback, code } : { message: fallback };
}

export function errorMessage(reason: unknown, known?: Readonly<Record<string, string>>, fallback?: string): string {
  return errorFeedback(reason, known, fallback).message;
}

/** Toast fields for a failure: the text, plus the code as a tooltip ("Mã lỗi: HTTP_500") when the text is generic. */
export function errorToast(reason: unknown, known?: Readonly<Record<string, string>>): { message: string; tone: "danger"; detail?: string } {
  const feedback = errorFeedback(reason, known);
  return feedback.code ? { message: feedback.message, tone: "danger", detail: `Mã lỗi: ${feedback.code}` } : { message: feedback.message, tone: "danger" };
}
