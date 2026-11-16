// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
// @ts-expect-error Vitest executes this layout guard in Node; the web project omits Node ambient types.
import { existsSync, readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { crosswordClueOrder } from "../games/CrosswordGame.js";
import { PageTitle } from "./ui.js";
import { lessonStudySteps } from "./Learning.js";
import { assessmentShortChoices } from "./Assessment.js";

// jsdom gives import.meta.url an http scheme; resolve from the repo root or apps/web.
const APP = existsSync("src/app") ? "src/app" : "apps/web/src/app";

function mockViewport(compact: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: compact && /max-width/.test(query), media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("learner phone/tablet layer", () => {
  it("is imported once, by the learner route controller, and every rule is scoped to the learner root", () => {
    const controller = readFileSync(`${APP}/learner/LearnerRouteController.tsx`, "utf8");
    expect(controller.match(/^import "\.\.\/responsive-learner\.css";/gm)).toHaveLength(1);
    expect(controller).toContain('className="learner-root"');
    const css = readFileSync(`${APP}/responsive-learner.css`, "utf8");
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/^\s*:root[^{]*\{/gm) ?? [];
    expect(selectors.length).toBeGreaterThan(50);
    for (const selector of selectors) expect(selector).toMatch(/learner-root/);
    // Desktop stays unchanged: every rule sits inside a max-width media query.
    const outside = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    expect(outside.trim()).toBe(".learner-root { display: contents; }");
  });

  it("puts the page guidance in an ⓘ next to the title on phones/tablets and keeps the desktop header unchanged", () => {
    mockViewport(true);
    render(<PageTitle title="Luyện với Season" detail="Tháng 11" tip="Giới hạn chat" compactDetail={false} />);
    expect(screen.getByRole("button", { name: "Luyện với Season: giải thích" })).toBeInTheDocument();
    expect(screen.queryByText("Tháng 11")).not.toBeInTheDocument();
    cleanup();
    mockViewport(false);
    render(<PageTitle title="Luyện với Season" detail="Tháng 11" tip="Giới hạn chat" compactDetail={false} />);
    expect(screen.queryByRole("button", { name: /giải thích/ })).not.toBeInTheDocument();
    expect(screen.getByText("Tháng 11")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Luyện với Season");
  });

  it("pages crossword clues across-first, each direction by number", () => {
    const placed = [{ direction: "down", number: 4 }, { direction: "across", number: 8 }, { direction: "down", number: 2 }, { direction: "across", number: 1 }] as const;
    expect(crosswordClueOrder(placed).map((entry) => `${entry.direction}${entry.number}`)).toEqual(["across1", "across8", "down2", "down4"]);
  });

  it("groups the Study tab into steps without dropping or reordering any part", () => {
    expect(lessonStudySteps(["objective", "instruction", "vocabulary", "grammar", "pronunciation"])).toEqual([["objective", "instruction"], ["vocabulary"], ["grammar"], ["pronunciation"]]);
    expect(lessonStudySteps(["vocabulary", "grammar"])).toEqual([["vocabulary"], ["grammar"]]);
    const codes = ["instruction", "vocabulary", "objective", "pronunciation"] as const;
    expect(lessonStudySteps(codes).flat().sort()).toEqual([...codes].sort());
  });

  it("puts only short answer options in two columns", () => {
    expect(assessmentShortChoices([{ label: "are" }, { label: "am" }, { label: "is" }, { label: "be" }])).toBe(true);
    expect(assessmentShortChoices([{ label: "Hello! How can I help you?" }, { label: "No" }])).toBe(false);
    expect(assessmentShortChoices(undefined)).toBe(false);
  });
});
