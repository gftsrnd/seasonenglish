import { describe, expect, it } from "vitest";
import { grammarExplanationParagraphs, grammarFormulaLines, withoutGrammarStepLabel } from "./presentation.js";

describe("grammar block presentation", () => {
  it("drops internal roadmap step labels", () => {
    expect(withoutGrammarStepLabel("Bước 3 (Lỗi thường gặp): Tìm và sửa lỗi thiếu to be.")).toBe("Tìm và sửa lỗi thiếu to be.");
    expect(withoutGrammarStepLabel("Bước 1: nhận ra am, is, are.")).toBe("Nhận ra am, is, are.");
    expect(withoutGrammarStepLabel("Step B1 (Identify): Spot the verb.")).toBe("Spot the verb.");
    expect(withoutGrammarStepLabel("Dùng am với I.")).toBe("Dùng am với I.");
  });

  it("splits a chained formula at the arrows into at most three lines and keeps labels inline", () => {
    expect(grammarFormulaLines("Subject + am/is/are + (not) + complement → Question: Am/Is/Are + subject + complement? → Short answer: Yes, subject + be / No, subject + be + not.")).toEqual([
      "Subject + am/is/are + (not) + complement",
      "Question: Am/Is/Are + subject + complement?",
      "Short answer: Yes, subject + be / No, subject + be + not."
    ]);
    expect(grammarFormulaLines("A + one pattern here → B + another pattern → C + third pattern → D + fourth pattern")).toEqual([
      "A + one pattern here",
      "B + another pattern",
      "C + third pattern → D + fourth pattern"
    ]);
  });

  it("leaves short formulas and in-pattern arrows on one line", () => {
    expect(grammarFormulaLines("I am / He is / They are + danh từ")).toEqual(["I am / He is / They are + danh từ"]);
    expect(grammarFormulaLines("Verb → verb + -ing after enjoy, finish, suggest, mind and avoid")).toEqual(["Verb → verb + -ing after enjoy, finish, suggest, mind and avoid"]);
  });

  it("keeps the explanation to at most two paragraphs with the tip on its own line", () => {
    expect(grammarExplanationParagraphs(
      "Tìm và sửa lỗi thiếu to be hoặc dùng sai dạng am/is/are trong các câu giới thiệu.",
      "Tiếng Việt không dùng to be trong câu như 'Tôi là nhân viên', nên dễ quên. Hãy kiểm tra chủ ngữ: I dùng am, he/she/it dùng is, we/you/they dùng are."
    )).toEqual([
      "Tìm và sửa lỗi thiếu to be hoặc dùng sai dạng am/is/are trong các câu giới thiệu. Hãy kiểm tra chủ ngữ: I dùng am, he/she/it dùng is, we/you/they dùng are.",
      "Tiếng Việt không dùng to be trong câu như 'Tôi là nhân viên', nên dễ quên."
    ]);
    // Without a tip sentence nothing is split further: never one sentence per line.
    expect(grammarExplanationParagraphs("Nhận ra am, is, are.", "I dùng am; he, she, it dùng is. Hãy để ý các dạng này.")).toEqual(["Nhận ra am, is, are.", "I dùng am; he, she, it dùng is. Hãy để ý các dạng này."]);
    expect(grammarExplanationParagraphs(undefined, "Dùng am với I. Lưu ý: không bỏ to be.")).toEqual(["Dùng am với I.", "Lưu ý: không bỏ to be."]);
    expect(grammarExplanationParagraphs(undefined, "Trả lời ngắn Yes, I am. hoặc No, he isn't. để phản hồi nhanh.")).toEqual(["Trả lời ngắn Yes, I am. hoặc No, he isn't. để phản hồi nhanh."]);
    expect(grammarExplanationParagraphs(undefined, "")).toEqual([]);
  });
});
