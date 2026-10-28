// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioEvidencePanel } from "./AudioEvidencePanel.js";

afterEach(cleanup);

describe("AudioEvidencePanel", () => {
  it("shows transcript beside a playable recording and preserves it when playback fails", () => {
    render(<AudioEvidencePanel
      label="Bằng chứng nói"
      evidence={{ artifactKey: "audio/a1.webm", signedUrl: "https://audio.example/a1.webm", transcript: "I can help with that." }}
    />);

    expect(screen.getByText("I can help with that.")).toBeInTheDocument();
    const audio = screen.getByLabelText("Phát Bằng chứng nói");
    expect(audio).toHaveAttribute("src", "https://audio.example/a1.webm");
    fireEvent.error(audio);
    expect(screen.getByRole("alert")).toHaveTextContent("Không phát được bản ghi âm");
    expect(screen.getByText("I can help with that.")).toBeInTheDocument();
  });

  it("reminds after 60 days and requires explicit confirmation before deletion", () => {
    const onDelete = vi.fn();
    render(<AudioEvidencePanel
      label="Bản ghi Season"
      now={new Date("2026-10-28T00:00:00.000Z")}
      onDelete={onDelete}
      evidence={{ fileId: "file-season", artifactKey: "audio/season.webm", signedUrl: "https://audio.example/season.webm", createdAt: "2026-08-01T00:00:00.000Z", transcript: "Season transcript" }}
    />);

    expect(screen.getByText(/đủ 60 ngày và có thể xoá/i)).toBeInTheDocument();
    const deleteButton = screen.getByRole("button", { name: "Xoá bản ghi âm" });
    fireEvent.click(deleteButton);
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Xác nhận xoá bản ghi âm" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xoá bản ghi âm" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Season transcript")).toBeInTheDocument();
  });

  it("keeps result text and deletion metadata visible after the audio is unavailable", () => {
    render(<AudioEvidencePanel
      label="Bằng chứng bài nói"
      resultText="Điểm 82/100 · Đã chấm tay"
      evidence={{ artifactKey: "audio/deleted.webm", transcript: "Original transcript", deletion: { deletedAt: "2026-10-20T10:00:00.000Z", deletedBy: "Minh" } }}
    />);

    expect(screen.getByText("Original transcript")).toBeInTheDocument();
    expect(screen.getByText("Điểm 82/100 · Đã chấm tay")).toBeInTheDocument();
    expect(screen.getByText(/bản ghi âm đã xoá/i)).toBeInTheDocument();
    expect(screen.getByText(/20\/10\/2026/)).toBeInTheDocument();
  });
});
