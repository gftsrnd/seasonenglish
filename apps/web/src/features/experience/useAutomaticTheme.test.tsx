// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { millisecondsUntilNextLocalDay, resolveAutomaticTheme, useAutomaticTheme } from "./useAutomaticTheme.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("automatic organisation theme", () => {
  it.each([
    [new Date(2031, 1, 1, 12), "spring"],
    [new Date(2031, 4, 1, 12), "summer"],
    [new Date(2031, 7, 1, 12), "autumn"],
    [new Date(2031, 10, 1, 12), "winter"],
    [new Date(2026, 1, 10, 12), "tet"],
    [new Date(2026, 1, 27, 23, 59), "tet"],
    [new Date(2026, 1, 28, 12), "spring"],
    [new Date(2026, 8, 20, 12), "midautumn"],
    [new Date(2026, 8, 30, 23, 59), "midautumn"],
    [new Date(2026, 11, 15, 0), "christmas"],
    [new Date(2027, 0, 2, 23, 59), "christmas"],
    [new Date(2027, 0, 3, 0), "winter"]
  ])("resolves the local calendar boundary at %s", (at, expected) => {
    expect(resolveAutomaticTheme(at)).toBe(expected);
  });

  it("calculates the exact delay to the next local day", () => {
    expect(millisecondsUntilNextLocalDay(new Date(2026, 11, 14, 23, 59, 59, 900))).toBe(100);
  });

  it("rolls an automatic theme over after local midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 14, 23, 59, 59, 900));
    const { result } = renderHook(() => useAutomaticTheme("auto"));
    expect(result.current).toBe("winter");

    act(() => { vi.advanceTimersByTime(101); });

    expect(result.current).toBe("christmas");
  });

  it("refreshes an automatic theme when a suspended tab becomes visible", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 14, 12));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const { result } = renderHook(() => useAutomaticTheme("auto"));
    expect(result.current).toBe("winter");

    vi.setSystemTime(new Date(2026, 11, 15, 12));
    visibility.mockReturnValue("visible");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });

    expect(result.current).toBe("christmas");
  });

  it("never replaces an explicitly selected theme", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 14, 23, 59, 59, 900));
    const schedule = vi.spyOn(globalThis, "setTimeout");
    const { result } = renderHook(() => useAutomaticTheme("summer"));

    act(() => {
      vi.advanceTimersByTime(86_400_000);
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe("summer");
    expect(schedule).not.toHaveBeenCalled();
  });
});
