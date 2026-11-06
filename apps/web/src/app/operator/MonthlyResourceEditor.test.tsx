// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MonthFrameworkView, MonthlyResourceEditInput } from "@e4s/contracts";
import { MonthlyResourceEditor } from "./MonthlyResourceEditor.js";

type Resources = NonNullable<MonthFrameworkView["resources"]>;

const resources: Resources = {
  coreTerms: [
    { id: "a2-core-1", word: "budget", meaning: "ngân sách", type: "noun", ipa: "/ˈbʌdʒɪt/", source: "core_registry", component: "core" },
    { id: "a2-core-2", word: "approve", meaning: "phê duyệt", type: "verb", ipa: "/əˈpruːv/", source: "core_registry", component: "core" }
  ],
  supportTerms: [
    { id: "a2-expanded-1", word: "finance", meaning: "tài chính", type: "noun", relation: "umbrella", source: "group", component: "expanded", relatedCoreTermId: "a2-core-1" },
    { id: "a2-expanded-2", word: "funds", meaning: "quỹ", type: "noun", relation: "synonym", source: "synonym", component: "expanded", relatedCoreTermId: "a2-core-1", cefr: "B1" },
    { id: "a2-expanded-3", word: "budgetary", meaning: "thuộc ngân sách", type: "adjective", relation: "word_family", source: "family", component: "expanded", relatedCoreTermId: "a2-core-1" },
    { id: "a2-expanded-4", word: "accept", meaning: "chấp nhận", type: "verb", relation: "synonym", source: "synonym", component: "expanded", relatedCoreTermId: "a2-core-2" },
    { id: "a2-expanded-5", word: "approval", meaning: "sự phê duyệt", type: "noun", relation: "word_family", source: "family", component: "expanded", relatedCoreTermId: "a2-core-2" },
    { id: "a2-expanded-6", word: "reject", meaning: "từ chối", type: "verb", relation: "antonym", source: "antonym", component: "expanded", relatedCoreTermId: "a2-core-2" }
  ],
  grammarTopics: [{ id: "a2-grammar-1", title: "Present simple", steps: [{ id: "a2-grammar-1-step-1", focus: "Form", formula: "S + V(s)", usage: "Routines", examples: ["I check.", "She checks.", "We check."] }] }],
  sounds: [{ id: "a2-sound-1", ipa: "/ɪ/", label: "Short i", examples: [{ id: "a2-sound-1-word-1", word: "bit", ipa: "/bɪt/" }] }]
};

function renderEditor(onSave = vi.fn<(input: MonthlyResourceEditInput) => Promise<void>>().mockResolvedValue(undefined), onClose = vi.fn()) {
  render(<MonthlyResourceEditor cefr="A2" version={4} resources={resources} onSave={onSave} onClose={onClose} />);
  return { dialog: within(screen.getByRole("dialog", { name: "Sửa tay tài nguyên A2" })), onSave, onClose };
}

describe("MonthlyResourceEditor", () => {
  afterEach(() => cleanup());

  it("edits a core in place, removes and adds supports, and saves the whole pool with the opened version", async () => {
    const user = userEvent.setup();
    const { dialog, onSave } = renderEditor();
    expect(dialog.getByText(/2 từ cốt lõi \(cố định\)/u)).toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: /Thêm từ cốt lõi/u })).not.toBeInTheDocument();

    const word = dialog.getByLabelText("Từ cốt lõi 1");
    await user.clear(word);
    await user.type(word, "invoice");
    await user.selectOptions(dialog.getByLabelText("Từ loại 2"), "adjective");

    await user.click(dialog.getByText("invoice"));
    await user.click(dialog.getByRole("button", { name: "Xóa từ mở rộng funds" }));
    await user.click(dialog.getAllByRole("button", { name: "Thêm từ mở rộng" })[0]!);
    const newWord = dialog.getByLabelText("Từ mở rộng 3 của invoice");
    await user.type(newWord, "bill");
    await user.type(dialog.getByLabelText("Nghĩa từ mở rộng 3 của invoice"), "hóa đơn");
    await user.type(dialog.getByLabelText("Từ loại từ mở rộng 3 của invoice"), "noun");
    await user.selectOptions(dialog.getByLabelText("CEFR từ mở rộng 3 của invoice"), "A2");

    await user.clear(dialog.getByLabelText("Ví dụ chủ điểm 1 bước 1"));
    await user.type(dialog.getByLabelText("Ví dụ chủ điểm 1 bước 1"), "One.{Enter}Two.{Enter}Three.");
    await user.click(dialog.getByRole("button", { name: "Thêm từ ví dụ" }));
    await user.type(dialog.getByLabelText("Từ ví dụ 2 của mục tiêu 1"), "sit");
    await user.type(dialog.getByLabelText("IPA từ ví dụ 2 của mục tiêu 1"), "/sɪt/");

    await user.click(dialog.getByRole("button", { name: "Lưu bản nháp" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const input = onSave.mock.calls[0]![0];
    expect(input.expectedVersion).toBe(4);
    expect(input.coreTerms).toEqual([
      { id: "a2-core-1", word: "invoice", type: "noun", meaning: "ngân sách", ipa: "/ˈbʌdʒɪt/" },
      { id: "a2-core-2", word: "approve", type: "adjective", meaning: "phê duyệt", ipa: "/əˈpruːv/" }
    ]);
    expect(input.supportTerms.map((term) => term.id)).not.toContain("a2-expanded-2");
    const added = input.supportTerms.find((term) => term.word === "bill");
    expect(added).toMatchObject({ meaning: "hóa đơn", type: "noun", relation: "synonym", relatedCoreTermId: "a2-core-1", cefr: "A2" });
    expect(added!.id).toMatch(/^a2-expanded-m/u);
    expect(input.grammarTopics[0]!.steps[0]!.examples).toEqual(["One.", "Two.", "Three."]);
    expect(input.sounds[0]!.examples).toHaveLength(2);
    expect(input.sounds[0]!.examples[1]).toMatchObject({ word: "sit", ipa: "/sɪt/" });
  });

  it("shows server issues on the matching line and opens the affected core", async () => {
    const user = userEvent.setup();
    const error = Object.assign(new Error("MONTHLY_RESOURCE_EDIT_INVALID"), {
      details: {
        code: "MONTHLY_RESOURCE_EDIT_INVALID",
        issues: [
          { section: "coreTerms", rowId: "a2-core-2", field: "supports", message: "Cần 3–9 từ mở rộng (hiện có 2)." },
          { section: "supportTerms", rowId: "a2-expanded-5", field: "meaning", message: "Nghĩa tiếng Việt không được để trống." },
          { section: "sounds", rowId: "a2-sound-1-word-1", field: "word", message: "Từ ví dụ phát âm tối đa 3 âm tiết." },
          { section: "pool", message: "Tổng từ mở rộng phải trong khoảng 6–18 (hiện có 5)." }
        ]
      }
    });
    const { dialog, onClose } = renderEditor(vi.fn().mockRejectedValue(error));
    await user.click(dialog.getByRole("button", { name: "Lưu bản nháp" }));

    expect(dialog.getByText("Chưa lưu: còn 4 lỗi cần sửa.")).toBeInTheDocument();
    expect(dialog.getByText("Tổng từ mở rộng phải trong khoảng 6–18 (hiện có 5).")).toBeInTheDocument();
    expect(dialog.getByText("Cần 3–9 từ mở rộng (hiện có 2).")).toBeInTheDocument();
    // The second core is opened so its support line and error are visible.
    expect(dialog.getByLabelText("Nghĩa từ mở rộng 2 của approve")).toHaveAttribute("aria-invalid", "true");
    expect(dialog.getByText("Nghĩa tiếng Việt không được để trống.")).toBeInTheDocument();
    expect(dialog.getByLabelText("Từ ví dụ 1 của mục tiêu 1")).toHaveAttribute("aria-invalid", "true");
    expect(dialog.getByText("2 lỗi")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("explains a stale version without row issues", async () => {
    const user = userEvent.setup();
    const { dialog } = renderEditor(vi.fn().mockRejectedValue(new Error("MONTHLY_FRAMEWORK_VERSION_CONFLICT")));
    await user.click(dialog.getByRole("button", { name: "Lưu bản nháp" }));
    expect(dialog.getByRole("alert")).toHaveTextContent("Tài nguyên đã thay đổi ở nơi khác");
  });

  it("cancels without saving", async () => {
    const user = userEvent.setup();
    const { dialog, onSave, onClose } = renderEditor();
    await user.click(dialog.getByRole("button", { name: "Hủy" }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
