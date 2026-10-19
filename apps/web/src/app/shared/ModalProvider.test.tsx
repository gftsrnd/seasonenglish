// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ModalProvider, useModal } from "./ModalProvider.js";

function ModalHarness() {
  const modal = useModal();
  const [result, setResult] = useState("none");

  return <>
    <button type="button" onClick={() => void modal.confirm({
      title: "Xác nhận thay đổi",
      message: "Thay đổi này sẽ được áp dụng ngay.",
      confirmLabel: "Áp dụng"
    }).then((confirmed) => setResult(String(confirmed)))}>Mở xác nhận</button>
    <button type="button" onClick={() => void modal.prompt({
      title: "Đổi mật khẩu",
      message: "Mật khẩu phải có ít nhất 8 ký tự.",
      label: "Mật khẩu mới",
      inputType: "password",
      confirmLabel: "Lưu"
    }).then((value) => setResult(value ?? "cancelled"))}>Mở nhập liệu</button>
    <output role="status">{result}</output>
  </>;
}

afterEach(() => {
  cleanup();
  document.body.classList.remove("app-modal-open");
});

describe("ModalRoot", () => {
  it("reuses the outer modal root when a route mounts a nested provider", async () => {
    const user = userEvent.setup();
    render(<ModalProvider><ModalProvider><ModalHarness /></ModalProvider></ModalProvider>);

    expect(document.querySelectorAll("#modal")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Mở xác nhận" }));
    expect(screen.getByRole("dialog", { name: "Xác nhận thay đổi" }).parentElement).toHaveAttribute("id", "modal");
  });

  it("uses the canonical single backdrop surface instead of darkening the page twice", async () => {
    const user = userEvent.setup();
    render(<ModalProvider><ModalHarness /></ModalProvider>);

    await user.click(screen.getByRole("button", { name: "Mở xác nhận" }));

    const dialog = screen.getByRole("dialog", { name: "Xác nhận thay đổi" });
    expect(dialog.parentElement).toHaveAttribute("id", "modal");
    expect(dialog.parentElement).toHaveClass("modal-backdrop");
    expect(document.querySelectorAll(".modal-backdrop")).toHaveLength(1);
  });

  it("keeps the modal named, locked, keyboard-contained and safely dismissible", async () => {
    const user = userEvent.setup();
    render(<ModalProvider><ModalHarness /></ModalProvider>);
    const opener = screen.getByRole("button", { name: "Mở xác nhận" });

    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Xác nhận thay đổi" });
    const cancel = within(dialog).getByRole("button", { name: "Huỷ" });
    const close = within(dialog).getByRole("button", { name: "Đóng hộp thoại" });
    const confirm = within(dialog).getByRole("button", { name: "Áp dụng" });

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Thay đổi này sẽ được áp dụng ngay.");
    expect(document.body).toHaveClass("app-modal-open");
    await waitFor(() => expect(cancel).toHaveFocus());

    confirm.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("status")).toHaveTextContent("false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass("app-modal-open");
    expect(opener).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Mở nhập liệu" }));
    expect(screen.getByLabelText("Mật khẩu mới")).toHaveFocus();
    fireEvent.click(screen.getByRole("presentation"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("cancelled"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
