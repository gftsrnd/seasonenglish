// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PRODUCT_ART_IDS, PRODUCT_ART_PATHS, ProductArt, type ProductArtId } from "./ProductArt.js";

afterEach(cleanup);

describe("ProductArt", () => {
  it("maps every product art id to a unique bundled raster path", () => {
    expect(PRODUCT_ART_IDS).toHaveLength(28);
    expect(new Set(PRODUCT_ART_IDS)).toHaveLength(28);
    for (const id of PRODUCT_ART_IDS) expect(PRODUCT_ART_PATHS[id]).toMatch(/^\/media\/.+\.png$/);
  });

  it("renders decorative art without accessible text", () => {
    const { container } = render(<ProductArt id="mascot" decorative />);
    const image = container.querySelector("img[data-product-art='mascot']");
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("aria-hidden", "true");
  });

  it("renders semantic art with its required alternative text", () => {
    render(<ProductArt id="dinosaur" alt="Chú khủng long" />);
    expect(screen.getByRole("img", { name: "Chú khủng long" })).toHaveAttribute("src", PRODUCT_ART_PATHS.dinosaur);
  });

  it("defensively rejects empty semantic alternative text", () => {
    expect(() => render(<ProductArt id={"mascot" as ProductArtId} alt="" />)).toThrow("requires non-empty alt text");
  });
});
