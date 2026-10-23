// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeProvider.js";

function Probe() {
  const { theme, resolvedTheme, setTheme, previewTheme, clearThemePreview } = useTheme();
  return <>
    <span data-testid="committed">{theme}</span>
    <span data-testid="resolved">{resolvedTheme}</span>
    <button type="button" onClick={() => setTheme("spring")}>commit</button>
    <button type="button" onClick={() => previewTheme("autumn")}>preview</button>
    <button type="button" onClick={clearThemePreview}>clear</button>
  </>;
}

describe("organisation theme state", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps unsaved preview separate from the committed organisation theme", async () => {
    const user = userEvent.setup();
    render(<ThemeProvider><Probe /></ThemeProvider>);

    await user.click(screen.getByRole("button", { name: "commit" }));
    await user.click(screen.getByRole("button", { name: "preview" }));
    expect(screen.getByTestId("committed").textContent).toBe("spring");
    expect(screen.getByTestId("resolved").textContent).toBe("autumn");
    expect(window.localStorage.getItem("e4s:theme")).toBeNull();

    await user.click(screen.getByRole("button", { name: "clear" }));
    expect(screen.getByTestId("resolved").textContent).toBe("spring");
  });
});
