// @vitest-environment jsdom
import {render,screen,cleanup} from "@testing-library/react";import "@testing-library/jest-dom/vitest";
import {afterEach,describe,it,expect} from "vitest";import {MonthlyResourceProgress} from "./MonthlyResourceProgress.js";
afterEach(cleanup);
describe("monthly resource progress",()=>{
 it("does not report success when a request fails before progress is available",()=>{render(<MonthlyResourceProgress running={false} failed />);expect(screen.getByRole("status")).toHaveTextContent("Chưa hoàn tất");expect(screen.queryByText("Đã hoàn tất tài nguyên tháng")).toBeNull();});
 it("shows the actual stage and counts while an existing resource pool is being regenerated",()=>{
 render(<MonthlyResourceProgress running progress={{runId:"r",status:"running",phase:"pronunciationTargets",current:2,total:4,counts:{coreTerms:48,expandedTerms:204,grammarTopics:2,pronunciationTargets:1},startedAt:"2026-11-06T00:00:00Z",updatedAt:"2026-11-06T00:01:00Z"}} />);
 expect(screen.getByRole("status")).toHaveTextContent("Đang sinh phát âm · mục 2/4");expect(screen.getByText("48 từ cốt lõi")).toBeInTheDocument();expect(screen.getByText("204 từ mở rộng")).toBeInTheDocument();
 });
 it("names the failed stage without pretending the remaining phases finished",()=>{
 render(<MonthlyResourceProgress running={false} progress={{runId:"r",status:"failed",phase:"grammarTopics",counts:{coreTerms:48,expandedTerms:204},startedAt:"2026-11-06T00:00:00Z",updatedAt:"2026-11-06T00:01:00Z"}} />);
 expect(screen.getByRole("status")).toHaveTextContent("Chưa hoàn tất ở phần Ngữ pháp");expect(screen.getByText("Phát âm").closest("li")).toHaveAttribute("data-state","waiting");
 });
});
