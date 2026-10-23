import { describe, expect, it } from "vitest";
import { LOCAL_SCENARIO_ACCOUNTS, isKnownLocalScenarioFixtureEmail, isPreservedLocalScenarioEmail } from "./local-scenario-accounts.js";

describe("local scenario accounts", () => {
  it("defines every approved reusable scenario exactly once", () => {
    expect(LOCAL_SCENARIO_ACCOUNTS.map(({ key, displayName, email }) => ({ key, displayName, email }))).toEqual([
      { key: "learner-onboarding-new", displayName: "Nguyễn Khánh Linh", email: "khanh.linh.nguyen@scenario.e4s.local" },
      { key: "learner-placement-new", displayName: "Trần Minh Quân", email: "minh.quan.tran@scenario.e4s.local" },
      { key: "learner-placement-listening", displayName: "Lê Hoàng Anh", email: "hoang.anh.le@scenario.e4s.local" },
      { key: "learner-placement-reading", displayName: "Phạm Thu Trang", email: "thu.trang.pham@scenario.e4s.local" },
      { key: "learner-placement-writing", displayName: "Vũ Đức Long", email: "duc.long.vu@scenario.e4s.local" },
      { key: "learner-placement-speaking", displayName: "Đỗ Ngọc Mai", email: "ngoc.mai.do@scenario.e4s.local" },
      { key: "learner-placement-submitted", displayName: "Bùi Gia Hân", email: "gia.han.bui@scenario.e4s.local" },
      { key: "learner-placement-review", displayName: "Hồ Anh Tuấn", email: "anh.tuan.ho@scenario.e4s.local" },
      { key: "learner-placement-borderline", displayName: "Dương Mỹ Linh", email: "my.linh.duong@scenario.e4s.local" },
      { key: "learner-lesson-b1", displayName: "Võ Thành Nam", email: "thanh.nam.vo@scenario.e4s.local" },
      { key: "learner-lesson-attempts", displayName: "Nguyễn Quỳnh Anh", email: "quynh.anh.nguyen@scenario.e4s.local" },
      { key: "learner-weekly", displayName: "Trương Hải Yến", email: "hai.yen.truong@scenario.e4s.local" },
      { key: "learner-level-ready", displayName: "Đặng Quốc Việt", email: "quoc.viet.dang@scenario.e4s.local" },
      { key: "learner-history", displayName: "Ngô Thanh Thảo", email: "thanh.thao.ngo@scenario.e4s.local" },
      { key: "learner-reminder", displayName: "Mai Đức Thịnh", email: "duc.thinh.mai@scenario.e4s.local" },
      { key: "learner-appeal", displayName: "Tạ Bảo Trâm", email: "bao.tram.ta@scenario.e4s.local" },
      { key: "operator-review", displayName: "Phan Minh Châu", email: "minh.chau.phan@scenario.e4s.local" },
      { key: "manager-review", displayName: "Lý Quốc Hưng", email: "quoc.hung.ly@scenario.e4s.local" }
    ]);
    expect(new Set(LOCAL_SCENARIO_ACCOUNTS.map(({ id }) => id))).toHaveProperty("size", LOCAL_SCENARIO_ACCOUNTS.length);
    expect(new Set(LOCAL_SCENARIO_ACCOUNTS.map(({ email }) => email))).toHaveProperty("size", LOCAL_SCENARIO_ACCOUNTS.length);
  });

  it("uses human identities rather than scenario labels or technical email slugs", () => {
    for (const account of LOCAL_SCENARIO_ACCOUNTS) {
      expect(account.displayName).toMatch(/^\p{Lu}[\p{L}]+(?: [\p{Lu}][\p{L}]+){2,}$/u);
      expect(account.displayName).not.toMatch(/Kịch bản|Demo|learner|operator|manager|review/i);
      expect(account.email).toMatch(/^[a-z]+(?:\.[a-z]+){2}@scenario\.e4s\.local$/);
      expect(account.email).not.toContain(account.key);
    }
  });

  it("uses a six-digit PIN for learners and documented passwords for staff", () => {
    for (const account of LOCAL_SCENARIO_ACCOUNTS) {
      if (account.role === "learner") expect(account.secret).toMatch(/^\d{6}$/);
      else expect(account.secret.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("only preserves the explicitly named scenario email namespace", () => {
    expect(isPreservedLocalScenarioEmail("khanh.linh.nguyen@scenario.e4s.local")).toBe(true);
    expect(isPreservedLocalScenarioEmail("minh.chau.phan@scenario.e4s.local")).toBe(true);
    expect(isPreservedLocalScenarioEmail("learner-placement-new@scenario.e4s.local")).toBe(false);
    expect(isPreservedLocalScenarioEmail("nguyen.van.an@scenario.e4s.local")).toBe(false);
    expect(isPreservedLocalScenarioEmail("core-flow-123@e4s.local")).toBe(false);
    expect(isPreservedLocalScenarioEmail("someone@example.com")).toBe(false);
  });

  it("identifies only exact prior and current scenario fixture addresses for cleanup", () => {
    expect(isKnownLocalScenarioFixtureEmail("learner-placement-new@scenario.e4s.local")).toBe(true);
    expect(isKnownLocalScenarioFixtureEmail("minh.quan.tran@scenario.e4s.local")).toBe(true);
    expect(isKnownLocalScenarioFixtureEmail("nguyen.van.an@scenario.e4s.local")).toBe(false);
    expect(isKnownLocalScenarioFixtureEmail("minh.quan.tran@example.com")).toBe(false);
  });
});
