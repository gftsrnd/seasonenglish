import { describe, expect, it } from "vitest";
import { resolveSessionEntryPath } from "../src/app/App.js";

describe("production application entry", () => {
  it("keeps the live 4175 role-entry routing after leaving the app namespace", () => {
    expect(resolveSessionEntryPath("learner", "/mgr/report")).toBe("/home");
    expect(resolveSessionEntryPath("operator", "/profile")).toBe("/op");
    expect(resolveSessionEntryPath("manager", "/home")).toBe("/mgr");
  });
});
