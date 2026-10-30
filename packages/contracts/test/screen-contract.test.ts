import { describe, expect, it } from "vitest";
import { ROLE_PERMISSIONS } from "../src/session-contract.js";
import { ROLE_NAVIGATION, SCREEN_CONTRACT, type VisibleScreen } from "../src/screen-contract.js";

const expectedRoutes = [
  "/",
  "/onboard",
  "/test/:kind",
  "/home",
  "/micro/:id",
  "/lesson/:id",
  "/coach",
  "/challenge",
  "/games",
  "/games/:game",
  "/exam",
  "/profile",
  "/reward/:mode",
  "/survey",
  "/op",
  "/op/levelforms",
  "/op/months",
  "/op/review",
  "/op/prompts",
  "/settings",
  "/mgr",
  "/mgr/ops",
  "/mgr/month",
  "/mgr/reminders",
  "/mgr/report",
  "/mgr/rewards"
] as const;

describe("approved E4S screen contract", () => {
  it("contains every approved visible route exactly once", () => {
    const actual = SCREEN_CONTRACT.map((screen) => screen.path);

    expect(new Set(actual).size).toBe(actual.length);
    expect(actual).toEqual(expectedRoutes);
  });

  it("does not turn states or technical tools into product screens", () => {
    const ids = SCREEN_CONTRACT.map((screen) => screen.id);

    expect(ids).not.toContain("invitation");
    expect(ids).not.toContain("placement-preparation");
    expect(ids).not.toContain("placement-result");
    expect(ids).not.toContain("content-review");
    expect(ids).not.toContain("technical-admin");
  });

  it("keeps the approved primary navigation per role", () => {
    expect(ROLE_NAVIGATION.learner).toEqual([
      "/home",
      "/coach",
      "/exam",
      "/games",
      "/profile"
    ]);
    expect(ROLE_NAVIGATION.operator).toEqual([
      "/op",
      "/op/months",
      "/op/review",
      "/settings"
    ]);
    expect(ROLE_NAVIGATION.manager).toEqual([
      "/mgr",
      "/mgr/ops",
      "/mgr/month",
      "/mgr/reminders",
      "/mgr/report",
      "/settings"
    ]);
  });

  it("makes Manager the Product Admin while keeping organisation administration outside Operator", () => {
    expect([...ROLE_PERMISSIONS.manager]).toEqual(expect.arrayContaining([...ROLE_PERMISSIONS.operator]));
    expect(ROLE_PERMISSIONS.manager).toEqual(expect.arrayContaining([
      "account:manage",
      "role:manage",
      "organisation:manage",
      "settings:manage"
    ]));
    expect(ROLE_PERMISSIONS.operator).not.toEqual(expect.arrayContaining([
      "account:manage",
      "role:manage",
      "organisation:manage",
      "settings:manage"
    ]));
  });

  it("requires every manager route to declare real data states instead of a pending placeholder", () => {
    const managerScreens: readonly VisibleScreen[] = SCREEN_CONTRACT.filter((screen) => screen.path.startsWith("/mgr"));

    expect(managerScreens).toHaveLength(5);
    for (const screen of managerScreens) {
      expect(screen.states).toEqual(expect.arrayContaining(["loading", "empty", "error", "populated"]));
    }
  });
});
