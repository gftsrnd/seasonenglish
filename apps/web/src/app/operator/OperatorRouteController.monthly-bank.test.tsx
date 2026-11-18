// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssessmentFormPreviewView, SessionView } from "@e4s/contracts";
import { OperatorRouteController } from "./OperatorRouteController.js";

afterEach(() => { cleanup(); vi.useRealTimers(); });

function form(month: string, targetLevel: "A1" | "B1" | "C1", status: "draft" | "published" | "retired"): AssessmentFormPreviewView {
  return { definitionId: `${month}-${targetLevel}`, versionId: `${month}-${targetLevel}-${status}`, kind: "final", month,
    monthlyFrameworkId: `${month}-${targetLevel}`, title: `${month} ${targetLevel} ${status}`, version: 1, status,
    publishedAt: status === "published" ? "2026-12-01T00:00:00Z" : null, targetLevel, editable: status === "draft",
    totalMinutes: 30, totalScore: 100, audioConfigured: false, sections: [] } as AssessmentFormPreviewView;
}

const forms = [form("2026-10", "B1", "published"), form("2026-11", "A1", "draft"), form("2026-11", "B1", "published"), form("2026-11", "C1", "retired"), form("2027-01", "B1", "draft")];
function setup(items = forms, readOnly = false) {
  const client = {
    getAssessmentFormPreviews: vi.fn().mockResolvedValue({ kind: "final", forms: items }),
    getContentReview: vi.fn().mockResolvedValue({ tabs: [], submissions: [], coachSamples: [], microLessons: [], weeklyPractices: [], appeals: [], lessonAttempts: [], assessments: [] }),
    getSystemCapabilities: vi.fn().mockResolvedValue({ ai: true })
  };
  const session = { role: readOnly ? "manager" : "operator", user: { id: "staff", displayName: "Staff", email: null }, permissions: ["content:operate", "assessment:review", "prompt:manage"] } as SessionView;
  render(<MemoryRouter initialEntries={["/op/tests?tab=monthly"]}><OperatorRouteController session={session} client={client as any} /></MemoryRouter>);
  return client;
}

describe("monthly exam bank month selection", () => {
  it("defaults to the current available month and keeps all levels and statuses together", async () => {
    vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
    setup();
    const months = await screen.findByRole("tablist", { name: "Tháng của đề thi" });
    expect(within(months).getAllByRole("tab").map(tab => tab.textContent)).toEqual(["10/2026", "11/2026", "01/2027"]);
    expect(within(months).getByRole("tab", { name: "11/2026" })).toHaveAttribute("aria-selected", "true");
    const bank = screen.getByRole("region", { name: "Phiên bản đề thi đã lưu" });
    for (const level of ["A1 draft", "B1 published", "C1 retired"]) expect(within(bank).getByText(`2026-11 ${level}`)).toBeInTheDocument();
    expect(within(bank).getByText("3 phiên bản")).toBeInTheDocument();
    expect(within(bank).queryByText("2026-10 B1 published")).not.toBeInTheDocument();
    expect(within(bank).queryByText("2027-01 B1 draft")).not.toBeInTheDocument();
    fireEvent.click(within(months).getByRole("tab", { name: "01/2027" }));
    expect(within(bank).getByText("2027-01 B1 draft")).toBeInTheDocument();
    expect(within(bank).getByText("1 phiên bản")).toBeInTheDocument();
    expect(within(bank).queryByText("2026-11 A1 draft")).not.toBeInTheDocument();
    fireEvent.click(within(months).getByRole("tab", { name: "10/2026" }));
    expect(within(bank).getByText("2026-10 B1 published")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chọn đề & cấu hình trộn" })).not.toBeInTheDocument();
  });

  it("chooses the latest past available month when the current month has no exam", async () => {
    vi.setSystemTime(new Date("2026-12-18T12:00:00Z"));
    setup();
    expect(await screen.findByRole("tab", { name: "11/2026" })).toHaveAttribute("aria-selected", "true");
  });

  it("chooses the nearest upcoming month when all exams are in the future", async () => {
    vi.setSystemTime(new Date("2026-09-18T12:00:00Z"));
    setup();
    expect(await screen.findByRole("tab", { name: "10/2026" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps legacy exams with missing month in a separate unassigned group", async () => {
    const legacy = form("2026-11", "B1", "published");
    delete legacy.month;
    legacy.title = "Legacy monthly exam";
    setup([...forms, legacy]);
    const unknown = await screen.findByRole("tab", { name: "Chưa rõ tháng" });
    expect(screen.queryByText("Legacy monthly exam")).not.toBeInTheDocument();
    fireEvent.click(unknown);
    const bank = screen.getByRole("region", { name: "Phiên bản đề thi đã lưu" });
    expect(within(bank).getByText("Legacy monthly exam")).toBeInTheDocument();
    expect(within(bank).getByText("1 phiên bản")).toBeInTheDocument();
    expect(within(bank).queryByText("2026-11 B1 published")).not.toBeInTheDocument();
  });

  it("allows read-only managers to change month and view exams without mutations", async () => {
    setup(forms, true);
    fireEvent.click(await screen.findByRole("tab", { name: "11/2026" }));
    expect(screen.queryByRole("button", { name: "Sửa đề" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xoá" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xem 2026-11 A1 draft" }));
    expect(await screen.findByRole("dialog", { name: "Xem đề 2026-11 A1 draft" })).toBeInTheDocument();
  });

  it("shows the existing empty state with no month selector when the bank is empty", async () => {
    setup([]);
    expect(await screen.findByRole("region", { name: "Chưa có nội dung đề thi" })).toHaveTextContent("Chưa có bài thi tháng");
    expect(screen.queryByRole("tablist", { name: "Tháng của đề thi" })).not.toBeInTheDocument();
  });
});
