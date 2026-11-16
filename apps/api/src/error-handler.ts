import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/** The text every unexpected (5xx) failure carries; the web shows it as is. */
export const GENERIC_SERVER_ERROR_MESSAGE = "Có lỗi xảy ra, vui lòng thử lại.";
const INVALID_REQUEST_MESSAGE = "Dữ liệu gửi lên chưa hợp lệ. Hãy kiểm tra lại rồi thử lại.";

export interface ApiErrorBody {
  code: string;
  message: string;
  issues?: unknown;
}

type ErrorLogger = (entry: Record<string, unknown>) => void;

/** An application code ("AI_OUTPUT_INVALID"), as opposed to a Fastify/Node one ("FST_ERR_…", "ECONNREFUSED"). */
function applicationCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/u.test(code) && !/^(FST|ERR)_/u.test(code);
}

function statusOf(error: FastifyError): number {
  const status = error.statusCode ?? (error as { status?: unknown }).status;
  return typeof status === "number" && status >= 400 && status <= 599 ? status : 500;
}

/** The `{ code, message }` body for a thrown error. Pure, so the shape is unit-tested without a server. */
export function apiErrorBody(error: FastifyError): { status: number; body: ApiErrorBody } {
  const status = statusOf(error);
  if (status >= 500) {
    // Never leak an internal message (SQL, stack, provider text): the code survives only when it is an app code.
    return { status, body: { code: applicationCode(error.code) ? error.code : "INTERNAL_ERROR", message: GENERIC_SERVER_ERROR_MESSAGE } };
  }
  if (error.validation) return { status, body: { code: "REQUEST_INVALID", message: INVALID_REQUEST_MESSAGE } };
  const code = applicationCode(error.code) ? error.code : `HTTP_${status}`;
  const issues = (error as { issues?: unknown }).issues;
  return { status, body: { code, message: error.message || INVALID_REQUEST_MESSAGE, ...(issues === undefined ? {} : { issues }) } };
}

const defaultLogger: ErrorLogger = (entry) => { console.error("[api] request failed", entry); };

/**
 * Every error that reaches Fastify (a thrown route error, a schema validation, a body parse failure) answers
 * `{ code, message }`. A 5xx always gets the generic Vietnamese message and is logged with its details;
 * Fastify's default (`{ statusCode, error, message }` with no app code) made the web show "HTTP_500".
 */
export function registerApiErrorHandler(app: FastifyInstance, log: ErrorLogger = defaultLogger) {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const { status, body } = apiErrorBody(error);
    if (status >= 500) {
      log({ method: request.method, url: request.url, status, code: error.code ?? null, message: error.message, stack: error.stack });
    }
    return reply.code(status).send(body);
  });
}
