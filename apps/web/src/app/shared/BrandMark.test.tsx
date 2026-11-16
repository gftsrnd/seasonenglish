// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BRAND_NAME, BrandMark, ResponsiveBrandMark } from "./BrandMark.js";

describe("BrandMark", () => {
  afterEach(cleanup);
  it("uses the fixed E4S artwork, never a seasonal mark", () => {
    render(<><BrandMark variant="icon" /><BrandMark variant="wordmark" label={BRAND_NAME} /></>);
    expect(screen.getByTestId("brand-mark-icon")).toHaveAttribute("src", "/brand/e4s-icon.svg");
    expect(screen.getByRole("img", { name: BRAND_NAME })).toHaveAttribute("src", "/brand/e4s-wordmark.svg");
  });

  it("switches the wordmark letters to white on dark surfaces", () => {
    render(<BrandMark variant="wordmark" tone="on-dark" />);
    expect(screen.getByTestId("brand-mark-wordmark")).toHaveAttribute("src", "/brand/e4s-wordmark-on-dark.svg");
  });

  it("gives the top bar one phone-only icon and one tablet-up wordmark", () => {
    render(<ResponsiveBrandMark />);
    expect(screen.getByTestId("brand-mark-icon")).toHaveClass("brand-mark--phone-only");
    expect(screen.getByTestId("brand-mark-wordmark")).toHaveClass("brand-mark--tablet-up");
  });
});
