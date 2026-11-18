// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssessmentBankFormDetail, AssessmentBankScope, AssessmentBankView } from "@e4s/contracts";
import { AssessmentBank } from "./AssessmentBank.js";
import { ModalProvider } from "../shared/ModalProvider.js";

afterEach(cleanup);
const bank: AssessmentBankView = {
  scope: "placement", desiredCount: 3,
  forms: [
    { versionId: "one", title: "Bộ legacy", version: 1, status: "published", legacy: true },
    { versionId: "two", title: "Bộ mới", version: 1, status: "published", legacy: false },
    { versionId: "draft", title: "Bộ đang sửa", version: 1, status: "draft", legacy: false }
  ], policy: { mode: "single", sourceCount: 1, versionIds: ["one"] }
};
function setup(view = bank, readOnly = false) {
  const save = vi.fn().mockImplementation(async (_scope, policy) => ({ ...view, policy }));
  const client = {
    getAssessmentBank: vi.fn().mockResolvedValue(view), saveAssessmentBankPolicy: save,
    createAssessmentBankForm: vi.fn(), getAssessmentBankForm: vi.fn(), updateAssessmentBankForm: vi.fn(),
    validateAssessmentBankForm: vi.fn(), publishAssessmentBankForm: vi.fn(), archiveAssessmentBankForm: vi.fn(), deleteAssessmentBankForm: vi.fn()
  };
  render(<ModalProvider><AssessmentBank scope={view.scope} client={client} readOnly={readOnly} /></ModalProvider>);
  return { save, client, user: userEvent.setup() };
}
describe("assessment bank delivery dialog", () => {
  it("distinguishes configured, approved, draft and archived forms with explicit state labels", async () => {
    const archived = { ...bank.forms[0]!, versionId: "archived", title: "Bộ lưu trữ", status: "archived" as const, canDelete: false };
    const { user } = setup({ ...bank, forms: [...bank.forms, archived] });
    await screen.findByText("Bộ legacy");
    const row = (title: string) => within(screen.getByText(title, { exact: true }).closest("article")!);
    expect(row("Bộ legacy").getByText("Đang dùng", { exact: true })).toBeInTheDocument();
    expect(row("Bộ mới").getByText("Đã duyệt", { exact: true })).toBeInTheDocument();
    expect(row("Bộ đang sửa").getByText("Bản nháp", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Bộ lưu trữ", { exact: true })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Xem kho lưu trữ (1)" }));
    expect(row("Bộ lưu trữ").getByText("Đã lưu trữ", { exact: true })).toBeInTheDocument();
    expect(row("Bộ lưu trữ").queryByText("Đang dùng", { exact: true })).not.toBeInTheDocument();
  });
  it("uses the monthly saved-version list structure, canonical summary facts, and counts visible archives", async () => {
    const view = structuredClone(bank);
    view.forms[0] = { ...view.forms[0]!, sectionCount: 4, totalMinutes: 90, totalScore: 100, audioConfigured: true };
    view.forms.push({ versionId: "archived", title: "Bộ lưu lịch sử", version: 2, status: "archived", legacy: false, canDelete: false });
    const { user } = setup(view);
    const heading = await screen.findByRole("heading", { name: "Đề đầu vào" });
    const list = heading.closest("section")!;
    expect(list).toHaveClass("card", "operator-assessment-form-list", "assessment-bank");
    expect(within(list).getByText("PHIÊN BẢN ĐỀ ĐÃ LƯU")).toHaveClass("xs", "muted");
    expect(within(list).getByText("3 phiên bản")).toHaveClass("badge");
    expect(list.querySelector(".assessment-bank-policy")).toBeNull();
    expect(within(list).queryByText("Dùng nguyên một bộ")).not.toBeInTheDocument();
    const row = within(list).getByRole("button", { name: "Xem Bộ legacy" }).closest("article")!;
    expect(row).toHaveClass("item", "operator-assessment-form-row", "assessment-bank-row");
    expect(row.parentElement).toHaveClass("stack");
    expect(row.querySelector(".operator-assessment-form-info")).toHaveTextContent("Phiên bản 1 · Đã phát hành");
    expect(row.querySelector(".operator-form-metrics")).toHaveTextContent("4 kỹ năng · 90 phút · 100 điểm");
    expect(within(row).getByText("Âm thanh: đã cấu hình nguồn audio")).toHaveClass("xs", "muted");
    expect(within(list).getByRole("button", { name: "Cách giao đề" }).parentElement).toHaveClass("assessment-bank-toolbar");
    await user.click(within(list).getByRole("button", { name: "Xem kho lưu trữ (1)" }));
    expect(within(list).getByText("4 phiên bản")).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Xem Bộ lưu lịch sử" })).toBeVisible();
  });
  it.each(["placement", "retake", "A2", "pass_course"] as AssessmentBankScope[])("uses the saved monthly preview format for %s including canonical totals and answer keys", async scope => {
    const title = `Saved ${scope}`;
    const view: AssessmentBankView = { ...bank, scope, forms: [{ ...bank.forms[0]!, title, status: "archived", canDelete: false }] };
    const { client, user } = setup(view, true);
    const sections: AssessmentBankFormDetail["blueprint"]["sections"] = [
      { code: "listening", title: "Nghe", durationMinutes: 15, maxScore: 20, instructions: ["Listen carefully."], groups: [{ key: "L1", title: "Saved listening", instruction: "Choose.", stimulus: { type: "audio_script", audioSrc: "/saved.mp3", lines: [{ speaker: "A", text: "Saved script." }] }, tasks: [{ key: "L1", prompt: "Saved question?", responseType: "single_choice", maxScore: 1, correctAnswer: "B", options: [{ value: "A", label: "Wrong choice" }, { value: "B", label: "Saved answer" }] }] }] },
      { code: "reading", title: "Đọc", durationMinutes: 25, maxScore: 40, instructions: ["Read."], groups: [] },
      { code: "writing", title: "Viết", durationMinutes: 20, maxScore: 20, instructions: ["Write."], groups: [] },
      { code: "speaking", title: "Nói", durationMinutes: 15, maxScore: 20, instructions: ["Speak."], groups: [] }
    ];
    client.getAssessmentBankForm.mockResolvedValueOnce({ ...view.forms[0]!, audioConfigured: true, blueprint: { key: "saved", kind: scope === "pass_course" ? "pass-course" : scope === "A2" ? "level-up" : "placement", title, version: 9, totalMinutes: 90, totalScore: 123, sections } });
    client.validateAssessmentBankForm.mockResolvedValue({ issues: [] });
    await user.click(await screen.findByRole("button", { name: "Xem kho lưu trữ (1)" }));
    await user.click(screen.getByRole("button", { name: `Xem ${title}` }));
    const dialog = await screen.findByRole("dialog", { name: `Xem đề ${title}` });
    expect(within(dialog).getByText("CẤU TRÚC ĐỀ THI")).toBeInTheDocument();
    const summary = within(dialog).getByLabelText("Tổng quan bài thi");
    expect(summary.children).toHaveLength(3);
    expect(summary).toHaveTextContent("4 kỹ năng90 phút123 điểm");
    expect(within(dialog).getByRole("table", { name: "Cấu trúc bài thi" })).toHaveTextContent("Nghe");
    expect(within(dialog).getByLabelText("Điều kiện trước khi thi")).toHaveTextContent("tai nghe/loa");
    expect(within(dialog).getAllByText("Đã lưu lịch sử", { exact: false }).length).toBeGreaterThan(0);
    const toggles = within(dialog).getByLabelText("Phần bài thi").querySelectorAll("button[aria-expanded]");
    expect(toggles).toHaveLength(4);
    await user.click(within(dialog).getByRole("button", { name: /Nghe.*1 câu/ }));
    expect(within(dialog).getByText("Saved question?")).toBeInTheDocument();
    expect(within(dialog).getByText("Saved answer")).toHaveClass("assessment-definition-preview-correct-option");
    expect(within(dialog).queryByRole("button", { name: "Lưu bản nháp" })).not.toBeInTheDocument();
    expect(client.updateAssessmentBankForm).not.toHaveBeenCalled();
    expect(client.getAssessmentBankForm).toHaveBeenCalledWith(scope, "one");
  });
  it("shows small authoring and row actions directly without an action chooser", async () => {
    setup();
    expect(await screen.findByRole("button", { name: "Soạn tay" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sinh bằng AI" })).toBeVisible();
    const row = screen.getByRole("button", { name: "Xem Bộ legacy" }).closest("article")!;
    expect(within(row).getByRole("button", { name: "Xem Bộ legacy" })).toBeVisible();
    expect(within(row).getByRole("button", { name: "Tạo bản sửa" })).toBeVisible();
    expect(within(row).getByRole("button", { name: "Lưu trữ" })).toBeVisible();
    expect(within(row).getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Thêm bộ đề" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Thao tác với/ })).not.toBeInTheDocument();
  });
  it("confirms direct archive and returns focus when cancelling without mutation", async () => {
    const { client, user } = setup();
    const row = (await screen.findByRole("button", { name: "Xem Bộ legacy" })).closest("article")!;
    const archive = within(row).getByRole("button", { name: "Lưu trữ" });
    await user.click(archive);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Huỷ" }));
    expect(client.archiveAssessmentBankForm).not.toHaveBeenCalled();
    expect(archive).toHaveFocus();
  });
  it("creates an AI draft through the direct authoring button", async () => {
    const { client, user } = setup();
    client.createAssessmentBankForm.mockResolvedValueOnce({ ...bank.forms[2]!, blueprint: { key: "placement-a", title: "Bộ AI", kind: "placement", version: 1, totalMinutes: 75, totalScore: 100, sections: [] } });
    client.validateAssessmentBankForm.mockResolvedValue({ issues: [] });
    expect(client.createAssessmentBankForm).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Sinh bằng AI" }));
    await screen.findByRole("dialog", { name: "Soạn đề đầu vào" });
    expect(client.createAssessmentBankForm).toHaveBeenCalledWith("placement", { method: "ai" });
  });
  it("requires confirmation, cancels without deleting, and removes an unused archived form after confirmation", async () => {
    const view = structuredClone(bank);
    view.forms.push({ versionId: "unused", title: "Bộ lưu trữ chưa dùng", version: 2, status: "archived", legacy: false, canDelete: true, deleteReason: null });
    const { client, user } = setup(view);
    await user.click(await screen.findByRole("button", { name: "Xem kho lưu trữ (1)" }));
    await user.click(screen.getByRole("button", { name: "Xoá Bộ lưu trữ chưa dùng" }));
    expect(client.deleteAssessmentBankForm).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Huỷ" }));
    expect(client.deleteAssessmentBankForm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Xoá Bộ lưu trữ chưa dùng" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Xoá Bộ lưu trữ chưa dùng" }));
    client.getAssessmentBank.mockResolvedValueOnce({ ...view, forms: bank.forms });
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xoá bộ đề" }));
    await waitFor(() => expect(client.deleteAssessmentBankForm).toHaveBeenCalledWith("placement", "unused"));
    await waitFor(() => expect(screen.queryByText("Bộ lưu trữ chưa dùng")).not.toBeInTheDocument());
  });
  it("shows the preservation reason for used archived forms and offers no deletion to managers", async () => {
    const view = structuredClone(bank);
    view.forms.push({ versionId: "used", title: "Bộ đã thi", version: 2, status: "archived", legacy: false, canDelete: false, deleteReason: "Đã có lượt thi; giữ đề, audio và lịch sử kết quả." });
    const { user } = setup(view);
    await user.click(await screen.findByRole("button", { name: "Xem kho lưu trữ (1)" }));
    expect(screen.getByText("Đã có lượt thi; giữ đề, audio và lịch sử kết quả.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Xoá/ })).not.toBeInTheDocument();
  });
  it("hides deletion for managers even for an eligible unused archive", async () => {
    const view = structuredClone(bank);
    view.forms.push({ versionId: "unused", title: "Bộ chưa dùng", version: 2, status: "archived", legacy: false, canDelete: true, deleteReason: null });
    const { user } = setup(view, true);
    await user.click(await screen.findByRole("button", { name: "Xem kho lưu trữ (1)" }));
    expect(screen.queryByRole("button", { name: /Xoá/ })).not.toBeInTheDocument();
  });
  it("keeps the archived form and explains a server refusal if it became used after loading", async () => {
    const view = structuredClone(bank);
    view.forms.push({ versionId: "unused", title: "Bộ vừa được dùng", version: 2, status: "archived", legacy: false, canDelete: true, deleteReason: null });
    const { user, client } = setup(view);
    client.deleteAssessmentBankForm.mockRejectedValueOnce({ code: "ASSESSMENT_BANK_FORM_USED" });
    await user.click(await screen.findByRole("button", { name: "Xem kho lưu trữ (1)" }));
    await user.click(screen.getByRole("button", { name: "Xoá Bộ vừa được dùng" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xoá bộ đề" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Đã có lượt thi; giữ đề, audio và lịch sử kết quả.");
    expect(screen.getByText("Bộ vừa được dùng")).toBeInTheDocument();
  });
  it("preserves the source aggregate duration when saving a draft", async () => {
    const { client, user } = setup();
    const draft: AssessmentBankFormDetail = { ...bank.forms[2]!, blueprint: { key: "pass-course-form-a", title: "Pass Course", kind: "pass-course", version: 1, totalMinutes: 90, totalScore: 100, sections: [] } };
    client.createAssessmentBankForm.mockResolvedValueOnce(draft);
    client.updateAssessmentBankForm.mockResolvedValueOnce(draft);
    client.validateAssessmentBankForm.mockResolvedValue({ issues: [] });
    await user.click(await screen.findByRole("button", { name: "Soạn tay" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Lưu bản nháp" }));
    await waitFor(() => expect(client.updateAssessmentBankForm).toHaveBeenCalledWith("placement", "draft", expect.objectContaining({ totalMinutes: 90, totalScore: 100 })));
  });
  it("opens a checked draft and requires answer review before publication", async () => {
    const { client, user } = setup();
    const draft: AssessmentBankFormDetail = { ...bank.forms[2]!, blueprint: { key: "placement-a", title: "Bộ đang sửa", kind: "placement", version: 1, totalMinutes: 75, totalScore: 100, sections: [] } };
    client.createAssessmentBankForm.mockResolvedValueOnce(draft);
    client.validateAssessmentBankForm.mockResolvedValue({ issues: [] });
    client.publishAssessmentBankForm.mockResolvedValue({ ...draft, status: "published" });
    await user.click(await screen.findByRole("button", { name: "Soạn tay" }));
    const dialog = await screen.findByRole("dialog", { name: "Soạn đề đầu vào" });
    const publish = within(dialog).getByRole("button", { name: "Duyệt & phát hành" });
    expect(publish).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: "Tôi đã đọc lại đáp án từng câu" }));
    expect(publish).toBeEnabled();
    await user.click(publish);
    await waitFor(() => expect(client.publishAssessmentBankForm).toHaveBeenCalledWith("placement", "draft", { answersReviewed: true }));
    expect(client.validateAssessmentBankForm).toHaveBeenCalledTimes(2);
  });
  it("allows more than three published sources and requires the selected count to match", async () => {
    const view = structuredClone(bank);
    view.forms.push(...["three", "four"].map(versionId => ({ versionId, title: `Bộ ${versionId}`, version: 1, status: "published" as const, legacy: false })));
    const { save, user } = setup(view);
    await user.click(await screen.findByRole("button", { name: "Cách giao đề" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: "Trộn các bộ" }));
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Số bộ muốn trộn" }), "4");
    for (const title of ["Bộ legacy", "Bộ mới", "Bộ three"]) await user.click(within(dialog).getByRole("checkbox", { name: new RegExp(title) }));
    expect(within(dialog).getByRole("button", { name: "Xác nhận áp dụng" })).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: /Bộ four/ }));
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận áp dụng" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("placement", { mode: "mixed", sourceCount: 4, versionIds: ["one", "two", "three", "four"] }));
  });
  it("does not offer mutations in manager read-only mode", async () => {
    setup(bank, true);
    await screen.findByRole("button", { name: "Xem Bộ legacy" });
    expect(screen.queryByRole("button", { name: "Cách giao đề" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Soạn tay" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sinh bằng AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu trữ" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xem Bộ legacy" })).toBeEnabled();
  });
  it("has no random switch and requires explicit compatible source selection and confirmation", async () => {
    const { save, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Cách giao đề" }));
    const dialog = screen.getByRole("dialog", { name: "Chọn cách giao đề" });
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: "Trộn các bộ" }));
    expect(within(dialog).getByRole("checkbox", { name: /Bộ đang sửa/ })).toBeDisabled();
    const confirm = within(dialog).getByRole("button", { name: "Xác nhận áp dụng" });
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: /Bộ legacy/ }));
    await user.click(within(dialog).getByRole("checkbox", { name: /Bộ mới/ }));
    expect(save).not.toHaveBeenCalled();
    await user.click(confirm);
    await waitFor(() => expect(save).toHaveBeenCalledWith("placement", { mode: "mixed", sourceCount: 2, versionIds: ["one", "two"] }));
    expect(await screen.findByText(/Đã áp dụng cho các lượt thi mới/)).toBeInTheDocument();
    expect(screen.getAllByText("Đang dùng", { exact: true })).toHaveLength(2);
    expect(screen.queryByText("Đã duyệt", { exact: true })).not.toBeInTheDocument();
  });
  it("cancels without saving and offers additional forms without a hard cap", async () => {
    const { save, user } = setup();
    expect(await screen.findByRole("button", { name: "Sinh bằng AI" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Cách giao đề" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Huỷ" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("keeps configuration open and exposes the server's incompatibility error", async () => {
    const { save, user } = setup();
    save.mockRejectedValueOnce({ code: "ASSESSMENT_BANK_INCOMPATIBLE", issues: ["Listening 1 khác cấu trúc"] });
    await user.click(await screen.findByRole("button", { name: "Cách giao đề" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận áp dụng" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Listening 1 khác cấu trúc");
    expect(dialog).toBeInTheDocument();
  });
});
