import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const inventoryPath = join(root, "legacy/monthly-cycle/README.md");

interface InventoryRow { readonly path: string; readonly status: "live" | "legacy"; readonly reuse: boolean }

/** Reads the inventory table rows: | `path` | live/legacy | có/không | … | */
function parseInventory(): InventoryRow[] {
  const rows: InventoryRow[] = [];
  for (const line of readFileSync(inventoryPath, "utf8").split(/\r?\n/)) {
    const match = /^\|\s*`([^`]+)`\s*\|\s*(live|legacy)\s*\|\s*(có|không)\s*\|/.exec(line);
    if (match) rows.push({ path: match[1]!, status: match[2] as "live" | "legacy", reuse: match[3] === "có" });
  }
  return rows;
}

/** Source files that exist only for the monthly cycle, found by name so new ones cannot slip past the inventory. */
function monthlySourceFiles(): string[] {
  const found: string[] = [];
  for (const base of ["apps/web/src", "apps/api/src", "packages/domain/src", "packages/database/src"]) {
    for (const entry of readdirSync(join(root, base), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const path = relative(root, join(entry.parentPath, entry.name)).split(sep).join("/");
      if (/\.test\.|\.d\.ts$/.test(entry.name)) continue;
      if (/^monthly/i.test(entry.name) || path.startsWith("packages/domain/src/monthly/")) found.push(path);
    }
  }
  return found.sort();
}

describe("monthly cycle inventory", () => {
  it("lists at least one row", () => {
    expect(parseInventory().length).toBeGreaterThan(0);
  });

  it("every file listed as live in the monthly inventory exists", () => {
    for (const row of parseInventory().filter((r) => r.status === "live")) expect(existsSync(join(root, row.path)), row.path).toBe(true);
  });

  it("every file listed as legacy is stored under legacy/monthly-cycle with a .txt suffix", () => {
    for (const row of parseInventory().filter((r) => r.status === "legacy")) {
      expect(existsSync(join(root, "legacy/monthly-cycle", `${row.path}.txt`)), row.path).toBe(true);
      expect(existsSync(join(root, row.path)), `${row.path} must be gone from the live tree`).toBe(false);
    }
  });

  it("covers every monthly-only source file in the live tree", () => {
    const listed = new Set(parseInventory().map((r) => r.path));
    expect(monthlySourceFiles().filter((path) => !listed.has(path))).toEqual([]);
  });

  it("never marks a reused file as moved to legacy", () => {
    expect(parseInventory().filter((r) => r.reuse && r.status === "legacy").map((r) => r.path)).toEqual([]);
  });
});
