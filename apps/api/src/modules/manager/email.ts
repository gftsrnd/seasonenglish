export interface ReminderEmailSender {
  sendReminder(input: { to: string; learnerName: string; message: string }): Promise<{ externalId: string | null }>;
}

export function createResendReminderEmailSender(input: { apiKey: string; from: string }): ReminderEmailSender {
  return {
    async sendReminder(message) {
      const safeName = escapeHtml(message.learnerName);
      const safeMessage = escapeHtml(message.message);
      const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f1e9;color:#2f2925;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f1e9;padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5ded2;border-radius:18px;overflow:hidden"><tr><td style="height:8px;background:#ef9634"></td></tr><tr><td style="padding:34px 38px 16px"><div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#7a725f">E4S · SEASON ENGLISH</div><h1 style="margin:12px 0 8px;font-size:28px;line-height:1.25;color:#243021">Cùng tiếp tục mục tiêu tuần nhé</h1><p style="margin:0;color:#746d63;font-size:15px">Một bước nhỏ hôm nay sẽ giúp nhịp học không bị ngắt quãng.</p></td></tr><tr><td style="padding:12px 38px 8px"><div style="background:#fff4df;border:1px solid #f4d19a;border-radius:14px;padding:20px"><p style="margin:0 0 10px;font-size:16px">Chào <strong>${safeName}</strong>,</p><p style="margin:0;font-size:16px;line-height:1.65">${safeMessage}</p></div></td></tr><tr><td style="padding:18px 38px 34px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="38" style="font-size:24px">✓</td><td><strong style="font-size:14px">Gợi ý cho hôm nay</strong><div style="margin-top:4px;color:#746d63;font-size:14px;line-height:1.5">Mở E4S và hoàn thành một phần học ngắn để nối lại tiến độ tuần.</div></td></tr></table><p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #ece7df;color:#8a8378;font-size:12px;line-height:1.5">Email này được gửi tự động từ E4S để hỗ trợ tiến độ học tập của bạn.</p></td></tr></table></td></tr></table></body></html>`;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          from: input.from,
          to: [message.to],
          subject: "Nhắc học từ E4S",
          text: `Chào ${message.learnerName},\n\n${message.message}`,
          html
        })
      });
      if (!response.ok) throw new Error("RESEND_REMINDER_DELIVERY_FAILED");
      const payload = await response.json().catch(() => null) as { id?: unknown } | null;
      return { externalId: typeof payload?.id === "string" ? payload.id : null };
    }
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
