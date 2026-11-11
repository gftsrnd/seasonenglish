// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import type { MonthlySurveyDraft, MonthlySurveyPublished } from "@e4s/contracts";
import { monthlySurveyApi } from "../../api/monthly-surveys.js";
import { LearnerRequestHistory } from "../learner/LearnerRequestHistory.js";
import { learnerApiClient } from "../../api/learner.js";
import { ManagerMonthlySurveys } from "../manager/MonthlySurveys.js";
import { ModalProvider } from "./ModalProvider.js";

const month = "2030-03";
const draft: MonthlySurveyDraft = {
  month, revision: 1, version: 1, title: "Trải nghiệm học tháng 3", publishedAt: null,
  questions: [{ kind: "rating", prompt: "Bài học hữu ích thế nào?", required: true }]
};
const date = "2030-03-10T02:00:00.000Z";
const published: MonthlySurveyPublished = { ...draft, publishedAt: date };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("keeps manager preview separate from publication and requires explicit confirmation", async () => {
  const user = userEvent.setup();
  vi.spyOn(monthlySurveyApi, "getManager").mockResolvedValue({
    currentMonth: month, month, draft, previousPublishedMonth: null, publishedForms: [], submissions: []
  });
  const publish = vi.spyOn(monthlySurveyApi, "publish").mockResolvedValue(published);
  render(<ModalProvider><ManagerMonthlySurveys /></ModalProvider>);

  expect(await screen.findByText("Tháng này chưa có khảo sát được công bố.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Công bố khảo sát" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Xem trước biểu mẫu" }));
  await user.click(screen.getByRole("radio", { name: "4 sao" }));
  await user.click(screen.getByRole("button", { name: "Công bố khảo sát" }));
  const confirm = within(await screen.findByRole("dialog"));
  expect(publish).not.toHaveBeenCalled();
  await user.click(confirm.getByRole("button", { name: "Công bố" }));

  expect(await screen.findByText("Đã công bố khảo sát cho học viên.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Tạo phiên bản mới" })).toBeVisible();
  expect(publish).toHaveBeenCalledWith(month, 1, 1);
});

it("shows the submitted rating with its original question and date in learner history", async () => {
  const user = userEvent.setup();
  vi.spyOn(monthlySurveyApi, "getLearner").mockResolvedValue({ currentMonth: month, surveys: [{ form: published, submission: null }] });
  vi.spyOn(monthlySurveyApi, "submit").mockResolvedValue({ revision: 1, answers: [{ questionIndex: 0, value: 4 }], submittedAt: date });
  vi.spyOn(learnerApiClient, "getLearnerComplaints").mockResolvedValue({ complaints: [] });
  vi.spyOn(learnerApiClient, "getLearnerAppeals").mockResolvedValue({ appeals: [] });
  vi.spyOn(learnerApiClient, "getAppealableAssessments").mockResolvedValue({ results: [] });
  render(<MemoryRouter initialEntries={["/support?type=feedback"]}><LearnerRequestHistory /></MemoryRouter>);

  expect(screen.queryByRole("link", { name: "Quay lại Hỗ trợ" })).not.toBeInTheDocument();
  await user.click(await screen.findByRole("radio", { name: "4 sao" }));
  await user.click(screen.getByRole("button", { name: "Gửi phản hồi" }));

  expect(await screen.findByText("Đã gửi phản hồi. Cảm ơn bạn!")).toBeVisible();
  const history = within(screen.getByRole("table", { name: "Lịch sử hỗ trợ" }));
  const summary = history.getByRole("row", { name: /Đã gửi/ });
  const details = within(summary).getByRole("button", { name: "Chi tiết" });
  expect(history.queryByText("4/5")).not.toBeInTheDocument();
  await user.click(details);
  expect(within(summary).queryByText("4/5")).not.toBeInTheDocument();
  expect(history.getByText("1. Bài học hữu ích thế nào?")).toBeVisible();
  expect(history.getByText("4/5")).toBeVisible();
  expect(history.getByText(/Tháng 03\/2030/)).toBeVisible();
  expect(history.getByRole("time")).toHaveAttribute("datetime", date);
  await user.click(within(summary).getByRole("button", { name: "Thu gọn" }));
  expect(history.queryByText("4/5")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Gửi phản hồi" })).toBeNull();
});
