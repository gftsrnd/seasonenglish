// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { managerApiClient } from "../../api/manager.js";
import { ModalProvider } from "../shared/ModalProvider.js";
import { ManagerHolidays } from "./Holidays.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Manager holiday calendar", () => {
  it("shows sourced automatic holidays as read-only while company holidays remain removable", async () => {
    vi.spyOn(managerApiClient, "getManagerHolidays").mockResolvedValue({ holidays: [
      { id: "company-1", date: "2026-11-25", created_at: "2026-11-06T00:00:00Z", created_by_name: "Quản lý", source: "organization" },
      { id: "vn:2026-11-24:culture", date: "2026-11-24", created_at: "2026-01-01T00:00:00Z", created_by_name: null, source: "national", name: "Ngày Văn hóa Việt Nam", sourceUrl: "https://baochinhphu.vn/holiday" }
    ] });
    render(<ModalProvider><ManagerHolidays /></ModalProvider>);
    const holiday = (await screen.findByText("24/11/2026")).closest("li")!;
    expect(within(holiday).getByText("Lịch lễ Việt Nam", { exact: false })).toBeInTheDocument();
    expect(within(holiday).getByRole("link", { name: "Nguồn chính thức" })).toHaveAttribute("href", "https://baochinhphu.vn/holiday");
    expect(within(holiday).queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
    const user = userEvent.setup();
    const remove = vi.spyOn(managerApiClient, "removeManagerHoliday").mockResolvedValue({ deleted: true });
    const companyHoliday = screen.getByText("25/11/2026").closest("li")!;
    expect(within(companyHoliday).getByRole("button", { name: "Xóa" })).toBeEnabled();
    expect(screen.getAllByRole("listitem")[0]).toBe(companyHoliday);
    await user.click(within(companyHoliday).getByRole("button", { name: "Xóa" }));
    const dialog = await screen.findByRole("dialog", { name: "Xóa ngày nghỉ" });
    await user.click(within(dialog).getByRole("button", { name: "Xóa" }));
    expect(remove).toHaveBeenCalledWith("company-1");
    expect(screen.queryByText("25/11/2026")).not.toBeInTheDocument();
    expect(holiday).toBeInTheDocument();
  });

  it("keeps every date in one scrollable list and filters by source", async () => {
    const user = userEvent.setup();
    vi.spyOn(managerApiClient, "getManagerHolidays").mockResolvedValue({
      holidays: Array.from({ length: 8 }, (_, index) => ({
        id: String(index),
        date: "2026-11-0" + (index + 1),
        created_at: "2026-01-01T00:00:00Z",
        created_by_name: null,
        source: index === 7 ? "organization" : "national"
      }))
    });
    render(<ModalProvider><ManagerHolidays /></ModalProvider>);
    expect(await screen.findByText("08/11/2026")).toBeVisible();
    const list = screen.getByRole("list", { name: "Danh sách ngày nghỉ" });
    expect(list).toHaveAttribute("tabindex", "0");
    expect(within(list).getAllByRole("listitem")).toHaveLength(8);
    expect(within(list).getByText("01/11/2026")).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Loại ngày nghỉ" }), "national");
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByText("07/11/2026")).toBeVisible();
    expect(screen.queryByText("08/11/2026")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sau" })).not.toBeInTheDocument();
  });

  it("creates a declared weekday holiday through the Manager API", async () => {
    const user = userEvent.setup();
    vi.spyOn(managerApiClient, "getManagerHolidays").mockResolvedValue({ holidays: [] });
    const add = vi.spyOn(managerApiClient, "addManagerHoliday").mockResolvedValue({ holiday: { id: "h-1", date: "2027-01-01" } });
    render(<ModalProvider><ManagerHolidays /></ModalProvider>);
    const date = await screen.findByLabelText("Ngày nghỉ");
    await user.type(date, "2027-01-01");
    await user.click(screen.getByRole("button", { name: "Thêm ngày nghỉ" }));
    expect(add).toHaveBeenCalledWith("2027-01-01");
  });
});
