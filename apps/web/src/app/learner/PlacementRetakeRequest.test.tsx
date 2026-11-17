// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssessmentPlacementRetakeRequestView, InboxNotificationView } from "@e4s/contracts";
import { PlacementRetakeRequest } from "./PlacementRetakeRequest.js";
import { notificationContent } from "../shared/NotificationBell.js";
import { AppealReviewCard } from "../operator/Review.js";
import { adaptReviewAppeal } from "../operator/adapters.js";

afterEach(cleanup);

const notification = (kind: string, context: string) => ({ id: "n1", kind, context, createdAt: "2026-11-16T03:00:00.000Z", readAt: null }) as unknown as InboxNotificationView;
const view = (overrides: Partial<AssessmentPlacementRetakeRequestView>): AssessmentPlacementRetakeRequestView => ({ original: null, target: null, request: null, retake: "not_granted", ...overrides });
const renderRequest = (api: NonNullable<Parameters<typeof PlacementRetakeRequest>[0]["api"]>) => render(<MemoryRouter><PlacementRetakeRequest api={api} /></MemoryRouter>);

describe("placement retake request: bell → support page → 'Xin thi lại' → Operator decision", () => {
  it("sends the placement result bell to the support page, and the request bells to the Operator and back", () => {
    expect(notificationContent(notification("assessment_result", "placement"))).toEqual(expect.objectContaining({ path: "/support?tab=appeals", description: expect.stringContaining("72 giờ") }));
    expect(notificationContent(notification("assessment_retry", "placement")).path).toBe("/support?tab=appeals");
    expect(notificationContent(notification("appeal_received", "retake"))).toEqual(expect.objectContaining({ title: "Yêu cầu thi lại", path: "/op/review?tab=appeals" }));
    expect(notificationContent(notification("appeal_rejected", "retake")).title).toBe("Yêu cầu thi lại bị từ chối");
    expect(notificationContent(notification("retake_granted", "placement")).path).toBe("/test/placement");
  });

  it("sends the optional reason only after confirmation", async () => {
    const user = userEvent.setup();
    const createPlacementRetakeRequest = vi.fn(async () => view({ request: { id: "r1", status: "pending", resolution: null, createdAt: "2026-11-16T03:00:00.000Z", resolvedAt: null } }));
    renderRequest({ getPlacementRetakeRequest: async () => view({ target: { attemptId: "a1", title: "Test đầu vào", availableUntil: "2026-11-19T02:00:00.000Z" } }), createPlacementRetakeRequest });
    await user.click(await screen.findByRole("button", { name: "Xin thi lại" }));
    await user.type(screen.getByRole("textbox", { name: /Lý do/ }), "  Tôi muốn thử lại.  ");
    expect(screen.getByRole("dialog")).toHaveTextContent(/quyết định cuối cùng/i);
    await user.click(screen.getByRole("button", { name: "Hủy" }));
    expect(createPlacementRetakeRequest).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Xin thi lại" }));
    await user.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
    expect(createPlacementRetakeRequest).toHaveBeenCalledExactlyOnceWith("Tôi muốn thử lại.");
    expect(await screen.findByText(/Đã gửi yêu cầu thi lại/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xin thi lại" })).not.toBeInTheDocument();
  });

  it("shows nothing once the 72 h window has expired without a request", async () => {
    const getPlacementRetakeRequest = vi.fn(async () => view({}));
    const { container } = renderRequest({ getPlacementRetakeRequest });
    await vi.waitFor(() => expect(getPlacementRetakeRequest).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the learner the Operator's decision", async () => {
    renderRequest({ getPlacementRetakeRequest: async () => view({ retake: "granted", request: { id: "r1", status: "accepted", resolution: "Cho thi lại một lần.", createdAt: "x", resolvedAt: "y" } }) });
    expect(await screen.findByText(/Yêu cầu thi lại đã được duyệt/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở bài thi lại" })).toHaveAttribute("href", "/test/placement");
    cleanup();
    renderRequest({ getPlacementRetakeRequest: async () => view({ request: { id: "r1", status: "rejected", resolution: "Kết quả phù hợp.", createdAt: "x", resolvedAt: "y" } }) });
    expect(await screen.findByText(/Yêu cầu thi lại bị từ chối/)).toBeInTheDocument();
    expect(screen.getByText("Phản hồi của Vận hành: Kết quả phù hợp.")).toBeInTheDocument();
  });

  it("lets the Operator approve or reject the request from the appeal queue", async () => {
    const user = userEvent.setup();
    const onDecision = vi.fn();
    const item = adaptReviewAppeal({
      id: "r1", learnerName: "Lan", reason: "Xin thi lại bài đầu vào", status: "pending", createdAt: "2026-11-16T03:00:00.000Z", resolution: "",
      kind: "assessment", requestKind: "retake", submissionId: null, attemptId: "a1", currentScore: null, lessonTitle: "Test đầu vào", scope: null, hasEvidence: false
    } as Parameters<typeof adaptReviewAppeal>[0]);
    render(<AppealReviewCard item={item} readOnly={false} busy={() => false} itemBusy={false} onDecision={onDecision} />);
    expect(screen.getByRole("heading", { name: "Yêu cầu thi lại bài đầu vào" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Duyệt cho thi lại" }));
    await user.click(screen.getByRole("button", { name: "Từ chối thi lại" }));
    expect(onDecision.mock.calls).toEqual([[true], [false]]);
  });
});
