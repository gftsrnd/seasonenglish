// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { managerApiClient } from "../../api/manager.js";
import { ManagerHolidays } from "./Holidays.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Manager holiday calendar", () => {
  it("creates a declared weekday holiday through the Manager API", async () => {
    const user = userEvent.setup();
    vi.spyOn(managerApiClient, "getManagerHolidays").mockResolvedValue({ holidays: [] });
    const add = vi.spyOn(managerApiClient, "addManagerHoliday").mockResolvedValue({ holiday: { id: "h-1", date: "2027-01-01" } });
    render(<ManagerHolidays />);
    const date = await screen.findByLabelText("Ngày nghỉ");
    await user.type(date, "2027-01-01");
    await user.click(screen.getByRole("button", { name: "Thêm ngày nghỉ" }));
    expect(add).toHaveBeenCalledWith("2027-01-01");
  });
});
