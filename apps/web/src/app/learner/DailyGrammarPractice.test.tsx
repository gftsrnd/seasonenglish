// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DailyGrammarPractice } from "./DailyGrammarPractice.js";
afterEach(cleanup);
describe("daily grammar practice", () => {
 it("shows feedback only after a choice and allows a wrong answer to be retried", () => {
 render(<DailyGrammarPractice language="vi" value={[{id:"g1",prompt:"She ____ the report.",options:["send","sends","sending","sent"],answer:"sends",explanation:"She uses the singular verb."}]} />);
 expect(screen.queryByRole("status")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"send"}));
 expect(screen.getByRole("status").textContent).toContain("Thử lại");
 fireEvent.click(screen.getByRole("button",{name:"sends"}));
 expect(screen.getByRole("status").textContent).toContain("Đúng.");
 });
 it("does not turn old vocabulary-shaped items into grammar questions", () => {
 const result = render(<DailyGrammarPractice language="en" value={[{word:"report"}]} />);
 expect(result.container.textContent).toBe("");
 });
});
