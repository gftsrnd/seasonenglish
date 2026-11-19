// @vitest-environment jsdom
// Vận hành › Phản hồi & yêu cầu (góp ý 19a): các bước theo tab, Tiếp / Trước, mở lại từ "?", tự mở lần đầu mỗi tab.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppGuide, findSteps } from "./AppGuide.js";
import { guideDefinitions } from "./app-guide-steps.js";
import { RequestTable } from "./RequestTable.js";

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return (this.closest("[hidden]") ? [] : [{}]) as unknown as DOMRectList;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(12, 70, 180, 65));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const tabs = <div className="operator-review-navigation"><nav className="request-tabs" aria-label="Phản hồi & yêu cầu">
  {["coach", "appeals", "sent", "attempts"].map(key => <a href={`?tab=${key}`} key={key}>{key}</a>)}
</nav></div>;

const appealRows = [
  { id: "a1", kind: "Yêu cầu thi lại", content: "Xin thi lại", status: <span className="badge warn">Chờ xử lý</span>, date: "2026-11-17T03:00:00Z",
    action: <a className="btn-sm" href="?tab=appeals&id=a1">Xử lý</a> },
  { id: "a2", kind: "Kháng nghị", content: "Câu 3 sai đáp án", status: <span className="badge ok">Đã chấp nhận</span>, date: "2026-11-16T03:00:00Z",
    action: <><a className="btn-sm" href="?tab=appeals&id=a2">Chi tiết</a><button className="btn-sm btn-danger request-delete" type="button">Xóa</button></> },
];

function Review({ tab }: { tab: "coach" | "appeals" | "sent" | "attempts" }) {
  return <main>
    {tabs}
    <div data-operator-review-tab={tab}>
      {tab === "appeals" ? <div className="operator-requests request-workspace"><section className="card request-card">
        <div className="request-filters"><label>Trạng thái <select defaultValue="all"><option value="all">Tất cả</option></select></label></div>
        <RequestTable label="Danh sách kháng nghị" rows={appealRows} empty="Chưa có kháng nghị." />
      </section></div> : null}
      {tab === "coach" ? <div className="card operator-review-panel"><details className="operator-review-learner-group"><summary>Học viên A</summary></details></div> : null}
      {tab === "sent" ? <div className="operator-requests request-workspace"><section className="card request-card"><RequestTable label="Danh sách yêu cầu" rows={[]} empty="Chưa có yêu cầu gửi Quản lý." /></section></div> : null}
      {tab === "attempts" ? <div className="empty">Chưa có câu bài ngày sai cả hai lượt.</div> : null}
    </div>
  </main>;
}

const panel = () => within(screen.getByRole("dialog", { name: "Hướng dẫn sử dụng" }));
const heading = () => panel().getByRole("heading").textContent;
const count = () => document.querySelector(".app-guide-count")?.textContent;

describe("operator review guide (19a)", () => {
  it("walks the appeals tab through tabs, filter, Loại, statuses, Xử lý, then Chi tiết / Xóa", () => {
    render(<><AppGuide role="operator" pathname="/op/review" compact autoOpen={false} /><Review tab="appeals" /></>);
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    const expected = ["Bốn mục của trang", "Lọc theo trạng thái", "Cột Loại", "Ba trạng thái", "Nút Xử lý", "Chi tiết và Xóa"];
    const seen: string[] = [];
    for (const [index, title] of expected.entries()) {
      expect(count()).toBe(`${index + 1} / ${expected.length}`);
      seen.push(heading() ?? "");
      expect(heading()).toBe(title);
      if (index < expected.length - 1) fireEvent.click(panel().getByRole("button", { name: /Tiếp theo/ }));
    }
    expect(seen).toEqual(expected);
    // Each step highlights its own region: the Loại and status cells of the first row, then each row's commands.
    const targets = findSteps(guideDefinitions("operator", "/op/review")!, document).map(step => step.target);
    expect(new Set(targets).size).toBe(6);
    expect(targets.slice(1).map(target => target.className)).toEqual(["request-filters", "request-kind", "request-state", "request-commands", "request-commands"]);
    expect(targets[4]!.textContent).toContain("Xử lý");
    expect(targets[5]!.textContent).toContain("Xóa");
    expect(panel().getByText(/vẫn thấy kết quả/)).toBeTruthy();
    expect(panel().getByRole("button", { name: "Đã hiểu" })).toBeTruthy();
  });

  it("goes back with Trước and closes on Đã hiểu", () => {
    render(<><AppGuide role="operator" pathname="/op/review" compact autoOpen={false} /><Review tab="appeals" /></>);
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    expect(panel().getByRole("button", { name: /Trước/ })).toHaveProperty("disabled", true);
    fireEvent.click(panel().getByRole("button", { name: /Tiếp theo/ }));
    fireEvent.click(panel().getByRole("button", { name: /Tiếp theo/ }));
    expect(heading()).toBe("Cột Loại");
    fireEvent.click(panel().getByRole("button", { name: /Trước/ }));
    expect(heading()).toBe("Lọc theo trạng thái");
    expect(count()).toBe("2 / 6");
    for (let index = 0; index < 4; index++) fireEvent.click(panel().getByRole("button", { name: /Tiếp theo/ }));
    fireEvent.click(panel().getByRole("button", { name: "Đã hiểu" }));
    expect(screen.queryByRole("dialog", { name: "Hướng dẫn sử dụng" })).toBeNull();
  });

  it("reopens from the ? button at step 1 after being closed mid-way", () => {
    render(<><AppGuide role="operator" pathname="/op/review" compact autoOpen={false} /><Review tab="appeals" /></>);
    const trigger = screen.getByRole("button", { name: "Hướng dẫn sử dụng" });
    fireEvent.click(trigger);
    fireEvent.click(panel().getByRole("button", { name: /Tiếp theo/ }));
    fireEvent.click(panel().getByRole("button", { name: /Tiếp theo/ }));
    fireEvent.click(panel().getByRole("button", { name: "Đóng hướng dẫn" }));
    expect(screen.queryByRole("dialog", { name: "Hướng dẫn sử dụng" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    expect(count()).toBe("1 / 6");
    expect(heading()).toBe("Bốn mục của trang");
  });

  it.each([
    ["coach", ["Bốn mục của trang", "Phản hồi Season"]],
    ["sent", ["Bốn mục của trang", "Yêu cầu đã gửi"]],
    ["attempts", ["Bốn mục của trang", "Cảnh báo bài tập"]],
  ] as const)("gives the %s tab its own step after the tab overview", (tab, titles) => {
    render(<><AppGuide role="operator" pathname="/op/review" compact autoOpen={false} /><Review tab={tab} /></>);
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    expect(count()).toBe(`1 / ${titles.length}`);
    expect(heading()).toBe(titles[0]);
    fireEvent.click(panel().getByRole("button", { name: /Tiếp theo/ }));
    expect(heading()).toBe(titles[1]);
  });

  it("never opens by itself; only the ? button opens it", async () => {
    render(<><AppGuide role="operator" pathname="/op/review" compact autoOpen /><Review tab="appeals" /></>);
    await act(async () => { await new Promise(requestAnimationFrame); });
    expect(screen.queryByRole("dialog", { name: "Hướng dẫn sử dụng" })).toBeNull();
  });

  it("explains Loại and the statuses on the empty appeals list", () => {
    render(<><AppGuide role="operator" pathname="/op/review" compact autoOpen={false} /><main>{tabs}<div data-operator-review-tab="appeals">
      <div className="operator-requests"><section className="card request-card"><div className="request-filters">Trạng thái</div>
        <RequestTable label="Danh sách kháng nghị" rows={[]} empty="Chưa có kháng nghị." /></section></div></div></main></>);
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn sử dụng" }));
    expect(count()).toBe("1 / 3");
    fireEvent.click(panel().getByRole("button", { name: /Tiếp theo/ }));
    fireEvent.click(panel().getByRole("button", { name: /Tiếp theo/ }));
    expect(heading()).toBe("Danh sách kháng nghị");
  });
});
