// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppGuide } from "./AppGuide.js";

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return (this.closest("[hidden]") ? [] : [{}]) as unknown as DOMRectList;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 70, 180, 65));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppGuide", () => {
  it("walks through the manual monthly lesson editor using only guide controls", async () => {
    render(<><AppGuide role="operator" pathname="/op/months" compact={false} />
      <section className="operator-lesson-editor" role="dialog" aria-modal="true" aria-label="Soạn bài">
        <input aria-label="Tiêu đề bài" />
        <div className="operator-vocabulary-base"><input aria-label="Từ 1" /></div>
        <textarea aria-label="Nội dung nghe" />
        <button className="operator-lesson-save-button">Kiểm tra &amp; lưu</button>
      </section>
    </>);
    const editor = screen.getByRole("dialog", { name: "Soạn bài" });
    fireEvent.click(await within(editor).findByRole("button", { name: "Hướng dẫn sử dụng" }));
    const panel = within(screen.getByRole("dialog", { name: "Hướng dẫn sử dụng" }));
    for (const name of ["Đặt mục tiêu bài", "Dùng tài nguyên đã phân bổ", "Chuẩn bị bài tập và audio"]) {
      expect(panel.getByRole("heading", { name })).toBeTruthy();
      fireEvent.click(panel.getByRole("button", { name: "Tiếp theo" }));
    }
    expect(panel.getByRole("heading", { name: "Kiểm tra và lưu bản nháp" })).toBeTruthy();
    fireEvent.click(panel.getByRole("button", { name: "Đã hiểu" }));
    expect(screen.getByRole("dialog", { name: "Soạn bài" })).toBe(editor);
  });

  it("guides reopening an approved monthly lesson in its page and request dialog", async () => {
    const { rerender } = render(<><AppGuide role="operator" pathname="/op/months/lesson/framework/1" compact={false} />
      <button className="operator-lesson-reopen-button">Yêu cầu mở lại</button>
    </>);
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    expect(screen.getByRole("heading", { name: "Yêu cầu mở lại bài" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Đã hiểu" }));
    rerender(<><AppGuide role="operator" pathname="/op/months/lesson/framework/1" compact={false} />
      <button className="operator-lesson-reopen-button">Yêu cầu mở lại</button>
      <section className="monthly-reopen-dialog" role="dialog" aria-modal="true" aria-label="Yêu cầu mở lại bài 1">
        <textarea aria-label="Lý do yêu cầu mở lại" />
      </section>
    </>);
    const dialog = screen.getByRole("dialog", { name: "Yêu cầu mở lại bài 1" });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Hướng dẫn sử dụng" }));
    expect(screen.getByRole("heading", { name: "Nêu lý do mở lại" })).toBeTruthy();
  });

  it("keeps keyboard navigation inside the guide and restores focus on close", () => {
    render(<><AppGuide role="learner" pathname="/home" compact={false} />
      <section data-home-block="primary"><a href="/lesson/1">Bài học</a></section>
      <section data-home-block="month-path"><a href="/lesson/2">Lịch</a></section>
    </>);
    const trigger = screen.getByRole("button", { name: "Hướng dẫn sử dụng" });
    fireEvent.click(trigger);
    const panel = within(screen.getByRole("dialog"));
    const close = panel.getByRole("button", { name: "Đóng hướng dẫn" });
    const next = panel.getByRole("button", { name: "Tiếp theo" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab" });
    expect(document.activeElement).toBe(next);
    fireEvent.keyDown(next, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(next);
    fireEvent.keyDown(next, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
  });

  it("guides the actual Study completion action before practice unlocks", () => {
    render(<><AppGuide role="learner" pathname="/lesson/1" compact={false} />
      <section className="lesson-surface">
        <div className="ltabs"><button>Học</button><button disabled>Luyện tập</button></div>
        <section className="lesson-study-cta"><button>Học xong</button></section>
      </section>
      <section className="lesson-completion"><button disabled>Hoàn thành</button></section>
    </>);
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    const panel = within(screen.getByRole("dialog"));
    expect(panel.getByRole("heading", { name: "Học và luyện tập" })).toBeTruthy();
    fireEvent.click(panel.getByRole("button", { name: "Đã hiểu" }));
  });

  it("walks through the current screen, skipping missing targets", () => {
    render(<><AppGuide role="learner" pathname="/home" compact={false} />
      <section data-home-block="primary"><a href="/lesson/1">Bài học</a></section>
      <section data-home-block="month-path"><a href="/lesson/2">Lịch</a></section>
      <section data-home-block="monthly-exam" hidden>Bài thi</section>
    </>);
    const trigger = screen.getByRole("button", { name: "Hướng dẫn sử dụng" });
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByRole("heading", { name: "Học bài tiếp theo" })).toBeTruthy();
    expect(within(panel).getByText("1 / 2")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Tiếp theo" }));
    expect(screen.getByRole("dialog")).toBe(panel);
    expect(within(panel).getByRole("heading", { name: "Chọn bài trên lịch" })).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Trước" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Tiếp theo" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Đã hiểu" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps underlying actions from navigating or submitting while a guide is open", () => {
    const navigate = vi.fn(event => event.preventDefault());
    const submit = vi.fn(event => event.preventDefault());
    render(<><AppGuide role="learner" pathname="/home" compact={false} />
      <section data-home-block="primary"><a href="/lesson/1" onClick={navigate}>Bài học</a></section>
      <section data-home-block="month-path"><a href="/lesson/2">Lịch</a></section>
      <form onSubmit={submit} aria-label="Form thử" />
    </>);
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    const panel = within(screen.getByRole("dialog"));
    fireEvent.click(screen.getByRole("link", { name: "Bài học" }));
    fireEvent.submit(screen.getByRole("form", { name: "Form thử" }));
    expect(navigate).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(panel.getByRole("button", { name: "Tiếp theo" }));
    fireEvent.click(panel.getByRole("button", { name: "Trước" }));
    fireEvent.click(panel.getByRole("button", { name: "Tiếp theo" }));
    fireEvent.click(panel.getByRole("button", { name: "Đã hiểu" }));
    fireEvent.click(screen.getByRole("link", { name: "Bài học" }));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("changes help on hover or focus while leaving the panel in place", () => {
    render(<><AppGuide role="operator" pathname="/op/months" compact />
      <section className="monthly-topic-card"><div id="monthly-brief-fields"><div className="monthly-topic-grid"><input aria-label="Chủ đề" /></div></div></section>
      <section className="monthly-resources"><button className="monthly-resource-main-action">Tài nguyên</button></section>
      <section id="monthly-teaching-calendar">
        <button aria-label="Tuần trước">Đổi tuần</button>
        <div className="monthly-day-cell lesson"><button className="monthly-day-action monthly-view-day" aria-label="Xem bài 1">Lịch</button></div>
      </section>
    </>);
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    const panel = screen.getByRole("dialog");
    fireEvent.pointerMove(screen.getByText("Lịch"), { pointerType: "mouse" });
    expect(within(panel).getByRole("heading", { name: "Lịch soạn bài" })).toBeTruthy();
    fireEvent.focusIn(screen.getByRole("button", { name: "Tài nguyên" }));
    expect(screen.getByRole("dialog")).toBe(panel);
    expect(within(panel).getByRole("heading", { name: "Tài nguyên tháng" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not jump back when scrolling retargets a stationary pointer after Next", () => {
    render(<><AppGuide role="learner" pathname="/home" compact />
      <section data-home-block="primary"><a href="/lesson/1">Bài học</a></section>
      <section data-home-block="month-path"><a href="/lesson/2">Lịch</a></section>
    </>);
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    const panel = screen.getByRole("dialog");
    const next = within(panel).getByRole("button", { name: "Tiếp theo" });
    fireEvent.click(next, { clientX: 100, clientY: 600, detail: 1 });
    const retarget = new MouseEvent("pointermove", { bubbles: true, clientX: 100, clientY: 600 });
    fireEvent(screen.getByText("Bài học"), retarget);
    expect(within(panel).getByRole("button", { name: "Đã hiểu" })).toBe(next);
    fireEvent.click(next);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves monthly exams outside guide coverage", () => {
    render(<><AppGuide role="learner" pathname="/monthly" compact />
      <header className="monthly-assessment-header">Bài thi</header>
      <section className="monthly-eligibility-summary">Tiến độ</section>
    </>);
    expect(screen.queryByRole("button", { name: "Hướng dẫn sử dụng" })).toBeNull();
  });

  it("uses read-only guidance for manager previews", () => {
    render(<><AppGuide role="manager" pathname="/mgr/ops/months" compact={false} />
      <div className="monthly-level-tabs"><button aria-selected="true" role="tab">A1</button></div>
    </>);
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    expect(within(screen.getByRole("dialog")).getByText(/Bạn có thể xem chủ đề/)).toBeTruthy();
  });

  it("omits generic navigation and hides the button on unmapped or unavailable screens", () => {
    const { rerender } = render(<><AppGuide role="learner" pathname="/test/placement" compact />
      <nav className="bottomnav">Điều hướng</nav><button className="inbox-trigger">Thông báo</button>
    </>);
    expect(screen.queryByRole("button", { name: "Hướng dẫn sử dụng" })).toBeNull();
    rerender(<><AppGuide role="learner" pathname="/monthly" compact />
      <nav className="bottomnav">Điều hướng</nav><button className="inbox-trigger">Thông báo</button>
    </>);
    expect(screen.queryByRole("button", { name: "Hướng dẫn sử dụng" })).toBeNull();
  });

  it("updates support guidance when a complaint form is opened without moving the guide panel", async () => {
    const content = (compose: boolean, reasonKey = "original", expanded = false) => <><AppGuide role="learner" pathname="/support" compact />
      <main className="learner-support-page"><nav className="request-tabs"><a href="?type=complaints" aria-current="page">Khiếu nại</a></nav>
        {compose ? <section aria-labelledby="learner-complaint-title"><h2 id="learner-complaint-title">Khiếu nại mới</h2>
          <form className="learner-support-form"><textarea key={reasonKey} /><div className="request-evidence-picker"><span className="btn">Tải ảnh</span></div></form></section> : null}
        <section className="request-card"><div className="learner-support-history-header">
          {!compose && <button type="button">Gửi khiếu nại</button>}
        </div><button type="button" aria-expanded={expanded}>{expanded ? "Thu gọn" : "Chi tiết"}</button>
          {expanded ? <div className="learner-support-request-detail"><h3>Nội dung đã gửi</h3><h3>Phản hồi</h3></div> : null}
        </section>
      </main>
    </>;
    const { rerender } = render(content(false));
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByRole("heading", { name: "Gửi khiếu nại" })).toBeTruthy();
    rerender(content(true));
    await waitFor(() => expect(within(panel).getByRole("heading", { name: "Thông tin và minh chứng" })).toBeTruthy());
    fireEvent.click(within(panel).getByRole("button", { name: "Tiếp theo" }));
    expect(within(panel).getByRole("heading", { name: "Lý do khiếu nại" })).toBeTruthy();
    rerender(content(true, "replacement"));
    await waitFor(() => expect(within(panel).getByRole("heading", { name: "Lý do khiếu nại" })).toBeTruthy());
    expect(screen.getByRole("dialog")).toBe(panel);
    fireEvent.click(within(panel).getByRole("button", { name: "Tiếp theo" }));
    expect(within(panel).getByRole("heading", { name: "Khiếu nại đã gửi" })).toBeTruthy();
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Đã hiểu" })).toBeTruthy());
    fireEvent.click(within(panel).getByRole("button", { name: "Đã hiểu" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(content(true, "replacement", true));
    await waitFor(() => expect(screen.getByRole("button", { name: "Hướng dẫn sử dụng" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    const expandedPanel = screen.getByRole("dialog");
    await waitFor(() => expect(within(expandedPanel).getByText("1 / 2")).toBeTruthy());
    fireEvent.click(within(expandedPanel).getByRole("button", { name: "Tiếp theo" }));
    expect(within(expandedPanel).getByRole("heading", { name: "Lý do khiếu nại" })).toBeTruthy();
    expect(within(expandedPanel).getByRole("button", { name: "Đã hiểu" })).toBeTruthy();
  });

  it("puts the help trigger inside a supported modal and shows only its steps", async () => {
    const content = (avatarOpen: boolean) => <><AppGuide role="learner" pathname="/profile" compact={false} />
      <section className="profile-identity-card"><button>Hồ sơ</button></section>
      {avatarOpen && <section className="avatar-dialog" role="dialog" aria-modal="true" aria-label="Avatar">
        <header>Avatar</header><div className="avatar-symbol-options"><button>Biểu tượng</button></div>
      </section>}
    </>;
    const { rerender } = render(content(false));
    rerender(content(true));
    const avatar = screen.getByRole("dialog", { name: "Avatar" });
    const trigger = await within(avatar).findByRole("button", { name: "Hướng dẫn sử dụng" });
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Hướng dẫn sử dụng" });
    expect(within(panel).getByRole("heading", { name: "Chọn biểu tượng" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Hướng dẫn sử dụng" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Avatar" })).toBe(avatar);
  });

  it("guides opening an eligible appeal and the active form", async () => {
    const content = (compose: boolean) => <><AppGuide role="learner" pathname="/support" compact />
      <main className="learner-support-page">
        <nav className="request-tabs"><a href="?type=appeals" aria-current="page">Kháng nghị</a></nav>
        <section className="learner-support-action"><div className="assessment-appeal-status">
          {compose ? <form className="learner-support-form"><textarea aria-label="Lý do kháng nghị" /></form>
            : <button aria-expanded={false}>Gửi kháng nghị</button>}
        </div></section>
      </main>
    </>;
    const { rerender } = render(content(false));
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByRole("heading", { name: "Bài có thể kháng nghị" })).toBeTruthy();
    rerender(content(true));
    await waitFor(() => expect(within(panel).getByRole("heading", { name: "Soạn kháng nghị" })).toBeTruthy());
  });

  it("guides a pending home through its actual actions", () => {
    render(<><AppGuide role="learner" pathname="/home" compact />
      <div className="home-page" data-monthly-preparation="true">
        <section data-home-block="primary">Chờ bài tháng</section>
        <section data-home-block="activities"><a href="/coach">Season</a><a href="/monthly">Bài tháng</a></section>
        <section className="learner-summary-card--profile"><a href="/profile">Hồ sơ</a></section>
      </div>
    </>);
    expect(walkSteps()).toEqual(["Luyện với Season trong lúc chờ", "Theo dõi bài tháng", "Hồ sơ và điểm đầu vào"]);
  });

  it("guides the Season workflow and omits unavailable composition controls", async () => {
    const content = (disabled: boolean) => <><AppGuide role="learner" pathname="/coach" compact />
      <button className="coach-persona-toggle">Formal</button>
      <div className="coach-feedback-toggles"><button>Nhận xét</button></div>
      <details className="coach-limit-details"><summary>Tiến độ</summary></details>
      <div className="chat"><button className="coach-turn-audio">Nghe</button></div>
      <form className="chat-compose"><textarea disabled={disabled} /><button type="button" disabled={disabled} aria-label="Nói" /></form>
    </>;
    const { rerender } = render(content(false));
    const controls = ["Chọn cách trò chuyện", "Chọn phản hồi tự mở", "Xem lượt luyện", "Nghe Season nói"];
    expect(walkSteps()).toEqual([...controls, "Trả lời bằng tiếng Anh", "Luyện nói"]);
    rerender(content(true));
    await act(async () => { await new Promise(requestAnimationFrame); });
    expect(walkSteps()).toEqual(controls);
  });

  it("uses the right game guidance for available and missing vocabulary", async () => {
    const content = (ready: boolean) => <><AppGuide role="learner" pathname="/games" compact={false} />
      <main className="games-page">
        <section className="games-topic-card"><div className="topic-create"><input disabled={!ready} /></div>
          {ready ? <button data-game-source-learned>Dùng từ đã học</button> : <a href="/home">Về Trang chủ</a>}
        </section>
        <section className="games-word-set-card">{ready && <button className="word-chip">report</button>}</section>
        <section aria-labelledby="games-picker-title">{ready && <a href="/games/scramble" className="game-tile">Chơi</a>}</section>
      </main>
    </>;
    const { rerender } = render(content(true));
    expect(walkSteps()).toEqual(["Tạo bộ từ theo chủ đề", "Dùng từ đã học", "Ôn từ trước khi chơi", "Chọn trò chơi"]);
    rerender(content(false));
    await act(async () => { await new Promise(requestAnimationFrame); });
    expect(walkSteps()).toEqual(["Chưa có bộ từ để chơi"]);
  });

  it("only guides visible game controls when vocabulary details are collapsed", async () => {
    render(<><AppGuide role="learner" pathname="/games" compact />
      <main className="games-page">
        <details className="game-vocabulary-tools">
          <summary>Bộ từ</summary>
          <section className="games-word-set-card"><button className="word-chip">report</button></section>
          <section className="games-topic-card"><button data-game-source-learned>Dùng từ đã học</button></section>
        </details>
        <section aria-labelledby="games-picker-title"><a href="/games/scramble" className="game-tile">Chơi</a></section>
      </main>
    </>);
    expect(walkSteps()).toEqual(["Bộ từ đang chơi", "Chọn trò chơi"]);
    fireEvent.click(screen.getByText("Bộ từ"));
    await waitFor(() => expect(document.querySelector("details")?.open).toBe(true));
    await act(async () => { await new Promise(requestAnimationFrame); });
    expect(walkSteps()).toEqual(["Ôn từ trước khi chơi", "Dùng từ đã học", "Chọn trò chơi"]);
  });

  it("guides the survey answer and collapsed history, then returns after the inbox closes", async () => {
    const content = (inboxOpen: boolean) => <><AppGuide role="learner" pathname="/support" compact />
      <main className="learner-support-page">
        <nav className="request-tabs"><a href="?type=feedback" aria-current="page">Khảo sát tháng</a></nav>
        <form className="monthly-survey-form">
          <fieldset className="monthly-survey-rating"><div className="monthly-survey-stars"><label><input type="radio" />1 sao</label></div></fieldset>
          <button type="submit">Gửi phản hồi</button>
        </form>
        <section className="request-card">
          <div id="support-feedback-2026-11"><button aria-expanded="true">Thu gọn</button></div>
          <div className="learner-support-request-detail">Nội dung đã gửi</div>
          <div id="support-feedback-2026-10"><button aria-expanded="false">Chi tiết</button></div>
        </section>
      </main>
      {inboxOpen && <section role="dialog" aria-modal="true" className="inbox-dialog">Thông báo</section>}
    </>;
    const { rerender } = render(content(false));
    const stars = document.querySelector<HTMLElement>(".monthly-survey-stars")!;
    vi.spyOn(stars, "getBoundingClientRect").mockReturnValue(new DOMRect(90, 70, 110, 44));
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    expect(document.querySelector<HTMLElement>(".app-guide-spotlight")?.style.left).toBe("80px");
    fireEvent.click(screen.getByRole("button", { name: "Đóng hướng dẫn" }));
    rerender(content(true));
    await waitFor(() => expect((screen.getByRole("button", { name: "Hướng dẫn sử dụng" }) as HTMLButtonElement).disabled).toBe(true));
    rerender(content(false));
    await waitFor(() => expect((screen.getByRole("button", { name: "Hướng dẫn sử dụng" }) as HTMLButtonElement).disabled).toBe(false));
    expect(walkSteps()).toEqual(["Trả lời khảo sát tháng", "Mở phản hồi đã gửi"]);
  });
});

function walkSteps() {
  fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
  const steps: string[] = [];
  const panel = within(screen.getByRole("dialog"));
  for (let index = 0; index < 12; index++) {
    steps.push(panel.getByRole("heading").textContent ?? "");
    const done = panel.queryByRole("button", { name: "Đã hiểu" });
    fireEvent.click(done ?? panel.getByRole("button", { name: "Tiếp theo" }));
    if (done) break;
  }
  return steps;
}
