// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "@testing-library/jest-dom/vitest";

const inbox = vi.fn();
const markRead = vi.fn();
vi.mock("../../api/notifications.js", () => ({ getNotificationInbox: (...args: unknown[]) => inbox(...args), markInboxRead: (...args: unknown[]) => markRead(...args) }));
const { BadgeCelebration } = await import("./BadgeCelebration.js");

const badge = (id: string, label: string, ageDays = 0) => ({ id, kind: "badge_earned", context: label, createdAt: new Date(Date.now() - ageDays * 86_400_000).toISOString(), readAt: null });

beforeEach(() => { window.localStorage.clear(); inbox.mockReset(); markRead.mockReset().mockResolvedValue({ unreadCount: 0 }); });
afterEach(cleanup);

it("celebrates a new badge in a popup and marks it read when closed", async () => {
  inbox.mockResolvedValue({ items: [badge("n1", "Khởi đầu")], unreadCount: 1, nextCursor: null });
  render(<MemoryRouter><BadgeCelebration /></MemoryRouter>);
  expect(await screen.findByRole("dialog", { name: "Bạn vừa nhận huy hiệu Khởi đầu" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tiếp tục học" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(markRead).toHaveBeenCalledWith({ ids: ["n1"] });
  expect(JSON.parse(window.localStorage.getItem("e4s:badge-celebrated") ?? "[]")).toEqual(["n1"]);
});

it("does not celebrate old, already celebrated or other notifications", async () => {
  window.localStorage.setItem("e4s:badge-celebrated", JSON.stringify(["seen"]));
  inbox.mockResolvedValue({ items: [badge("seen", "Khởi đầu"), badge("old", "Chuỗi ngày học", 30), { ...badge("x", "Khác"), kind: "complaint_received" }], unreadCount: 3, nextCursor: null });
  render(<MemoryRouter><BadgeCelebration /></MemoryRouter>);
  await vi.waitFor(() => expect(inbox).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(screen.queryByRole("dialog")).toBeNull();
});
