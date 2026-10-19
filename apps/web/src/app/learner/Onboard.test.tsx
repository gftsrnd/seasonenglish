// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerOnboard } from "./Onboard.js";
import type { LearnerCallbacks } from "./contracts.js";

afterEach(cleanup);

const actions = { navigate: vi.fn(), saveProfile: vi.fn(), saveProfileDraft: vi.fn() } as unknown as LearnerCallbacks;

describe("app onboard affordances", () => {
  it("uses the verified raster mascot without replacing it with the seasonal mark", () => {
    const { container } = render(<LearnerOnboard view={{ profile: {}, mode: "new" }} actions={actions} />);
    expect(container.querySelector("img[data-product-art='mascot']")).toHaveAttribute("src", "/media/mascot/season-bear.png");
    expect(container.querySelector("[data-testid='season-mark']")).not.toBeInTheDocument();
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

  it("exposes profile choices as named groups and locks navigation while saving", () => {
    render(<LearnerOnboard view={{ profile: {}, mode: "new", saving: true }} actions={actions} />);

    expect(screen.getByRole("group", { name: "Bạn dùng tiếng Anh ở công ty cho việc gì? *" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Mức độ dùng tiếng Anh trong môi trường làm việc? *" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "← Quay lại" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "← Quay lại" }).every((link) => link.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(screen.getAllByRole("link", { name: "← Quay lại" }).every((link) => link.getAttribute("tabindex") === "-1")).toBe(true);
    expect(screen.getByRole("button", { name: /lưu nháp/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /đang lưu/i })).toBeDisabled();
    expect(document.querySelector("form.profile-form")).toHaveAttribute("aria-busy", "true");
  });

  it("keeps onboarding guidance concise without dropping the key reasons", () => {
    render(<LearnerOnboard view={{ profile: {}, mode: "new" }} actions={actions} />);

    expect(screen.getByText("Mình dùng thông tin này để chọn ví dụ sát công việc và cách học hợp với bạn. Khoảng 2 phút thôi.")).toBeInTheDocument();
    expect(screen.getByText("Bài học lấy ví dụ theo đúng công việc của bạn, và Season giải thích theo cách bạn chọn (tiếng Việt hay tiếng Anh, bài ngắn hay hội thoại).")).toBeInTheDocument();
    expect(screen.getByText("Để xếp đúng mức CEFR: bài quá dễ thì chán, quá khó thì nản. Hồ sơ không thay thế được test vì tự đánh giá thường lệch.")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === "Các mục có dấu * bắt buộc là bắt buộc; các mục còn lại có thể bỏ trống.")).toBeInTheDocument();
  });
});
