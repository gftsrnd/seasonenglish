import { expect, it } from "vitest";
import { monthlyGenerationMessage,monthlyFinalGenerationMessage, monthlyFinalGenerationTone } from "./monthly-generation-message.js";
it("distinguishes rejected structure from a failed quality check without exposing validator details", () => {
  const message = monthlyGenerationMessage({ code:"AI_OUTPUT_INVALID",details:{issues:[{component:"grammar",path:"lesson.parts.0.content",message:"sensitive provider output"}]}});
  expect(message).toContain("chưa đúng cấu trúc ở phần Ngữ pháp");
  expect(message).not.toMatch(/sensitive|lesson.parts|AI_OUTPUT/);
  expect(monthlyGenerationMessage({code:"MONTHLY_GENERATION_QUALITY_FAILED",details:{report:{severe:[{component:"pronunciation"},{component:"pronunciation"}]}}})).toContain("chưa đạt yêu cầu ở phần Phát âm");
  expect(monthlyGenerationMessage({code:"MONTHLY_GENERATION_QUALITY_FAILED",details:{report:{severe:[{component:"grammar"}]}}})).toContain("Bản nháp hiện có vẫn được giữ");
  expect(monthlyGenerationMessage({code:"MONTHLY_DAY_ALREADY_APPROVED"})).toContain("Yêu cầu mở lại");
});
it("shows actionable timeout and provider limit notices", () => {
  expect(monthlyGenerationMessage({code:"AI_TIMEOUT"})).toContain("phản hồi quá lâu");
  expect(monthlyGenerationMessage({code:"AI_PROVIDER_RATE_LIMIT"})).toContain("chờ rồi thử lại");
});
it("reports monthly exam content failures and preserves the current draft",()=>{
  expect(monthlyFinalGenerationMessage({code:"MONTHLY_FINAL_GENERATION_QUALITY_FAILED",details:{report:{checks:[{code:"GEN11"},{code:"GEN22"}]}}})).toBe("AI đã thử sửa nhiều lượt nhưng đề chưa đạt về từ luyện âm, độ dài và level. Bản nháp cũ giữ nguyên — bấm sinh lại để thử tiếp.");
  expect(monthlyFinalGenerationMessage({code:"AI_OUTPUT_INVALID"})).not.toContain("ngày thi");
});

import { monthlyResourceGenerationNotice } from "./monthly-generation-message.js";
const budget = "Đã dùng hết 400 lượt gọi AI cho lần này; phần đã làm được đã lưu (240 từ mở rộng). Bấm Tiếp tục để sinh tiếp.";
it("shows the server's budget-cap message as a calm info notice without suggesting manual editing", () => {
  const notice = monthlyResourceGenerationNotice({ code: "MONTHLY_RESOURCE_PLAN_INVALID", details: { issues: [budget, "Core vocabulary generation saved 54 of 54"], progressSaved: true, failedAttempts: 1 } });
  expect(notice).toEqual({ message: budget, tone: "info", progressSaved: true });
  expect(notice.message).not.toMatch(/soạn tay/iu);
});
it("suggests manual completion only from the 3rd unfinished run in a row, still not red", () => {
  const partial = "Đã sinh thêm một phần (243 từ mở rộng). Bấm Tiếp tục để sinh tiếp.";
  expect(monthlyResourceGenerationNotice({ code: "MONTHLY_RESOURCE_PLAN_INVALID", details: { issues: [partial], progressSaved: true, failedAttempts: 2 } }).message).toBe(partial);
  const third = monthlyResourceGenerationNotice({ code: "MONTHLY_RESOURCE_PLAN_INVALID", details: { issues: [partial], progressSaved: true, failedAttempts: 3 } });
  expect(third).toMatchObject({ tone: "info", message: `${partial} Đã thử 3 lần chưa xong — có thể soạn tay phần còn thiếu.` });
});
it("never shows English validator text; partial progress without a known message gets the neutral wording", () => {
  const notice = monthlyResourceGenerationNotice({ code: "MONTHLY_RESOURCE_PLAN_INVALID", details: { issues: ["Grammar phase failed after 3 attempts: x"], progressSaved: true, failedAttempts: 1 } });
  expect(notice).toMatchObject({ tone: "info", message: "Đã sinh thêm một phần. Bấm Tiếp tục để sinh tiếp." });
});
it("maps AI provider throttling and blocking to a warn notice with the reason", () => {
  expect(monthlyResourceGenerationNotice({ code: "AI_PROVIDER_RATE_LIMIT", status: 429, details: { code: "AI_PROVIDER_RATE_LIMIT" } })).toMatchObject({ tone: "warn", message: "Nhà cung cấp AI đang giới hạn tốc độ; chưa tốn lượt sinh. Thử lại sau ít phút." });
  expect(monthlyResourceGenerationNotice({ code: "AI_PROVIDER_REJECTED", details: { progressSaved: true } }).tone).toBe("warn");
  expect(monthlyResourceGenerationNotice({ code: "NETWORK_UNAVAILABLE" }).tone).toBe("warn");
});
it("uses the red tone only when the server broke and nothing was saved", () => {
  expect(monthlyResourceGenerationNotice({ code: "HTTP_500", status: 500 }).tone).toBe("danger");
  expect(monthlyResourceGenerationNotice({ code: "HTTP_500", status: 500, details: { progressSaved: true } }).tone).toBe("info");
});

it("explains a failed monthly final calmly and names the parts", () => {
  const reason = { code: "AI_OUTPUT_INVALID", details: { code: "AI_OUTPUT_INVALID", issues: [
    { code: "AI_OUTPUT_INVALID", path: "candidates", message: "P2 has no exact matches in this passage. Use TWO different words spelled exactly as in this pool: called." },
    { code: "AI_OUTPUT_INVALID", path: "listening.messages", message: "The correct option is uniquely longest for 6/11 questions." }
  ] } };
  expect(monthlyFinalGenerationMessage(reason)).toBe("AI đã thử sửa nhiều lượt nhưng đề chưa đạt ở phần Đọc to (thiếu từ luyện âm) và phần Nghe (đáp án đúng dài hơn các lựa chọn). Bản nháp cũ giữ nguyên — bấm sinh lại để thử tiếp.");
  expect(monthlyFinalGenerationTone(reason)).toBe("info");
  expect(monthlyFinalGenerationTone({ code: "INTERNAL" })).toBe("danger");
});
