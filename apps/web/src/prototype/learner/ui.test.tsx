// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LearnerPrototypeController } from "./Router.js";
import { LearnerLoadFailure } from "./LearnerRouteController.js";
import { Button, Empty, ErrorText, Loading, Modal, PrototypeLink } from "./ui.js";

afterEach(cleanup);

describe("learner prototype UI primitives", () => {
  it("keeps action targets usable while exposing disabled and busy semantics", () => {
    const navigate = vi.fn();
    render(<><Button variant="primary" busy>Đang lưu…</Button><PrototypeLink href="/home" navigate={navigate} disabled>Về trang chủ</PrototypeLink></>);

    const button = screen.getByRole("button", { name: "Đang lưu…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveStyle({ minHeight: "44px", minWidth: "44px" });

    const link = screen.getByRole("link", { name: "Về trang chủ" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAttribute("tabindex", "-1");
    expect(link).toHaveStyle({ minHeight: "44px", minWidth: "44px" });
    fireEvent.click(link);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("exposes status and error semantics for empty and loading states", () => {
    render(<><Empty title="Chưa có dữ liệu" description="Thử lại sau." /><Loading label="Đang tải hồ sơ…" /><ErrorText message="Không thể tải hồ sơ." /></>);

    expect(screen.getByRole("status", { name: "Chưa có dữ liệu" })).toHaveAttribute("aria-live", "polite");
    const loading = screen.getAllByRole("status").find((element) => element.classList.contains("loading-state"));
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveTextContent("Đang tải hồ sơ…");
    expect(screen.getByRole("alert")).toHaveTextContent("Không thể tải hồ sơ.");
  });

  it("focuses the modal target and closes on Escape", () => {
    const onClose = vi.fn();
    render(<Modal title="Xác nhận" description="Mô tả" onClose={onClose}><button data-modal-initial-focus type="button">Giữ lại</button></Modal>);

    const dialog = screen.getByRole("dialog", { name: "Xác nhận" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Giữ lại" }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps missing learner routes as a clear empty state with the existing recovery link", () => {
    const navigate = vi.fn();
    render(<LearnerPrototypeController path="/not-found" contracts={{}} callbacks={{ navigate } as never} />);

    expect(screen.getByRole("heading", { name: "Không tìm thấy trang" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Không tìm thấy trang.");
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/home");
  });

  it.each([
    ["lesson", "Về trang chủ"],
    ["micro", "Về trang chủ"],
    ["reward", "Về trang chủ"],
    ["survey", "Về trang chủ"]
  ] as const)("keeps the %s load failure recoverable without losing the retry action", (route, recoveryLabel) => {
    const onRetry = vi.fn();
    const navigate = vi.fn();
    render(<LearnerLoadFailure route={route} message="Không tải được dữ liệu." onRetry={onRetry} navigate={navigate} />);

    expect(screen.getByRole("heading", { name: "Chưa thể mở trang" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Không tải được dữ liệu.");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: recoveryLabel })).toHaveAttribute("href", "/home");
  });
});
