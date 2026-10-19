// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssessmentView } from "@e4s/contracts";
import { Assessment } from "../src/pages/learner/Assessment.js";

afterEach(cleanup);

const preparation: AssessmentView = {
  definition: {
    key: "placement-a",
    kind: "placement",
    title: "Workplace English CEFR Placement Test",
    version: 1,
    totalMinutes: 75,
    totalScore: 100,
    sections: [
      { code: "listening", title: "Nghe", durationMinutes: 15, maxScore: 20, instructions: [], groups: [] },
      { code: "reading", title: "Đọc, Ngữ pháp & Từ vựng", durationMinutes: 25, maxScore: 40, instructions: [], groups: [] },
      { code: "writing", title: "Viết", durationMinutes: 20, maxScore: 20, instructions: [], groups: [] },
      { code: "speaking", title: "Nói", durationMinutes: 15, maxScore: 20, instructions: [], groups: [] }
    ]
  },
  screenState: "preparation",
  attempt: null
};

describe("assessment remains one app screen flow", () => {
  it("shows the four existing sections and starts inside the same screen", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<Assessment view={preparation} onStart={onStart} onSaveResponse={vi.fn()} onCompleteSection={vi.fn()} onSubmit={vi.fn()} onRecordAudioPlay={vi.fn()} />);

    expect(screen.getByRole("heading", { name: /workplace english cefr placement test/i })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /cấu trúc bài test/i })).toHaveTextContent(/nghe.*đọc.*viết.*nói/i);
    expect(screen.getByText(/75 phút/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /kiểm tra tai nghe/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /kiểm tra micro/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bắt đầu phần nghe/i })).toBeInTheDocument();
    expect(screen.queryByText(/màn setup mới/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /bắt đầu phần nghe/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("uses final-assessment copy when the final route supplies a final definition", () => {
    const finalView: AssessmentView = {
      ...preparation,
      definition: {
        ...preparation.definition,
        key: "final-a",
        kind: "final",
        title: "Bài kiểm tra cuối kỳ"
      }
    };

    render(<Assessment view={finalView} onStart={vi.fn()} onSaveResponse={vi.fn()} onCompleteSection={vi.fn()} onSubmit={vi.fn()} onRecordAudioPlay={vi.fn()} />);

    expect(screen.getByText("E4S · Bài test cuối kỳ")).toBeInTheDocument();
    expect(screen.getByText(/dùng cùng rubric với bài đầu vào để nhìn thấy tiến bộ/i)).toBeInTheDocument();
    expect(screen.queryByText(/xếp đúng mức học ban đầu/i)).not.toBeInTheDocument();
  });

  it("renders an active section with progress, timer and one submit-section action", () => {
    const view: AssessmentView = {
      ...preparation,
      screenState: "listening",
      attempt: {
        id: "00000000-0000-4000-8000-000000009001",
        status: "in_progress",
        currentSection: "listening",
        startedAt: "2026-10-13T10:00:00.000Z",
        sectionEndsAt: "2026-10-13T10:15:00.000Z",
        responses: [],
        sectionStatuses: { listening: "in_progress", reading: "locked", writing: "locked", speaking: "locked" },
        audioPlayCounts: {}
      }
    };
    render(<Assessment view={view} onStart={vi.fn()} onSaveResponse={vi.fn()} onCompleteSection={vi.fn()} onSubmit={vi.fn()} onRecordAudioPlay={vi.fn()} />);

    expect(screen.getByText(/phần 1\/4.*nghe/i)).toBeInTheDocument();
    expect(screen.getByRole("timer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /nộp phần nghe/i })).toBeInTheDocument();
  });

  it("keeps a listening group locked after its two server-recorded plays on reload", () => {
    const view: AssessmentView = {
      ...preparation,
      definition: {
        ...preparation.definition,
        sections: [{
          ...preparation.definition.sections[0]!,
          groups: [{ key: "LA", title: "Part A", instruction: "Nghe tối đa hai lần.", maxPlays: 2, tasks: [] }]
        }, ...preparation.definition.sections.slice(1)]
      },
      screenState: "listening",
      attempt: {
        id: "00000000-0000-4000-8000-000000009001",
        status: "in_progress",
        currentSection: "listening",
        startedAt: "2026-10-13T10:00:00.000Z",
        sectionEndsAt: "2026-10-13T10:15:00.000Z",
        responses: [],
        sectionStatuses: { listening: "in_progress", reading: "locked", writing: "locked", speaking: "locked" },
        audioPlayCounts: { "listening:LA": 2 }
      }
    };

    render(<Assessment view={view} onStart={vi.fn()} onSaveResponse={vi.fn()} onCompleteSection={vi.fn()}
      onSubmit={vi.fn()} onRecordAudioPlay={vi.fn()} />);

    expect(screen.getByRole("button", { name: /nghe.*còn 0 lần/i })).toBeDisabled();
  });

  it("keeps audio recording or upload visible in the existing Speaking state", () => {
    const speaking = preparation.definition.sections[3]!;
    const view: AssessmentView = {
      ...preparation,
      definition: { ...preparation.definition, sections: [
        ...preparation.definition.sections.slice(0, 3),
        { ...speaking, groups: [{
          key: "S", title: "Speaking tasks", instruction: "Nộp bằng chứng nói.",
          tasks: [{ key: "S1", prompt: "Introduce yourself.", responseType: "speaking_evidence", maxScore: 5 }]
        }] }
      ] },
      screenState: "speaking",
      attempt: {
        id: "00000000-0000-4000-8000-000000009001", status: "in_progress", currentSection: "speaking",
        startedAt: "2026-10-13T10:00:00.000Z", sectionEndsAt: "2026-10-13T10:15:00.000Z", responses: [],
        sectionStatuses: { listening: "completed", reading: "completed", writing: "completed", speaking: "in_progress" },
        audioPlayCounts: {}
      }
    };
    render(<Assessment view={view} onStart={vi.fn()} onSaveResponse={vi.fn()} onCompleteSection={vi.fn()} onSubmit={vi.fn()} onRecordAudioPlay={vi.fn()} />);

    expect(screen.getByRole("button", { name: /ghi âm/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/tải file ghi âm/i)).toBeInTheDocument();
    expect(screen.getByText(/lời chép/i)).toBeInTheDocument();
  });

  it("uploads a speaking file before saving its server-issued artifact key", async () => {
    const user = userEvent.setup();
    const onSaveResponse = vi.fn();
    const onUploadAudio = vi.fn().mockResolvedValue("assessment-audio/learner-id/speaking.webm");
    const speaking = preparation.definition.sections[3]!;
    const view: AssessmentView = {
      ...preparation,
      definition: { ...preparation.definition, sections: [
        ...preparation.definition.sections.slice(0, 3),
        { ...speaking, groups: [{
          key: "S", title: "Speaking tasks", instruction: "Nộp bằng chứng nói.",
          tasks: [{ key: "S1", prompt: "Introduce yourself.", responseType: "speaking_evidence", maxScore: 5 }]
        }] }
      ] },
      screenState: "speaking",
      attempt: {
        id: "00000000-0000-4000-8000-000000009001", status: "in_progress", currentSection: "speaking",
        startedAt: "2026-10-13T10:00:00.000Z", sectionEndsAt: "2026-10-13T10:15:00.000Z", responses: [],
        sectionStatuses: { listening: "completed", reading: "completed", writing: "completed", speaking: "in_progress" },
        audioPlayCounts: {}
      }
    };

    render(<Assessment view={view} onStart={vi.fn()} onSaveResponse={onSaveResponse} onCompleteSection={vi.fn()}
      onSubmit={vi.fn()} onRecordAudioPlay={vi.fn()} {...({ onUploadAudio } as object)} />);
    await user.upload(screen.getByLabelText(/tải file ghi âm/i), new File(["voice"], "speaking.webm", { type: "audio/webm" }));

    await waitFor(() => expect(onUploadAudio).toHaveBeenCalledWith(expect.any(File), "speaking.webm"));
    await waitFor(() => expect(onSaveResponse).toHaveBeenCalledWith("speaking", "S1", {
      value: "File ghi âm đã nộp", evidenceType: "audio", artifactKey: "assessment-audio/learner-id/speaking.webm"
    }));
  });
});
