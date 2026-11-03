// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { AssessmentDefinitionView } from "@e4s/contracts";
import { describe, expect, it } from "vitest";
import { AssessmentDefinitionPreview } from "./AssessmentDefinitionPreview.js";

const definition: AssessmentDefinitionView = {
  key: "placement-a", kind: "placement", title: "Workplace English CEFR Placement Test", version: 5,
  totalMinutes: 75, totalScore: 100,
  sections: [
    { code: "listening", title: "Nghe", durationMinutes: 15, maxScore: 20, instructions: ["Nghe tối đa 2 lần."], groups: [{ key: "L1", title: "Listening", instruction: "Nghe và chọn đáp án.", maxPlays: 2, stimulus: { type: "audio_script", audioSrc: "/audio/listening.mp3", lines: [{ speaker: "A", text: "Hello" }] }, tasks: [{ key: "L1", prompt: "What happened?", responseType: "single_choice", maxScore: 1, options: [{ value: "A", label: "A meeting" }, { value: "B", label: "A call" }] }] }] },
    { code: "reading", title: "Đọc", durationMinutes: 25, maxScore: 40, instructions: ["Đọc kỹ."], groups: [{ key: "R1", title: "Reading", instruction: "Đọc văn bản.", tasks: [{ key: "R1", prompt: "Choose.", responseType: "single_choice", maxScore: 1 }] }] },
    { code: "writing", title: "Viết", durationMinutes: 20, maxScore: 20, instructions: ["Viết email."], groups: [{ key: "W1", title: "Writing", instruction: "Viết.", tasks: [{ key: "W1", prompt: "Write an email.", responseType: "long_text", maxScore: 20 }] }] },
    { code: "speaking", title: "Nói", durationMinutes: 15, maxScore: 20, instructions: ["Ghi âm."], groups: [{ key: "S1", title: "Speaking", instruction: "Nói.", tasks: [{ key: "S1", prompt: "1. Introduce yourself.\n2. Describe your role.", responseType: "speaking_evidence", maxScore: 20 }] }] }
  ]
};

describe("AssessmentDefinitionPreview", () => {
  it("renders one persisted section at a time from the vertical section list", async () => {
    const user = userEvent.setup();
    render(<AssessmentDefinitionPreview definition={definition} status="published" readOnly />);
    expect(screen.getByRole("heading", { name: "Workplace English CEFR Placement Test" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tổng quan bài thi")).toHaveTextContent("75 phút");
    expect(screen.getByLabelText("Tổng quan bài thi")).toHaveTextContent("100 điểm");
    expect(screen.getByRole("table", { name: "Cấu trúc bài thi" })).toHaveTextContent("Nghe");
    expect(screen.queryByText("Nguồn audio đã sẵn sàng")).not.toBeInTheDocument();
    expect(screen.queryByText("What happened?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nghe.*1 câu.*15 phút.*20 điểm/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Nói.*1 câu.*15 phút.*20 điểm/ })).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: /Nghe.*1 câu.*15 phút.*20 điểm/ }));
    expect(screen.getByText("Nguồn audio đã sẵn sàng")).toBeInTheDocument();
    expect(screen.getByText("What happened?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nghe.*1 câu.*15 phút.*20 điểm/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("Introduce yourself.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Nói.*1 câu.*15 phút.*20 điểm/ }));
    expect(screen.getByRole("button", { name: /Nghe.*1 câu.*15 phút.*20 điểm/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Nói.*1 câu.*15 phút.*20 điểm/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Introduce yourself.")).toBeInTheDocument();
    expect(screen.getByText("Describe your role.")).toBeInTheDocument();
    expect(document.querySelectorAll(".assessment-definition-preview-speaking-task")).toHaveLength(1);
    expect(document.querySelectorAll(".assessment-definition-preview-prompt-lines > li")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: /Nói.*1 câu.*15 phút.*20 điểm/ }));
    expect(screen.getByRole("button", { name: /Nói.*1 câu.*15 phút.*20 điểm/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Introduce yourself.")).not.toBeInTheDocument();
    expect(screen.getByText("Chỉ xem")).toBeInTheDocument();
  });


  it("splits canonical parenthetical speaking prompts into separate rows", async () => {
    cleanup();
    const user = userEvent.setup();
    const passDefinition = structuredClone(definition);
    passDefinition.sections[3]!.groups[0]!.tasks[0]!.prompt = "Complete all four parts: (1) Introduce yourself. (2) Describe your role. (3) Explain a recent challenge. (4) Ask one follow-up question.";
    render(<AssessmentDefinitionPreview definition={passDefinition} status="published" readOnly />);
    await user.click(screen.getByRole("button", { name: /Nói.*1 câu.*15 phút.*20 điểm/ }));
    const rows = document.querySelectorAll(".assessment-definition-preview-prompt-lines > li");
    expect(rows).toHaveLength(4);
    expect(Array.from(rows).map(row => row.textContent)).toEqual([
      "Introduce yourself.",
      "Describe your role.",
      "Explain a recent challenge.",
      "Ask one follow-up question."
    ]);
  });});
