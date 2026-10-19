// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationalCards } from "./shared.js";

afterEach(cleanup);

describe("Manager shared operational cards", () => {
  it("keeps the canonical PIN, deletion-request, and trash card blocks with manager actions", async () => {
    const open = vi.fn();
    const purge = vi.fn();
    render(<OperationalCards
      pinReports={[{ id: "pin-1", title: "Thư Demo", detail: "Nhắn qua Base @thu" }]}
      deleteRequests={[{ id: "delete-1", title: "Lan Demo", detail: "Không còn tham gia pilot" }]}
      trashedAccounts={[{ id: "trash-1", name: "Tài khoản cũ", deletedAt: "2026-10-14T09:00:00.000Z" }]}
      onOpenOperationalItem={open}
      onPurgeOperationalItem={purge}
    />);

    expect(screen.getByRole("heading", { name: /Mã PIN/ })).toBeInTheDocument();
    expect(screen.getByText("1 yêu cầu quên PIN")).toBeInTheDocument();
    expect(screen.getByText("chờ cấp lại")).toBeInTheDocument();
    const pinAction = screen.getByRole("button", { name: "Đã báo lại" });
    expect(pinAction).toBeInTheDocument();
    expect(pinAction).toHaveAttribute("aria-describedby", expect.stringContaining("operational-pin-1-detail"));
    expect(screen.getByRole("group", { name: "Thao tác cho Thư Demo" })).toContainElement(pinAction);

    expect(screen.getByRole("heading", { name: /Yêu cầu xoá tài khoản/ })).toBeInTheDocument();
    expect(screen.getByText("1 chờ duyệt")).toBeInTheDocument();
    const deleteAction = screen.getByRole("button", { name: "Duyệt xoá" });
    expect(deleteAction).toBeInTheDocument();
    expect(deleteAction).toHaveAttribute("aria-describedby", expect.stringContaining("operational-delete-1-detail"));
    expect(screen.getByRole("group", { name: "Thao tác cho Lan Demo" })).toContainElement(deleteAction);

    expect(screen.getByRole("heading", { name: /Tài khoản đã duyệt xoá/ })).toBeInTheDocument();
    expect(screen.getByText(/Tài khoản đã xoá và dữ liệu học không đăng nhập được/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Khôi phục" })).toBeInTheDocument();
    const purgeAction = screen.getByRole("button", { name: "Xoá vĩnh viễn" });
    expect(purgeAction).toBeInTheDocument();
    expect(purgeAction).toHaveAttribute("aria-haspopup", "dialog");
    expect(purgeAction).toHaveAttribute("aria-describedby", expect.stringContaining("operational-trash-1-detail"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Đã báo lại" }));
    await user.click(screen.getByRole("button", { name: "Duyệt xoá" }));
    await user.click(screen.getByRole("button", { name: "Khôi phục" }));
    await user.click(screen.getByRole("button", { name: "Xoá vĩnh viễn" }));
    expect(open).toHaveBeenNthCalledWith(1, "pin", "pin-1");
    expect(open).toHaveBeenNthCalledWith(2, "delete", "delete-1");
    expect(open).toHaveBeenNthCalledWith(3, "trash", "trash-1");
    expect(purge).toHaveBeenCalledWith("trash-1");
  });

  it("renders unavailable operational actions as disabled read-only controls", () => {
    render(<OperationalCards
      pinReports={[{ id: "pin-1", title: "Thư Demo", detail: "Đang chờ xử lý" }]}
      deleteRequests={[{ id: "delete-1", title: "Lan Demo", detail: "Đang chờ Quản lý" }]}
      trashedAccounts={[{ id: "trash-1", name: "Tài khoản cũ", deletedAt: "2026-10-14T09:00:00.000Z" }]}
    />);

    for (const label of ["Đã báo lại", "Duyệt xoá", "Khôi phục"]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
    expect(screen.queryByRole("button", { name: "Xoá vĩnh viễn" })).not.toBeInTheDocument();
  });

  it("exposes the reason and busy state when operational actions cannot run", () => {
    render(<OperationalCards
      pinReports={[{ id: "pin-1", title: "Thư Demo", detail: "Đang chờ xử lý" }]}
      trashedAccounts={[{ id: "trash-1", name: "Tài khoản cũ", deletedAt: "2026-10-14T09:00:00.000Z" }]}
      onOpenOperationalItem={vi.fn()}
      onPurgeOperationalItem={vi.fn()}
      busy
    />);

    const pinAction = screen.getByRole("button", { name: "Đã báo lại" });
    const purgeAction = screen.getByRole("button", { name: "Xoá vĩnh viễn" });
    expect(pinAction).toBeDisabled();
    expect(purgeAction).toBeDisabled();
    expect(screen.getByRole("group", { name: "Thao tác cho Thư Demo" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("group", { name: "Thao tác cho Tài khoản cũ" })).toHaveAttribute("aria-busy", "true");
    expect(pinAction).toHaveAttribute("aria-describedby", expect.stringContaining("operational-pin-1-state"));
    expect(purgeAction).toHaveAttribute("aria-describedby", expect.stringContaining("operational-trash-1-state"));
    expect(screen.getAllByText("Đang xử lý…").length).toBeGreaterThanOrEqual(2);
  });
});
