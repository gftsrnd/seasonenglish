// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { ManagerSectionNavigation } from "./ManagerSectionNavigation.js";

afterEach(cleanup);

describe("Manager grouped navigation", () => {
  it("keeps operational tools together and preserves the holiday URL", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/mgr/ops"]}><ManagerSectionNavigation /><Routes><Route path="/mgr/ops" element={<h1>Hiệu suất</h1>} /><Route path="/mgr/holidays" element={<h1>Lịch nghỉ</h1>} /></Routes></MemoryRouter>);
    const navigation = screen.getByRole("navigation", { name: "Các mục vận hành" });
    await user.click(within(navigation).getByRole("link", { name: "Ngày nghỉ lễ" }));
    expect(screen.getByRole("heading", { name: "Lịch nghỉ" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Ngày nghỉ lễ" })).toHaveAttribute("href", "/mgr/holidays");
    expect(within(navigation).getByRole("link", { name: "Ngày nghỉ lễ" })).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["/mgr/ops/months", "Các mục vận hành", ["Hiệu suất vận hành", "Ngày nghỉ lễ", "Duyệt mức", "Sinh bài", "Phản hồi & yêu cầu", "Kết quả bài thi"], "Sinh bài"],
    ["/mgr/ops/level-forms", "Các mục vận hành", ["Hiệu suất vận hành", "Ngày nghỉ lễ", "Duyệt mức", "Sinh bài", "Phản hồi & yêu cầu", "Kết quả bài thi"], "Kết quả bài thi"],
    ["/mgr/reminders", "Các mục theo dõi", ["Tiến độ nhóm", "Nhắc học viên", "Báo cáo tổng kết", "Khảo sát tháng"], "Nhắc học viên"],
    ["/mgr/report", "Các mục theo dõi", ["Tiến độ nhóm", "Nhắc học viên", "Báo cáo tổng kết", "Khảo sát tháng"], "Báo cáo tổng kết"]
  ] as const)("opens the existing %s URL with its related tools and active item", (path, name, labels, active) => {
    render(<MemoryRouter initialEntries={[path]}><ManagerSectionNavigation /></MemoryRouter>);
    const navigation = screen.getByRole("navigation", { name });
    expect(within(navigation).getAllByRole("link").map(link => link.textContent)).toEqual(labels);
    expect(within(navigation).getByRole("link", { name: active })).toHaveAttribute("aria-current", "page");
    expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    if (path === "/mgr/ops/months") {
      expect(within(navigation).getByRole("group", { name: "Công cụ Quản lý" })).toContainElement(screen.getByRole("link", { name: "Ngày nghỉ lễ" }));
      expect(within(navigation).getByRole("group", { name: "Màn hình Vận hành chỉ xem" })).toContainElement(screen.getByRole("link", { name: "Sinh bài" }));
    }
  });

  it.each(["/mgr/requests"])("omits secondary navigation on %s", (path) => {
    render(<MemoryRouter initialEntries={[path]}><ManagerSectionNavigation /></MemoryRouter>);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
