export type IdentityOtpPurpose = "registration" | "pin_reset";

export interface IdentityEmailSender {
  sendOtp(input: { to: string; code: string; purpose: IdentityOtpPurpose }): Promise<void>;
}

export function createResendIdentityEmailSender(input: { apiKey: string; from: string }): IdentityEmailSender {
  return {
    async sendOtp(message) {
      const registration = message.purpose === "registration";
      const subject = registration ? "Xác minh tài khoản E4S" : "Xác nhận đổi mã PIN E4S";
      const heading = registration ? "Xác minh tài khoản của bạn" : "Xác nhận yêu cầu đổi mã PIN";
      const introduction = registration
        ? "Vui lòng nhập mã dưới đây để hoàn tất việc tạo tài khoản E4S."
        : "E4S đã nhận được yêu cầu đổi mã PIN cho tài khoản của bạn. Vui lòng nhập mã dưới đây để tiếp tục.";
      const safetyNote = registration
        ? "Nếu bạn không tạo tài khoản E4S, bạn có thể bỏ qua email này."
        : "Nếu bạn không yêu cầu đổi mã PIN, hãy bỏ qua email này. Mã PIN hiện tại của bạn sẽ không thay đổi.";
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
          text: `${heading}\n\n${introduction}\n\nMã xác minh: ${message.code}\n\nMã này có hiệu lực trong 10 phút.\n\n${safetyNote}\nVì lý do bảo mật, không chia sẻ mã này với bất kỳ ai.`,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#2f2925"><h2 style="margin:0 0 16px">${heading}</h2><p>${introduction}</p><p style="margin:24px 0 8px;color:#756b63">Mã xác minh</p><p style="margin:0 0 24px;font-size:30px;font-weight:700;letter-spacing:10px">${message.code}</p><p>Mã này có hiệu lực trong 10 phút.</p><p style="color:#756b63">${safetyNote}<br>Vì lý do bảo mật, không chia sẻ mã này với bất kỳ ai.</p></div>`
        })
      });
      if (!response.ok) throw new Error(`RESEND_DELIVERY_FAILED_${response.status}`);
    }
  };
}
