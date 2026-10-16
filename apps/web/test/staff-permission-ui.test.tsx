// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoleScopeNotice, SettingsWorkspace, staffNavigation } from "../src/features/authorization/RoleScopeNotice.js";
import { SettingsWorkspace as ConnectedSettingsWorkspace } from "../src/features/authorization/SettingsWorkspace.js";

afterEach(cleanup);

describe("staff permission clarity", () => {
  it("shows the operator-only subset of Settings without presenting it as a manager screen", () => {
    render(<RoleScopeNotice role="operator" screen="settings" />);

    expect(screen.getByRole("heading", { name: "Quyền của Người vận hành" })).toBeInTheDocument();
    expect(screen.getByText("Bạn có thể thực hiện")).toBeInTheDocument();
    expect(screen.getByText(/cấu hình nội dung, prompt và rubric được giao/i)).toBeInTheDocument();
    expect(screen.getByText(/không thay đổi tài khoản, phân quyền/i)).toBeInTheDocument();
  });

  it("gives a manager the broader settings scope, including the operator subset", () => {
    render(<RoleScopeNotice role="manager" screen="settings" />);

    expect(screen.getByRole("heading", { name: "Quyền của Quản lý" })).toBeInTheDocument();
    expect(screen.getByText("Bạn có thể thực hiện — gồm phạm vi của Người vận hành")).toBeInTheDocument();
    expect(screen.getByText(/quản lý tài khoản, phân quyền, cấu hình tổ chức/i)).toBeInTheDocument();
    expect(screen.getByText(/không hiển thị hoặc cho nhập secret provider/i)).toBeInTheDocument();
  });

  it("gives an operator a real settings action for the assigned prompt and rubric", () => {
    render(<SettingsWorkspace role="operator" />);

    expect(screen.getByRole("heading", { name: "Cài đặt vận hành" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chỉnh prompt & rubric" })).toHaveAttribute("href", "/op/prompts");
    expect(screen.getByRole("link", { name: "Chỉnh chủ đề tuần" })).toHaveAttribute("href", "/op/weeks");
    expect(screen.queryByText("Quản lý tài khoản và phân quyền")).not.toBeInTheDocument();
    expect(screen.getByText(/chỉ xem cấu hình cấp tổ chức/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Giao diện theo mùa / lễ")).toBeDisabled();
    expect(screen.getByLabelText("Nguồn ảnh từ vựng")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Lưu giao diện & ảnh" })).not.toBeInTheDocument();
  });

  it("shows a manager the broader settings categories as connected system functions", () => {
    render(<SettingsWorkspace role="manager" />);

    expect(screen.getByText("Quản lý tài khoản và phân quyền")).toBeInTheDocument();
    expect(screen.getAllByText("Kết nối dữ liệu")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Chỉnh prompt & rubric" })).toHaveAttribute("href", "/op/prompts");
    expect(screen.getByRole("link", { name: "Chỉnh chủ đề tuần" })).toHaveAttribute("href", "/op/weeks");
  });

  it("keeps the connected Operator settings surface read-only even when save callbacks exist", () => {
    const savePreferences = vi.fn();
    render(<ConnectedSettingsWorkspace
      role="operator"
      preferences={{ theme: "auto", vocabImageSource: "wikimedia" }}
      capabilities={{ api: true, database: true, ai: true, objectStorage: true }}
      onSavePreferences={savePreferences}
    />);

    expect(screen.getByText(/Bạn chỉ xem cấu hình cấp tổ chức/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Nguồn ảnh")).toBeDisabled();
    expect(screen.getByLabelText("Chủ đề giao diện (áp dụng ngay khi chọn)")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Lưu" })).not.toBeInTheDocument();
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it("labels every connected Manager dashboard as available", () => {
    expect(staffNavigation.manager).toHaveLength(9);
    expect(staffNavigation.manager.find((item) => item.to === "/settings")?.status).toBe("active");
    expect(staffNavigation.manager.find((item) => item.to === "/mgr")?.status).toBe("active");
    expect(staffNavigation.manager.find((item) => item.to === "/mgr/ops")?.status).toBe("active");
    expect(staffNavigation.manager.filter((item) => ["/mgr/reminders", "/mgr/report"].includes(item.to)).every((item) => item.status === "active")).toBe(true);
    expect(staffNavigation.manager.filter((item) => item.to.startsWith("/op")).every((item) => item.status === "active")).toBe(true);
    expect(staffNavigation.operator.find((item) => item.to === "/settings")?.status).toBe("read");
  });
});
