// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { AppGuide } from "./AppGuide.js";
import { allGuideSteps } from "./app-guide-steps.js";

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
  it("keeps every step within the writing rules in docs/guide-writing-rules.md", () => {
    const problems = allGuideSteps.flatMap(([route, steps]) => steps.flatMap(([selector, title, text]) => {
      const plain = text.replace(/\*\*/g, "");
      const words = plain.split(/\s+/).filter(Boolean).length;
      const sentences = plain.split(/[.!?](?:\s|$)/).filter(part => part.trim()).length;
      return [
        ...(title.split(/\s+/).length > 5 ? [`${route} "${title}": tiêu đề quá 5 tiếng`] : []),
        ...(words > 32 || sentences > 2 ? [`${route} "${title}": ${words} tiếng, ${sentences} câu`] : []),
        ...(/\n|^\s*[-•]/.test(text) ? [`${route} "${title}": dùng danh sách thay cho đoạn văn`] : []),
        ...((text.match(/\*\*/g)?.length ?? 0) % 2 ? [`${route} "${title}": thiếu dấu ** đóng`] : []),
        // Một bước là một thẻ hoặc khu vực, không trỏ thẳng vào nút hay ô nhập.
        ...(topLevel(selector).split(",").some(part => /^(?:button|input|select|textarea|a)(?:[.:#]|$)/.test(part.trim().split(/[\s>+~]+/).at(-1) ?? ""))
          ? [`${route} "${title}": trỏ vào nút hoặc ô nhập`] : []),
      ];
    }));
    expect(problems).toEqual([]);
  });

  it("renders bold markers as bold text", () => {
    render(<><AppGuide role="manager" pathname="/mgr/holidays" compact={false} />
      <form className="manager-holiday-form"><input type="date" /></form>
    </>);
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    const copy = screen.getByRole("dialog").querySelector("p")!;
    expect(copy.querySelector("b")?.textContent).toBe("Thêm ngày nghỉ");
    expect(copy.textContent).not.toContain("**");
  });

  it("starts from step 1 every time the guide is reopened, even with a prioritized card on screen", () => {
    render(<><AppGuide role="learner" pathname="/monthly" compact />
      <section className="monthly-assessment-landing"><header className="monthly-assessment-header">Lịch thi</header>
        <div className="monthly-assessment-form-state"><p>Vắng quá giới hạn.</p></div>
        <section className="monthly-eligibility-summary"><div className="monthly-eligibility-metrics">Điều kiện</div></section>
        <section className="card monthly-complaint-form"><h3>Khiếu nại điều kiện dự thi</h3><textarea aria-label="Lý do" /></section></section>
    </>);
    const trigger = screen.getByRole("button", { name: "Hướng dẫn sử dụng" });
    const step = () => within(screen.getByRole("dialog")).getByRole("heading").textContent;
    fireEvent.click(trigger);
    expect(step()).toBe("Lịch thi tháng");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Tiếp theo" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Tiếp theo" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đóng hướng dẫn" }));
    fireEvent.click(trigger);
    expect(step()).toBe("Lịch thi tháng");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Tiếp theo" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger);
    expect(step()).toBe("Lịch thi tháng");
  });

  it("keeps the guide box in its fixed place across steps and page scrolls", () => {
    render(<><AppGuide role="manager" pathname="/mgr/holidays" compact />
      <form className="manager-holiday-form"><input type="date" /></form>
      <section className="manager-holiday-calendar"><select aria-label="Loại ngày nghỉ" /></section>
    </>);
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    const panel = screen.getByRole("dialog");
    const placement = () => [...panel.attributes].map(attribute => attribute.name).filter(name => name.startsWith("data-")).sort().join(",");
    const initial = placement();
    act(() => { window.dispatchEvent(new Event("scroll")); });
    expect(placement()).toBe(initial);
    fireEvent.click(within(panel).getByRole("button", { name: "Tiếp theo" }));
    act(() => { window.dispatchEvent(new Event("scroll")); });
    expect(screen.getByRole("dialog")).toBe(panel);
    expect(placement()).toBe(initial);
    expect(panel.hasAttribute("data-place")).toBe(false);
  });

  it("orders steps by their position on screen", () => {
    render(<><AppGuide role="manager" pathname="/mgr/holidays" compact={false} />
      <section className="manager-holiday-calendar"><select aria-label="Loại ngày nghỉ" /></section>
      <form className="manager-holiday-form"><input type="date" /></form>
    </>);
    expect(walkSteps()).toEqual(["Lịch nghỉ lễ", "Thêm ngày nghỉ"]);
  });

  it("walks through the manual monthly lesson editor using only guide controls", async () => {
    render(<><AppGuide role="operator" pathname="/op/months" compact={false} />
      <section className="operator-lesson-editor" role="dialog" aria-modal="true" aria-label="Soạn bài">
        <fieldset className="operator-editor-section"><input aria-label="Tiêu đề bài" /></fieldset>
        <fieldset className="operator-editor-section"><div className="operator-vocabulary-base"><input aria-label="Từ 1" /></div></fieldset>
        <fieldset className="operator-editor-section"><textarea aria-label="Nội dung nghe" /></fieldset>
        <div className="operator-editor-actions"><button className="operator-lesson-save-button">Kiểm tra &amp; lưu</button></div>
      </section>
    </>);
    const editor = screen.getByRole("dialog", { name: "Soạn bài" });
    fireEvent.click(await within(editor).findByRole("button", { name: "Hướng dẫn sử dụng" }));
    const panel = within(screen.getByRole("dialog", { name: "Hướng dẫn sử dụng" }));
    for (const name of ["Thông tin chung", "Từ vựng của ngày", "Các phần bài tập"]) {
      expect(panel.getByRole("heading", { name })).toBeTruthy();
      fireEvent.click(panel.getByRole("button", { name: "Tiếp theo" }));
    }
    expect(panel.getByRole("heading", { name: "Kiểm tra và lưu" })).toBeTruthy();
    fireEvent.click(panel.getByRole("button", { name: "Đã hiểu" }));
    expect(screen.getByRole("dialog", { name: "Soạn bài" })).toBe(editor);
  });

  it("points at collapsed editor sections on narrow screens", async () => {
    render(<><AppGuide role="operator" pathname="/op/months" compact />
      <section className="operator-lesson-editor" role="dialog" aria-modal="true" aria-label="Soạn bài">
        <details className="operator-editor-collapsible" data-section="general" open><summary>Chung</summary>
          <fieldset className="operator-editor-section"><input aria-label="Tiêu đề bài" /></fieldset></details>
        <details className="operator-editor-collapsible" data-section="vocabulary"><summary>Từ vựng</summary>
          <fieldset className="operator-editor-section"><div className="operator-vocabulary-base"><input aria-label="Từ 1" /></div></fieldset></details>
      </section>
    </>);
    const editor = screen.getByRole("dialog", { name: "Soạn bài" });
    fireEvent.click(await within(editor).findByRole("button", { name: "Hướng dẫn sử dụng" }));
    fireEvent.click(screen.getByRole("button", { name: "Tiếp theo" }));
    expect(screen.getByRole("heading", { name: "Từ vựng của ngày" })).toBeTruthy();
    expect(document.querySelector<HTMLElement>(".app-guide-spotlight")).toBeTruthy();
  });

  it("guides reopening an approved monthly lesson in its page and request dialog", async () => {
    const page = <div className="row operator-page-title-actions"><button className="operator-lesson-reopen-button">Yêu cầu mở lại</button></div>;
    const { rerender } = render(<><AppGuide role="operator" pathname="/op/months/lesson/framework/1" compact={false} />{page}</>);
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    expect(screen.getByRole("heading", { name: "Thao tác bài" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Đã hiểu" }));
    rerender(<><AppGuide role="operator" pathname="/op/months/lesson/framework/1" compact={false} />{page}
      <section className="monthly-reopen-dialog" role="dialog" aria-modal="true" aria-label="Yêu cầu mở lại bài 1">
        <label className="monthly-reopen-reason">Lý do<textarea aria-label="Lý do yêu cầu mở lại" /></label>
      </section>
    </>);
    const dialog = screen.getByRole("dialog", { name: "Yêu cầu mở lại bài 1" });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Hướng dẫn sử dụng" }));
    expect(screen.getByRole("heading", { name: "Yêu cầu mở lại" })).toBeTruthy();
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

  it("guides the lesson by its cards before practice unlocks", () => {
    render(<><AppGuide role="learner" pathname="/lesson/1" compact={false} />
      <ol><li className="card lesson-part">Từ vựng</li></ol>
      <section className="card lesson-study-cta"><button>Học xong</button></section>
      <section className="card lesson-completion"><button disabled>Hoàn thành</button></section>
    </>);
    expect(walkSteps()).toEqual(["Phần học", "Xong phần Học", "Hoàn thành bài"]);
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
    expect(within(panel).getByRole("heading", { name: "Bài học hôm nay" })).toBeTruthy();
    expect(within(panel).getByText("1 / 2")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Tiếp theo" }));
    expect(screen.getByRole("dialog")).toBe(panel);
    expect(within(panel).getByRole("heading", { name: "Lịch học tháng" })).toBeTruthy();
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

  it("locks the page: hover, focus and clicks behind the guide do not change the step", () => {
    const navigate = vi.fn(event => event.preventDefault());
    render(<><AppGuide role="operator" pathname="/op/months" compact />
      <section className="monthly-topic-card"><input aria-label="Chủ đề" /></section>
      <section className="monthly-resources"><button className="monthly-resource-main-action">Tài nguyên</button></section>
      <section id="monthly-teaching-calendar"><a href="/x" onClick={navigate}>Lịch</a></section>
    </>);
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    const panel = screen.getByRole("dialog");
    expect(document.querySelector(".app-guide-blocker")).toBeTruthy();
    fireEvent.pointerMove(screen.getByText("Lịch"), { pointerType: "mouse" });
    fireEvent.focusIn(screen.getByRole("button", { name: "Tài nguyên" }));
    fireEvent.click(screen.getByText("Lịch"));
    expect(navigate).not.toHaveBeenCalled();
    expect(within(panel).getByRole("heading", { name: "Chủ đề tháng" })).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Tiếp theo" }));
    expect(within(panel).getByRole("heading", { name: "Tài nguyên tháng" })).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Trước" }));
    expect(within(panel).getByRole("heading", { name: "Chủ đề tháng" })).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Đóng hướng dẫn" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector(".app-guide-blocker")).toBeNull();
  });

  it("scrolls the page up or down so the highlighted card sits just below the header, above the guide box", () => {
    const root = document.scrollingElement ?? document.documentElement;
    let cardTop = -300;
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("app-guide-panel")) return new DOMRect(12, 600, 360, 200);
      if (this.matches('[data-home-block="primary"]')) return new DOMRect(12, cardTop, 360, 120);
      return new DOMRect(0, 0, 0, 0);
    });
    render(<><AppGuide role="learner" pathname="/home" compact />
      <section data-home-block="primary"><a href="/lesson/1">Bài học</a></section>
    </>);
    // Opened after scrolling to the bottom: the first card is above the screen, so the page scrolls up.
    root.scrollTop = 500;
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    expect(root.scrollTop).toBe(500 + (-300 - 64));
    fireEvent.keyDown(document, { key: "Escape" });
    // Opened with the card under the guide box: the page scrolls down until its top is below the header.
    cardTop = 650;
    root.scrollTop = 0;
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    expect(root.scrollTop).toBe(650 - 64);
  });

  it("blocks user scrolling while open and restores it on close", () => {
    render(<><AppGuide role="learner" pathname="/home" compact />
      <section data-home-block="primary"><a href="/lesson/1">Bài học</a></section>
      <section data-home-block="month-path"><a href="/lesson/2">Lịch</a></section>
    </>);
    const root = document.scrollingElement ?? document.documentElement;
    root.scrollTop = 0;
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    const panel = screen.getByRole("dialog");
    const page = screen.getByText("Bài học");
    expect(fireEvent.wheel(page, { deltaY: 300 })).toBe(false);
    expect(fireEvent.touchMove(page)).toBe(false);
    for (const key of ["ArrowDown", "PageDown", "End", " "]) expect(fireEvent.keyDown(page, { key })).toBe(false);
    // Once the engine has finished bringing the card into view, any other scroll is undone.
    const later = Date.now() + 5000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    root.scrollTop = 240;
    fireEvent.scroll(document);
    expect(root.scrollTop).toBe(0);
    // The guide's own buttons still work, including with Space and Enter.
    expect(fireEvent.keyDown(within(panel).getByRole("button", { name: "Tiếp theo" }), { key: " " })).toBe(true);
    fireEvent.click(within(panel).getByRole("button", { name: "Tiếp theo" }));
    expect(within(panel).getByRole("heading", { name: "Lịch học tháng" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fireEvent.wheel(page, { deltaY: 300 })).toBe(true);
    expect(fireEvent.keyDown(page, { key: "PageDown" })).toBe(true);
    root.scrollTop = 240;
    fireEvent.scroll(document);
    expect(root.scrollTop).toBe(240);
    root.scrollTop = 0;
  });

  it("guides the monthly exam landing but never the exam itself", () => {
    render(<><AppGuide role="learner" pathname="/monthly" compact />
      <section className="monthly-assessment-landing"><header className="monthly-assessment-header">Lịch thi</header>
        <div className="monthly-assessment-form-state"><p>Chưa đến ngày thi.</p></div>
        <section className="monthly-eligibility-summary"><div className="monthly-eligibility-metrics">Điều kiện</div></section></section>
    </>);
    expect(walkSteps()).toEqual(["Lịch thi tháng", "Trạng thái đề", "Điều kiện dự thi"]);
    cleanup();
    render(<><AppGuide role="learner" pathname="/monthly" compact />
      <section className="monthly-assessment-landing"><header className="monthly-assessment-header">Lịch thi</header>
        <div className="monthly-assessment-form-state"><a className="btn" href="/test/monthly">Vào bài thi</a></div></section>
    </>);
    expect(walkSteps()).toEqual(["Lịch thi tháng", "Vào bài thi"]);
    cleanup();
    const { rerender } = render(<AppGuide role="learner" pathname="/monthly" compact />);
    rerender(<><AppGuide role="learner" pathname="/test/monthly" compact />
      <header className="monthly-assessment-header">Bài thi</header>
    </>);
    expect(screen.queryByRole("button", { name: "Hướng dẫn sử dụng" })).toBeNull();
  });

  it("guides the empty attempts tab and the test results page", () => {
    const { rerender } = render(<><AppGuide role="operator" pathname="/op/review" compact={false} />
      <main><nav className="request-tabs"><a href="?tab=attempts" aria-current="page">Cảnh báo bài tập</a></nav><div className="empty">Chưa có</div></main>
    </>);
    expect(walkSteps()).toEqual(["Cảnh báo bài tập"]);
    rerender(<><AppGuide role="operator" pathname="/op/tests" compact={false} />
      <main><div className="card"><table className="operator-results-table" /></div>
        <section className="card operator-assessment-form-list">Phiên bản</section></main>
    </>);
    expect(walkSteps()).toEqual(["Kết quả bài thi", "Phiên bản đề đã lưu"]);
  });


  it("uses read-only guidance for manager previews", () => {
    render(<><AppGuide role="manager" pathname="/mgr/ops/months" compact={false} />
      <section className="monthly-topic-card"><div className="monthly-level-tabs"><button aria-selected="true" role="tab">A1</button></div></section>
    </>);
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    expect(within(screen.getByRole("dialog")).getByText(/Quản lý chỉ xem/)).toBeTruthy();
  });

  it("omits generic navigation and hides the button on unmapped or unavailable screens", () => {
    const { rerender } = render(<><AppGuide role="learner" pathname="/test/placement" compact />
      <nav className="bottomnav">Điều hướng</nav><button className="inbox-trigger">Thông báo</button>
    </>);
    expect(screen.queryByRole("button", { name: "Hướng dẫn sử dụng" })).toBeNull();
    rerender(<><AppGuide role="learner" pathname="/test/monthly" compact />
      <nav className="bottomnav">Điều hướng</nav><button className="inbox-trigger">Thông báo</button>
    </>);
    expect(screen.queryByRole("button", { name: "Hướng dẫn sử dụng" })).toBeNull();
  });

  it("jumps to a complaint form when it opens without moving the guide panel", async () => {
    const content = (compose: boolean, reasonKey = "original") => <><AppGuide role="learner" pathname="/support" compact />
      <main className="learner-support-page"><nav className="request-tabs"><a href="?type=complaints" aria-current="page">Khiếu nại</a></nav>
        {compose ? <section aria-labelledby="learner-complaint-title"><h2 id="learner-complaint-title">Khiếu nại mới</h2>
          <form className="learner-support-form"><textarea key={reasonKey} /></form></section> : null}
        <section className="request-card"><div className="learner-support-history-header">
          {!compose && <button type="button">Gửi khiếu nại</button>}
        </div><button type="button" aria-expanded={false}>Chi tiết</button></section>
      </main>
    </>;
    const { rerender } = render(content(false));
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByRole("heading", { name: "Khiếu nại đã gửi" })).toBeTruthy();
    rerender(content(true));
    await waitFor(() => expect(within(panel).getByRole("heading", { name: "Khiếu nại mới" })).toBeTruthy());
    rerender(content(true, "replacement"));
    await waitFor(() => expect(within(panel).getByRole("heading", { name: "Khiếu nại mới" })).toBeTruthy());
    expect(screen.getByRole("dialog")).toBe(panel);
    fireEvent.click(within(panel).getByRole("button", { name: "Tiếp theo" }));
    expect(within(panel).getByRole("heading", { name: "Khiếu nại đã gửi" })).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Đã hiểu" }));
    expect(screen.queryByRole("dialog")).toBeNull();
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
    expect(within(panel).getByRole("heading", { name: "Biểu tượng" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Hướng dẫn sử dụng" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Avatar" })).toBe(avatar);
  });

  it("guides the appealable results card and the sent appeals", () => {
    render(<><AppGuide role="learner" pathname="/support" compact />
      <main className="learner-support-page">
        <nav className="request-tabs"><a href="?type=appeals" aria-current="page">Kháng nghị</a></nav>
        <section className="learner-support-action"><div className="assessment-appeal-status"><button aria-expanded={false}>Gửi kháng nghị</button></div></section>
        <section className="request-card">Kháng nghị đã gửi</section>
      </main>
    </>);
    expect(walkSteps()).toEqual(["Bài có thể kháng nghị", "Kháng nghị đã gửi"]);
  });

  it("guides a pending home through its cards", () => {
    render(<><AppGuide role="learner" pathname="/home" compact />
      <div className="home-page" data-monthly-preparation="true">
        <section data-home-block="primary">Chờ bài tháng</section>
        <section data-home-block="activities"><a href="/coach">Season</a><a href="/monthly">Bài tháng</a></section>
        <section className="learner-summary-card--profile"><a href="/profile">Hồ sơ</a></section>
      </div>
    </>);
    expect(walkSteps()).toEqual(["Lộ trình đang chuẩn bị", "Luyện trong lúc chờ", "Hồ sơ và đầu vào"]);
  });

  it("guides the Season card areas and omits the composer while it is unavailable", async () => {
    const content = (disabled: boolean) => <><AppGuide role="learner" pathname="/coach" compact />
      <div className="coach-page">
        <div className="coach-header"><button className="coach-persona-toggle">Formal</button></div>
        <div className="coach-limit-row"><span className="coach-feedback-toggles"><button>Nhận xét</button></span></div>
        <section className="chat"><button className="coach-turn-audio">Nghe</button></section>
        <form className="chat-compose"><textarea disabled={disabled} /><button type="button" disabled={disabled} aria-label="Nói" /></form>
      </div>
    </>;
    const { rerender } = render(content(false));
    const areas = ["Phong cách trò chuyện", "Lượt luyện và phản hồi", "Cuộc trò chuyện"];
    expect(walkSteps()).toEqual([...areas, "Trả lời Season"]);
    rerender(content(true));
    await act(async () => { await new Promise(requestAnimationFrame); });
    expect(walkSteps()).toEqual(areas);
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
    expect(walkSteps()).toEqual(["Tạo bộ từ", "Ôn từ trước khi chơi", "Chọn trò chơi"]);
    rerender(content(false));
    await act(async () => { await new Promise(requestAnimationFrame); });
    expect(walkSteps()).toEqual(["Chưa có bộ từ"]);
  });

  it("guides the weekly review runner, from warm-up to the finished review", async () => {
    const content = (stage: "warmup" | "question" | "done") => <><AppGuide role="learner" pathname="/lesson/review-1" compact={false} />
      <main><div className="app-learner-page stack">
        {stage !== "warmup" && <ol className="weekly-review-sections"><li>Nghe · 2/2</li></ol>}
        {stage === "warmup" && <section className="card stack"><button type="button" className="card flat" aria-pressed="false">deadline</button></section>}
        {stage === "question" && <section className="card stack"><div role="group"><button type="button" className="btn">deadline</button></div></section>}
        {stage === "done" && <section className="card" aria-label="Đã xong bài ôn"><button type="button">Về trang chủ</button></section>}
      </div></main>
    </>;
    const { rerender } = render(content("warmup"));
    expect(walkSteps()).toEqual(["Khởi động lật thẻ"]);
    rerender(content("question"));
    await act(async () => { await new Promise(requestAnimationFrame); });
    expect(walkSteps()).toEqual(["Các phần bài ôn", "Câu đang làm"]);
    rerender(content("done"));
    await act(async () => { await new Promise(requestAnimationFrame); });
    expect(walkSteps()).toEqual(["Các phần bài ôn", "Đã xong bài ôn"]);
  });

  it("only guides visible game cards when vocabulary details are collapsed", async () => {
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
    expect(walkSteps()).toEqual(["Ôn từ trước khi chơi", "Chọn bộ từ", "Chọn trò chơi"]);
  });

  it("guides the survey card and history, then returns after the inbox closes", async () => {
    const content = (inboxOpen: boolean) => <><AppGuide role="learner" pathname="/support" compact />
      <main className="learner-support-page">
        <nav className="request-tabs"><a href="?type=feedback" aria-current="page">Khảo sát tháng</a></nav>
        <section className="card"><form className="monthly-survey-form"><button type="submit">Gửi phản hồi</button></form></section>
        <section className="request-card"><button aria-expanded="false">Chi tiết</button></section>
      </main>
      {inboxOpen && <section role="dialog" aria-modal="true" className="inbox-dialog">Thông báo</section>}
    </>;
    const { rerender } = render(content(false));
    const survey = document.querySelector<HTMLElement>(".card:has(> .monthly-survey-form)")!;
    vi.spyOn(survey, "getBoundingClientRect").mockReturnValue(new DOMRect(90, 70, 110, 44));
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    expect(document.querySelector<HTMLElement>(".app-guide-spotlight")?.style.left).toBe("80px");
    fireEvent.click(screen.getByRole("button", { name: "Đóng hướng dẫn" }));
    rerender(content(true));
    await waitFor(() => expect((screen.getByRole("button", { name: "Hướng dẫn sử dụng" }) as HTMLButtonElement).disabled).toBe(true));
    rerender(content(false));
    await waitFor(() => expect((screen.getByRole("button", { name: "Hướng dẫn sử dụng" }) as HTMLButtonElement).disabled).toBe(false));
    expect(walkSteps()).toEqual(["Khảo sát tháng", "Khảo sát đã gửi"]);
  });
});

/** The selector without pseudo-class arguments or attribute filters, leaving only the elements a step points at. */
function topLevel(selector: string) {
  let previous = "";
  let current = selector;
  while (current !== previous) {
    previous = current;
    current = current.replace(/\([^()]*\)/g, "");
  }
  return current.replace(/\[[^\]]*\]/g, "");
}

function FakeSettingsPanel({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  return <div className="settings-panel">
    <button className="settings-panel-toggle" type="button" aria-expanded={open} aria-controls={`setting-${id}`} onClick={() => setOpen(value => !value)}>{label}</button>
    <div id={`setting-${id}`} className="settings-panel-content" hidden={!open}>{label} nội dung</div>
  </div>;
}

describe("AppGuide collapsed sections", () => {
  it("opens the collapsed settings panel of the current step and closes it when moving on or closing", async () => {
    render(<><AppGuide role="manager" pathname="/settings" compact /><main className="settings-page">
      <FakeSettingsPanel id="ai" label="Kết nối AI" /><FakeSettingsPanel id="test-date" label="Ngày hệ thống thử" />
    </main></>);
    const toggles = () => screen.getAllByRole("button").filter(button => button.classList.contains("settings-panel-toggle"));
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    await waitFor(() => expect(toggles()[0]!.getAttribute("aria-expanded")).toBe("true"));
    expect(toggles()[1]!.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /Tiếp theo/ }));
    await waitFor(() => expect(toggles()[1]!.getAttribute("aria-expanded")).toBe("true"));
    expect(toggles()[0]!.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Đóng hướng dẫn" }));
    await waitFor(() => expect(toggles()[1]!.getAttribute("aria-expanded")).toBe("false"));
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
