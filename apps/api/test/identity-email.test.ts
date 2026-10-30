import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createResendIdentityEmailSender,
  IdentityEmailDeliveryError,
  readIdentityEmailConfiguration
} from "../src/modules/identity/email.js";

describe("identity email template", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a concise PIN reset email without repeating the request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const sender = createResendIdentityEmailSender({
      apiKey: "test-key",
      from: "E4S <no-reply@e4s.gfts.vn>"
    });
    await sender.sendOtp({ to: "learner@example.com", code: "313020", purpose: "pin_reset" });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as {
      subject: string;
      text: string;
      html: string;
    };

    expect(payload.subject).toBe("Mã xác minh đổi PIN E4S");
    expect(payload.text).toContain("Mã xác minh của bạn");
    expect(payload.text).toContain("Dùng mã dưới đây để đặt lại PIN cho tài khoản E4S.");
    expect(payload.text).toContain("Mã có hiệu lực trong 10 phút.");
    expect(payload.text).toContain("Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email và không chia sẻ mã với bất kỳ ai.");
    expect(payload.text).not.toContain("E4S đã nhận được yêu cầu");
    expect(payload.text).not.toContain("Xác nhận yêu cầu đổi mã PIN");
    expect(payload.html).toContain("313020");
    expect(payload.html).toContain('role="presentation"');
    expect(payload.html).toContain('align="center"');
    expect(payload.html).toContain('<td align="center" style="padding:32px 12px"');
    expect(payload.html).toContain("max-width:520px");
    expect(payload.html).toContain("text-align:center");
  });

  it("renders a clean verification code without copy controls or copy instructions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const sender = createResendIdentityEmailSender({
      apiKey: "test-key",
      from: "E4S <no-reply@e4s.gfts.vn>"
    });
    await sender.sendOtp({ to: "learner@example.com", code: "478338", purpose: "pin_reset" });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as { html: string };

    expect(payload.html).toMatch(/<code[^>]*>478338<\/code>/);
    expect(payload.html).not.toMatch(/aria-label=["'][^"']*sao chép|title=["'][^"']*sao chép|biểu tượng sao chép|&#10697;/i);
    expect(payload.html).not.toMatch(/bôi đen|chọn mã|sao chép|copy|clipboard/i);
    expect(payload.html).not.toMatch(/<script|javascript:|\son(?:click|copy|mousedown)=/i);
  });

  it("loads the configured custom sender instead of falling back to resend.dev", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const configuration = readIdentityEmailConfiguration({
      RESEND_API_KEY: "test-key",
      RESEND_FROM_EMAIL: "  E4S <no-reply@e4s.gfts.vn>  "
    });

    expect(configuration).toEqual({
      apiKey: "test-key",
      from: "E4S <no-reply@e4s.gfts.vn>",
      fromDomain: "e4s.gfts.vn"
    });
    await createResendIdentityEmailSender(configuration!).sendOtp({
      to: "learner@example.com",
      code: "123456",
      purpose: "pin_reset"
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ from: "E4S <no-reply@e4s.gfts.vn>" });
  });

  it("refuses a missing or Resend testing sender when an API key is configured", () => {
    expect(() => readIdentityEmailConfiguration({ RESEND_API_KEY: "test-key" }))
      .toThrow("RESEND_FROM_EMAIL is required");
    expect(() => readIdentityEmailConfiguration({
      RESEND_API_KEY: "test-key",
      RESEND_FROM_EMAIL: "E4S <onboarding@resend.dev>"
    })).toThrow("verified custom domain");
  });

  it("preserves safe Resend rejection details for server diagnostics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "validation_error",
      message: "The e4s.gfts.vn domain is not verified."
    }), {
      status: 403,
      headers: { "x-resend-request-id": "request-123", "content-type": "application/json" }
    })));
    const sender = createResendIdentityEmailSender({
      apiKey: "secret-that-must-not-appear",
      from: "E4S <no-reply@e4s.gfts.vn>"
    });

    const failure = await sender.sendOtp({ to: "learner@example.com", code: "123456", purpose: "pin_reset" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(IdentityEmailDeliveryError);
    expect(failure).toMatchObject({
      providerStatus: 403,
      providerCode: "validation_error",
      providerMessage: "The e4s.gfts.vn domain is not verified.",
      requestId: "request-123"
    });
    expect(String(failure)).not.toContain("secret-that-must-not-appear");
  });

  it("logs the provider status and message id after Resend accepts the email", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "resend-message-789" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })));
    const diagnostic = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const sender = createResendIdentityEmailSender({
      apiKey: "secret-that-must-not-appear",
      from: "E4S <no-reply@e4s.gfts.vn>"
    });

    try {
      await sender.sendOtp({ to: "external.learner@gmail.com", code: "654321", purpose: "pin_reset" });

      expect(diagnostic).toHaveBeenCalledWith("[identity-email] Resend accepted email", {
        providerStatus: 200,
        providerMessageId: "resend-message-789"
      });
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain("secret-that-must-not-appear");
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain("external.learner@gmail.com");
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain("654321");
    } finally {
      diagnostic.mockRestore();
    }
  });
});
