export type IdentityOtpPurpose = "pin_reset";

export interface IdentityEmailSender {
  sendOtp(input: { to: string; code: string; purpose: IdentityOtpPurpose }): Promise<void>;
}

export interface IdentityEmailConfiguration {
  apiKey: string;
  from: string;
  fromDomain: string;
}

export interface IdentityEmailDeliveryFailure {
  providerStatus: number | null;
  providerCode: string | null;
  providerMessage: string;
  requestId: string | null;
}

export class IdentityEmailDeliveryError extends Error implements IdentityEmailDeliveryFailure {
  readonly providerStatus: number | null;
  readonly providerCode: string | null;
  readonly providerMessage: string;
  readonly requestId: string | null;

  constructor(details: IdentityEmailDeliveryFailure) {
    super(`RESEND_DELIVERY_FAILED_${details.providerStatus ?? "UNKNOWN"}${details.providerCode ? `_${details.providerCode}` : ""}`);
    this.name = "IdentityEmailDeliveryError";
    this.providerStatus = details.providerStatus;
    this.providerCode = details.providerCode;
    this.providerMessage = details.providerMessage;
    this.requestId = details.requestId;
  }
}

export function readIdentityEmailConfiguration(
  environment: Record<string, string | undefined>
): IdentityEmailConfiguration | undefined {
  const apiKey = environment.RESEND_API_KEY?.trim();
  if (!apiKey) return undefined;
  const from = environment.RESEND_FROM_EMAIL?.trim();
  if (!from) throw new Error("RESEND_FROM_EMAIL is required when RESEND_API_KEY is configured");
  const fromDomain = senderDomain(from);
  if (fromDomain === "resend.dev" || fromDomain.endsWith(".resend.dev")) {
    throw new Error("RESEND_FROM_EMAIL must use a verified custom domain, not resend.dev");
  }
  return { apiKey, from, fromDomain };
}

export function identityEmailDeliveryFailure(error: unknown): IdentityEmailDeliveryFailure {
  if (error instanceof IdentityEmailDeliveryError) {
    return {
      providerStatus: error.providerStatus,
      providerCode: error.providerCode,
      providerMessage: error.providerMessage,
      requestId: error.requestId
    };
  }
  return {
    providerStatus: null,
    providerCode: "unexpected_error",
    providerMessage: "Unexpected email delivery error",
    requestId: null
  };
}

export function createResendIdentityEmailSender(input: { apiKey: string; from: string }): IdentityEmailSender {
  return {
    async sendOtp(message) {
      const subject = "Mã xác minh đổi PIN E4S";
      const heading = "Mã xác minh của bạn";
      const introduction = "Dùng mã dưới đây để đặt lại PIN cho tài khoản E4S.";
      const safetyNote = "Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email và không chia sẻ mã với bất kỳ ai.";
      const expiryNote = "Mã có hiệu lực trong 10 phút.";
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          from: input.from,
          to: [message.to],
          subject,
          text: `${heading}\n\n${introduction}\n\n${message.code}\n\n${expiryNote}\n\n${safetyNote}`,
          html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f7f1;font-family:Arial,sans-serif;color:#2f2925"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:520px;background:#ffffff;border:1px solid #e3e7df;border-radius:16px"><tr><td style="padding:32px;text-align:left;line-height:1.6"><p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.12em;color:#687260">E4S · SEASON ENGLISH</p><h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#243020">${heading}</h1><p style="margin:0 0 24px;font-size:16px;color:#4f554c">${introduction}</p><div style="padding:22px 16px;border-radius:12px;background:#f1f5ec;text-align:center"><p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;color:#687260">MÃ XÁC MINH</p><p style="margin:0;line-height:1.2;white-space:nowrap"><code style="font-family:Consolas,'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#243020">${message.code}</code></p><p style="margin:12px 0 0;font-size:14px;color:#687260">${expiryNote}</p></div><p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #e8ebe5;font-size:14px;color:#737970">${safetyNote}</p></td></tr></table><p style="margin:16px 0 0;font-size:12px;color:#858b82;text-align:center">Email tự động từ E4S. Vui lòng không trả lời email này.</p></td></tr></table>`
        })
      });
      if (!response.ok) {
        throw new IdentityEmailDeliveryError(await resendFailure(response));
      }
      const providerMessageId = await resendMessageId(response);
      if (providerMessageId) {
        console.info("[identity-email] Resend accepted email", {
          providerStatus: response.status,
          providerMessageId
        });
      }
    }
  };
}

function senderDomain(from: string): string {
  const bracketedAddress = from.match(/<([^<>]+)>\s*$/)?.[1];
  const address = (bracketedAddress ?? from).trim();
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1 || address.slice(at + 1).includes("@")) {
    throw new Error("RESEND_FROM_EMAIL must contain a valid sender email address");
  }
  return address.slice(at + 1).toLowerCase();
}

async function resendFailure(response: Response): Promise<IdentityEmailDeliveryFailure> {
  let providerCode: string | null = null;
  let providerMessage = "Resend rejected the email request";
  try {
    const body = await response.json() as { name?: unknown; code?: unknown; message?: unknown };
    providerCode = safeProviderText(body.name) ?? safeProviderText(body.code);
    providerMessage = safeProviderText(body.message) ?? providerMessage;
  } catch {
    // Some provider or proxy failures do not return JSON. Status and request ID still identify the request.
  }
  return {
    providerStatus: response.status,
    providerCode,
    providerMessage,
    requestId: response.headers.get("x-resend-request-id") ?? response.headers.get("x-request-id")
  };
}

function safeProviderText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 1_000) : null;
}

async function resendMessageId(response: Response): Promise<string | null> {
  try {
    const body = await response.json() as { id?: unknown };
    return safeProviderText(body.id);
  } catch {
    return null;
  }
}
