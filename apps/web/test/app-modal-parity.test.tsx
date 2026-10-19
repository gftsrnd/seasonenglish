// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalProvider, useModal } from "../src/app/shared/ModalProvider.js";

afterEach(() => { cleanup(); vi.useRealTimers(); });

function Harness() {
  const modal = useModal();
  const [result, setResult] = useState("none");
  return <>
    <button type="button" onClick={() => void modal.confirm({ title: "Xác nhận duyệt", message: "Duyệt yêu cầu này?", confirmLabel: "Duyệt" }).then((value) => setResult(String(value)))}>Mở xác nhận</button>
    <button type="button" onClick={() => void modal.prompt({ title: "Nhập lý do", label: "Lý do", confirmLabel: "Lưu" }).then((value) => setResult(value ?? "cancelled"))}>Mở nhập liệu</button>
    <button type="button" onClick={() => void modal.confirm({ title: "Xoá vĩnh viễn", message: "Không thể hoàn tác.", confirmLabel: "Xoá", tone: "danger", countdownSeconds: 1 }).then((value) => setResult(String(value)))}>Mở xác nhận nguy hiểm</button>
    <output role="status" aria-live="polite">{result}</output>
  </>;
}

function ReplacementHarness() {
  const modal = useModal();
  const [firstResult, setFirstResult] = useState("pending");
  const [secondResult, setSecondResult] = useState("pending");
  const replace = () => {
    void modal.confirm({ title: "Xác nhận cũ", message: "Tác vụ cũ" }).then((value) => setFirstResult(String(value)));
    void modal.prompt({ title: "Nhập mới", label: "Giá trị mới" }).then((value) => setSecondResult(value ?? "cancelled"));
  };
  return <>
    <button type="button" onClick={replace}>Mở liên tiếp</button>
    <output aria-label="kết quả cũ">{firstResult}</output>
    <output aria-label="kết quả mới">{secondResult}</output>
  </>;
}

describe("app modal root", () => {
  it("renders a styled confirm dialog and resolves the action", async () => {
    const user = userEvent.setup();
    render(<ModalProvider><Harness /></ModalProvider>);
    const opener = screen.getByRole("button", { name: "Mở xác nhận" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Xác nhận duyệt" });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-describedby");
    expect(dialog.parentElement).toHaveClass("modal-backdrop");
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement | null));
    await user.click(screen.getByRole("button", { name: "Duyệt" }));
    expect(screen.getByRole("status")).toHaveTextContent("true");
    expect(opener).toHaveFocus();
  });

  it("submits prompt input with Enter and cancels with Escape", async () => {
    const user = userEvent.setup();
    render(<ModalProvider><Harness /></ModalProvider>);
    await user.click(screen.getByRole("button", { name: "Mở nhập liệu" }));
    const input = screen.getByRole("textbox", { name: "Lý do" });
    expect(input).toHaveFocus();
    await user.type(input, "Đủ bằng chứng{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("Đủ bằng chứng");

    await user.click(screen.getByRole("button", { name: "Mở nhập liệu" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("status")).toHaveTextContent("cancelled");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mở nhập liệu" })).toHaveFocus();
  });

  it("keeps keyboard focus inside the dialog and closes from the backdrop", async () => {
    const user = userEvent.setup();
    render(<ModalProvider><Harness /></ModalProvider>);
    const opener = screen.getByRole("button", { name: "Mở xác nhận" });
    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Xác nhận duyệt" });
    const close = within(dialog).getByRole("button", { name: "Đóng hộp thoại" });
    const confirm = within(dialog).getByRole("button", { name: "Duyệt" });
    confirm.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();
    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();

    fireEvent.click(screen.getByRole("presentation"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("moves an irreversible action into the canonical cancellable countdown", async () => {
    vi.useFakeTimers();
    render(<ModalProvider><Harness /></ModalProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Mở xác nhận nguy hiểm" }));
    expect(screen.getByRole("button", { name: "Xoá" })).toBeEnabled();
    expect(screen.queryByText("1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
    const countdownDialog = screen.getByRole("dialog", { name: "Xoá sau 1 giây…" });
    expect(countdownDialog).toBeInTheDocument();
    expect(countdownDialog).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Dừng lại" })).toBeEnabled();
    expect(screen.getByText("1")).toHaveClass("countdown");

    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => undefined);
    expect(screen.getByRole("status")).toHaveTextContent("false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mở xác nhận nguy hiểm" }));
    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
    await act(async () => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByRole("status")).toHaveTextContent("true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancels a pending modal before showing its replacement", async () => {
    render(<ModalProvider><ReplacementHarness /></ModalProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Mở liên tiếp" }));

    expect(screen.getByRole("dialog", { name: "Nhập mới" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("kết quả cũ")).toHaveTextContent("false"));
    fireEvent.change(screen.getByRole("textbox", { name: "Giá trị mới" }), { target: { value: "giá trị hiện tại" } });
    fireEvent.submit(screen.getByRole("dialog", { name: "Nhập mới" }));
    await waitFor(() => expect(screen.getByLabelText("kết quả mới")).toHaveTextContent("giá trị hiện tại"));
  });
});
