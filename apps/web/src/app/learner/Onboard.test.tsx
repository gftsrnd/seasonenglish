// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerOnboard } from "./Onboard.js";
import { ThemeProvider, useTheme } from "../shared/ThemeProvider.js";
import type { LearnerCallbacks } from "./contracts.js";

afterEach(() => { cleanup(); window.localStorage.clear(); });

const actions = { navigate: vi.fn(), saveProfile: vi.fn(), saveProfileDraft: vi.fn() } as unknown as LearnerCallbacks;

describe("app onboard affordances", () => {
  it("changes the profile mascot with the current theme while keeping edits", async () => {
    function ThemeControls() {
      const { setTheme } = useTheme();
      return <><button onClick={() => setTheme("winter")}>Đông</button><button onClick={() => setTheme("tet")}>Tết</button></>;
    }
    const { container } = render(<ThemeProvider><ThemeControls /><LearnerOnboard view={{ profile: {}, mode: "new" }} actions={actions} /></ThemeProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Đông" }));
    expect(container.querySelector(".learner-mascot--onboard")).toHaveAttribute("src", "/media/seasons/hero-penguin.png");
    await user.type(screen.getByRole("textbox", { name: "Họ tên *" }), "Mai");
    await user.click(screen.getByRole("button", { name: "Tết" }));
    expect(container.querySelector(".learner-mascot--onboard")).toHaveAttribute("src", "/media/seasons/hero-swallow.png");
    expect(screen.getByRole("textbox", { name: "Họ tên *" })).toHaveValue("Mai");
  });

  it("shows custom validation for required fields and focuses the first invalid control", async () => {
    const user = userEvent.setup();
    render(<LearnerOnboard view={{ profile: {}, mode: "new" }} actions={actions} />);

    await user.click(screen.getByRole("button", { name: /lưu và làm test đầu vào/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Nhập họ tên");
    expect(screen.getByRole("textbox", { name: "Họ tên *" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Họ tên *" })).toHaveAttribute("aria-invalid", "true");
  });

  it("focuses the first invalid choice group after profile fields are complete", async () => {
    const user = userEvent.setup();
    render(<LearnerOnboard view={{ profile: { fullName: "Lan", email: "lan@example.com" }, mode: "new" }} actions={actions} />);

    await user.click(screen.getByRole("button", { name: /lưu và làm test đầu vào/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/chọn ít nhất một mục đích dùng tiếng anh/i);
    expect(screen.getByRole("group", { name: "Bạn dùng tiếng Anh ở công ty cho việc gì? *" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("checkbox", { name: /nói chuyện với khách hàng/i })).toHaveFocus();
  });

  it("keeps a choice-group validation error when a valid email loses focus", async () => {
    const user = userEvent.setup();
    render(<LearnerOnboard view={{ profile: { fullName: "Lan", email: "lan@example.com" }, mode: "new" }} actions={actions} />);

    await user.click(screen.getByRole("button", { name: /lưu và làm test đầu vào/i }));
    await user.click(screen.getByRole("textbox", { name: "Email *" }));
    await user.tab();

    expect(screen.getByRole("alert")).toHaveTextContent(/chọn ít nhất một mục đích dùng tiếng anh/i);
    expect(screen.getByRole("group", { name: "Bạn dùng tiếng Anh ở công ty cho việc gì? *" })).toHaveAttribute("aria-invalid", "true");
  });

  it("shows the email format error while the learner is typing", async () => {
    const user = userEvent.setup();
    render(<LearnerOnboard view={{ profile: { fullName: "Lan", email: "lan@example.com" }, mode: "new" }} actions={actions} />);

    const email = screen.getByRole("textbox", { name: "Email *" });
    await user.clear(email);
    await user.type(email, "abc");

    expect(screen.getByRole("alert")).toHaveTextContent("Email chưa đúng định dạng");
    expect(email).toHaveAttribute("aria-invalid", "true");
  });

  it("normalizes a valid uppercase email before saving the profile", async () => {
    const user = userEvent.setup();
    const saveProfile = vi.fn().mockResolvedValue(undefined);
    render(<LearnerOnboard view={{ profile: { fullName: "Lan", email: "JAME@GMAIL.COM", goals: ["email"], environmentUse: "weekly", familyUse: "never", habits: ["app"], learningStyles: ["reading"] }, mode: "new" }} actions={{ ...actions, saveProfile }} />);

    await user.click(screen.getByRole("button", { name: /lưu và làm test đầu vào/i }));

    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ email: "jame@gmail.com" }));
  });

  it("does not apply an onboarding draft saved by another account", () => {
    window.localStorage.setItem("e4s:learner-onboard-draft", JSON.stringify({
      fullName: "Tài khoản cũ",
      email: "old@example.com",
      concerns: "Nội dung của tài khoản cũ"
    }));

    render(<LearnerOnboard view={{
      profile: { fullName: "Tài khoản mới", email: "new@example.com" },
      mode: "new"
    }} actions={actions} />);

    expect(screen.getByRole("textbox", { name: "Họ tên *" })).toHaveValue("Tài khoản mới");
    expect(screen.getByRole("textbox", { name: "Email *" })).toHaveValue("new@example.com");
    expect(screen.getByRole("textbox", { name: /điều bạn lo ngại/i })).toHaveValue("");
  });

  it("discards edits on remount before the learner saves a draft", async () => {
    const user = userEvent.setup();
    const view = { profile: { fullName: "Lan", email: "lan@example.com" }, mode: "new" } as const;
    const { unmount } = render(<LearnerOnboard view={view} actions={actions} />);
    await user.type(screen.getByPlaceholderText("VD: Sales, QA, Marketing"), "Design");
    unmount();
    render(<LearnerOnboard view={view} actions={actions} />);
    expect(screen.getByPlaceholderText("VD: Sales, QA, Marketing")).toHaveValue("");
  });

  it("shows certificate fields only while the certificate is selected", async () => {
    const user = userEvent.setup();
    render(<LearnerOnboard view={{ profile: {}, mode: "new" }} actions={actions} />);
    const checkbox = screen.getByRole("checkbox", { name: "IELTS" });
    expect(screen.queryByRole("textbox", { name: "Kết quả IELTS" })).not.toBeInTheDocument();
    await user.click(checkbox);
    expect(screen.getByRole("textbox", { name: "Kết quả IELTS" })).toBeInTheDocument();
    await user.click(checkbox);
    expect(screen.queryByRole("textbox", { name: "Kết quả IELTS" })).not.toBeInTheDocument();
  });

  it("exposes profile choices as named groups and locks navigation while saving", () => {
    render(<LearnerOnboard view={{ profile: {}, mode: "new", saving: true }} actions={actions} />);

    expect(screen.getByRole("group", { name: "Bạn dùng tiếng Anh ở công ty cho việc gì? *" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Mức độ dùng tiếng Anh trong môi trường làm việc? *" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "← Quay lại" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "← Quay lại" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole("button", { name: /lưu nháp/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /đang lưu/i })).toBeDisabled();
    expect(document.querySelector("form.profile-form")).toHaveAttribute("aria-busy", "true");
  });

  it("marks selected checkbox and radio controls for neutral styling", () => {
    render(<LearnerOnboard view={{ profile: { goals: ["email"], environmentUse: "weekly" }, mode: "new" }} actions={actions} />);

    expect(screen.getByRole("checkbox", { name: /viết email/i })).toHaveClass("profile-choice-input");
    expect(screen.getByRole("group", { name: "Mức độ dùng tiếng Anh trong môi trường làm việc? *" }).querySelector("input[type='radio'][value='weekly']")).toHaveClass("profile-choice-input");
  });

  it("keeps onboarding guidance concise without dropping the key reasons", () => {
    render(<LearnerOnboard view={{ profile: {}, mode: "new" }} actions={actions} />);

    expect(screen.getByText("Mình dùng thông tin này để chọn ví dụ sát công việc và cách học hợp với bạn. Khoảng 2 phút thôi.")).toBeInTheDocument();
    expect(screen.queryByText("Cá nhân hoá ví dụ và cách giải thích.")).not.toBeInTheDocument();
    expect(screen.queryByText("Xếp CEFR để bài học vừa sức.")).not.toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === "Các mục có dấu * bắt buộc là bắt buộc; các mục còn lại có thể bỏ trống.")).toBeInTheDocument();
    expect(screen.getByText("Hồ sơ")).toBeInTheDocument();
    // The Season style choice was removed from the profile form.
    expect(screen.queryByRole("group", { name: "Phong cách của Season" })).not.toBeInTheDocument();
    expect(screen.queryByText("Informal · Thân thiện")).not.toBeInTheDocument();
    expect(screen.queryByText("Formal · Trang trọng")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Mỗi buổi học bao lâu là vừa" })).toBeInTheDocument();
  });

  it("places validation feedback beside the invalid field instead of only at the top", async () => {
    const user = userEvent.setup();
    const { container } = render(<LearnerOnboard view={{ profile: {}, mode: "new" }} actions={actions} />);

    await user.click(screen.getByRole("button", { name: /lưu và làm test đầu vào/i }));

    const nameInput = screen.getByRole("textbox", { name: "Họ tên *" });
    expect(nameInput.parentElement).toContainElement(screen.getByText("Nhập họ tên"));
    expect(container.querySelector("form > .form-error")).not.toBeInTheDocument();
  });

  it("shows a saved-draft confirmation before returning home", async () => {
    const user = userEvent.setup();
    const saveProfileDraft = vi.fn().mockResolvedValue(undefined);
    render(<LearnerOnboard view={{ profile: {}, mode: "new" }} actions={{ ...actions, saveProfileDraft }} />);

    await user.click(screen.getByRole("button", { name: /lưu nháp/i }));
    expect(await screen.findByText(/đã lưu nháp/i)).toBeInTheDocument();
  });

  it("returns from an untouched profile without attempting to save a draft", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const saveProfileDraft = vi.fn().mockRejectedValue(new Error("PROFILE_DRAFT_NOT_SAVED"));
    render(<LearnerOnboard view={{ profile: { fullName: "Lan", email: "lan@example.com" }, mode: "edit" }} actions={{ ...actions, navigate, saveProfileDraft }} />);

    await user.click(screen.getAllByRole("button", { name: "← Quay lại" })[0]!);

    expect(navigate).toHaveBeenCalledWith("/profile");
    expect(saveProfileDraft).not.toHaveBeenCalled();
    expect(screen.queryByText("Không lưu được bản nháp")).not.toBeInTheDocument();
  });

  it("keeps the learner on the form and reports an error when the server cannot save the draft", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const saveProfileDraft = vi.fn().mockRejectedValue(new Error("PROFILE_DRAFT_NOT_SAVED"));
    render(<LearnerOnboard view={{ profile: {}, mode: "new" }} actions={{ ...actions, navigate, saveProfileDraft }} />);

    await user.click(screen.getByRole("button", { name: /lưu nháp/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Không lưu được bản nháp");
    expect(screen.queryByText(/đã lưu nháp/i)).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
