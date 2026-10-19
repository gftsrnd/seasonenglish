import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scanAppMedia, verifyAppMedia } from "./verify-app-media.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("app media source gate", () => {
  it("reports generated SVG, data images, fake-art helpers, scenery and illustrative emoji with source locations", async () => {
    const rootDir = await fixture({
      "Inline.tsx": "export const Art = () => <svg aria-hidden />;\n",
      "Data.css": ".icon{background:url('data:image/svg+xml;base64,abc')}\n",
      "Legacy.tsx": "import { SeasonHero } from './season-art.js';\n",
      "Scenery.css": ".hero::after{content:''}\n",
      "Emoji.tsx": "export const copy = 'Hoàn tất 🎉';\n"
    });

    const issues = await scanAppMedia({ rootDir });

    expect(issues.map(({ rule }) => rule)).toEqual([
      "data-image",
      "illustrative-emoji",
      "generated-svg",
      "fake-art-helper",
      "css-scenery"
    ]);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: "Inline.tsx", line: 1, column: 26 }),
      expect.objectContaining({ file: "Scenery.css", rule: "css-scenery" })
    ]));
    await expect(verifyAppMedia({ rootDir })).rejects.toThrow("App media source gate found 5 prohibited item(s)");
  });

  it("ignores test files and allows Lucide components", async () => {
    const rootDir = await fixture({
      "Status.tsx": "import { Heart, Gift } from 'lucide-react';\nexport const Status = () => <Heart aria-label='Mạng còn lại' />;\n",
      "Status.test.tsx": "export const fake = <svg />; export const emoji = '🎉';\n"
    });

    await expect(verifyAppMedia({ rootDir })).resolves.toEqual({ filesChecked: 1 });
  });

  it("allows only the immediately following avatar or reward line", async () => {
    const rootDir = await fixture({
      "ProfileReward.tsx": [
        "// media-scan: allow-avatar-reward -- deliberate badge symbol",
        "export const badge = { icon: '🏆' };",
        "export const inlineBadge = { icon: '🌟' }; // media-scan: allow-avatar-reward -- deliberate badge symbol",
        "export const celebration = '🎉';",
        "// media-scan: allow-avatar-reward -- does not cross a blank line",
        "",
        "export const secondBadge = { icon: '🔥' };"
      ].join("\n"),
      "Decorative.tsx": [
        "// media-scan: allow-avatar-reward -- invalid outside avatar/reward context",
        "export const decoration = '🎁';"
      ].join("\n")
    });

    const issues = await scanAppMedia({ rootDir });

    expect(issues).toEqual([
      expect.objectContaining({ file: "Decorative.tsx", line: 2, rule: "illustrative-emoji" }),
      expect.objectContaining({ file: "ProfileReward.tsx", line: 4, rule: "illustrative-emoji" }),
      expect.objectContaining({ file: "ProfileReward.tsx", line: 7, rule: "illustrative-emoji" })
    ]);
  });

  it("allows only line-scoped SVG used by the preserved brand mark", async () => {
    const rootDir = await fixture({
      "shared/SeasonMark.tsx": [
        "// media-scan: allow-brand -- existing product branding",
        "export const Mark = () => <svg aria-hidden />;",
        "export const Other = () => <svg aria-hidden />;"
      ].join("\n")
    });

    expect(await scanAppMedia({ rootDir })).toEqual([
      expect.objectContaining({ file: "shared/SeasonMark.tsx", line: 3, rule: "generated-svg" })
    ]);
  });
});

async function fixture(files) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "e4s-media-scan-"));
  temporaryDirectories.push(rootDir);
  await Promise.all(Object.entries(files).map(async ([relativePath, contents]) => {
    const filePath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, "utf8");
  }));
  return rootDir;
}
