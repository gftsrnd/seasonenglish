// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import type { ContentWeekFrameView } from "@e4s/contracts";
import { Weeks } from "./Weeks.js";

afterEach(cleanup);

const view: ContentWeekFrameView = {
  pilot: { startDate: "2026-10-05", weekCount: 1 },
  weeks: [{
    id: "week-1", weekNumber: 1, startDate: "2026-10-05", endDate: "2026-10-11", current: true,
    topic: "", description: "", objectives: "", keyVocabHint: ""
  }]
};

it("confirms an AI week option by filling and saving that week in place", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onSuggest = vi.fn().mockResolvedValue([{ weekNumber: 1, options: [{
    topic: "Introducing yourself & your job",
    description: "Tự giới thiệu trong buổi họp đầu với khách.",
    objectives: "Nói được 5 câu về công việc.",
    keyVocabHint: "role, responsible for, deadline"
  }] }]);

  render(<MemoryRouter><Weeks view={view} readOnly={false} onSave={onSave} onSuggest={onSuggest} /></MemoryRouter>);
  await user.click(screen.getByRole("button", { name: "Gợi ý" }));
  expect(await screen.findByText("Introducing yourself & your job")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Xác nhận phương án này" }));

  expect(onSave).toHaveBeenCalledWith([expect.objectContaining({
    weekNumber: 1,
    topic: "Introducing yourself & your job",
    objectives: "Nói được 5 câu về công việc."
  })]);
  expect(screen.getByDisplayValue("Introducing yourself & your job")).toBeInTheDocument();
});
