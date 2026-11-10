import { expect, it } from "vitest";
import { monthlyGenerationMessage,monthlyFinalGenerationMessage } from "./monthly-generation-message.js";
it("distinguishes rejected structure from a failed quality check without exposing validator details", () => {
  const message = monthlyGenerationMessage({ code:"AI_OUTPUT_INVALID",details:{issues:[{component:"grammar",path:"lesson.parts.0.content",message:"sensitive provider output"}]}});
  expect(message).toContain("chưa đúng cấu trúc ở phần Ngữ pháp");
  expect(message).not.toMatch(/sensitive|lesson.parts|AI_OUTPUT/);
  expect(monthlyGenerationMessage({code:"MONTHLY_GENERATION_QUALITY_FAILED",details:{report:{severe:[{component:"pronunciation"},{component:"pronunciation"}]}}})).toContain("chưa đạt yêu cầu ở phần Phát âm");
});
it("shows actionable timeout and provider limit notices", () => {
  expect(monthlyGenerationMessage({code:"AI_TIMEOUT"})).toContain("phản hồi quá lâu");
  expect(monthlyGenerationMessage({code:"AI_PROVIDER_RATE_LIMIT"})).toContain("chờ rồi thử lại");
});
it("reports monthly exam content failures and preserves the current draft",()=>{
  expect(monthlyFinalGenerationMessage({code:"MONTHLY_FINAL_GENERATION_QUALITY_FAILED",details:{report:{checks:[{code:"GEN11"},{code:"GEN22"}]}}})).toBe("Đề mới chưa đạt yêu cầu về từ luyện âm, độ dài và level. Chưa thay bản nháp hiện có; hãy thử sinh lại.");
  expect(monthlyFinalGenerationMessage({code:"AI_OUTPUT_INVALID"})).not.toContain("ngày thi");
});
