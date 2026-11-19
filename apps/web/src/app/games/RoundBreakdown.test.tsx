// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RoundBreakdown, lostPointsLine } from "./RoundBreakdown.js";

afterEach(cleanup);

describe("result card breakdown", () => {
  it("colours each question: first try, in-streak, assisted and wrong", () => {
    render(<RoundBreakdown outcomes={["first_try", "first_try", "first_try", "wrong", "first_try", "assisted"]} />);
    expect(screen.getByLabelText("Câu 3: Đúng trong chuỗi (gấp rưỡi)")).toHaveClass("is-combo");
    expect(screen.getByLabelText("Câu 4: Sai (0)")).toHaveClass("is-wrong");
    expect(screen.getByLabelText("Câu 5: Đúng ngay")).toHaveClass("is-first");
    expect(screen.getByLabelText("Câu 6: Có gợi ý / thử lại (nửa phần)")).toHaveClass("is-assisted");
  });

  it("says why the round is not 100", () => {
    expect(lostPointsLine(["first_try", "first_try"])).toBe("Đúng hết, không đứt chuỗi.");
    expect(lostPointsLine(["first_try", "wrong", "assisted", "timeout"])).toBe("Mất điểm vì: câu 2, 4 sai; câu 3 có gợi ý. Sau mỗi câu đó, chuỗi bắt đầu lại.");
    expect(lostPointsLine(["wrong", "wrong", "wrong", "wrong"])).toMatch(/^Mất điểm vì: 4 câu sai\./);
  });
});
