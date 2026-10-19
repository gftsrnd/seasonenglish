import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_EXTENSIONS = new Set([".css", ".js", ".jsx", ".ts", ".tsx"]);
const TEST_FILE_PATTERN = /(?:^|\.)((?:test)|(?:spec))\.[^.]+$/i;
const ALLOW_ANNOTATION = "media-scan: allow-avatar-reward";
const AVATAR_REWARD_CONTEXT = /(?:avatar|reward|badge|certificate|profile-reward)/i;

const RULES = [
  { id: "generated-svg", pattern: /<svg\b/i, message: "inline or generated SVG artwork" },
  { id: "data-image", pattern: /data:image\//i, message: "data-URI image" },
  {
    id: "fake-art-helper",
    pattern: /\b(?:SeasonMark|SeasonHero|GiftArt|DinoGameOverArt|DINO_SVG|svgDataUri|vocabularyIllustration|giftBoxSvg|giftOpenSvg|mushroomSvg|bombSvg|heroSvg|catchSvg)\b|season-art(?:\.js|\.tsx)?/i,
    message: "known generated-art helper"
  },
  {
    id: "css-scenery",
    pattern: /(?:\.hero::after|\.party::after|\.welcome\s+\.sky::(?:before|after)|\.welcome\s+\.land|\.party\s+\.conf|\bcatch-sky\b|\bcloud--(?:one|two)\b)/i,
    message: "CSS-drawn scenery"
  }
];

const ILLUSTRATIVE_EMOJI = [
  "🎉", "🎁", "🌱", "🌸", "🌼", "🌻", "☀", "🍂", "❄", "🎄", "🌙", "⭐", "🔥",
  "💪", "🏆", "🎯", "💡", "🔔", "📣", "📷", "🖼", "❤️", "❤", "🖤", "🍄", "🧺", "🏁",
  "🐣", "📅", "🌟", "🔑", "💬", "✍"
];

export async function scanAppMedia(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? "apps/web/src/app");
  const files = await collectSourceFiles(rootDir);
  const issues = [];

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    const lines = source.split(/\r?\n/);
    const relativePath = path.relative(rootDir, filePath).split(path.sep).join("/");

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const rule of RULES) {
        const column = line.search(rule.pattern);
        if (column >= 0) issues.push(issue(relativePath, index, column, rule.id, rule.message, line));
      }

      const emoji = firstEmoji(line);
      if (emoji && !hasAvatarRewardExemption({ filePath: relativePath, line, previousLine: lines[index - 1] ?? "" })) {
        issues.push(issue(relativePath, index, line.indexOf(emoji), "illustrative-emoji", "illustrative emoji", line));
      }
    }
  }

  return issues;
}

export async function verifyAppMedia(options = {}) {
  const issues = await scanAppMedia(options);
  if (issues.length === 0) return { filesChecked: (await collectSourceFiles(path.resolve(options.rootDir ?? "apps/web/src/app"))).length };

  const details = issues.map(({ file, line, column, rule, excerpt }) =>
    `- ${file}:${line}:${column} [${rule}] ${excerpt}`
  ).join("\n");
  throw new Error(`App media source gate found ${issues.length} prohibited item(s):\n${details}`);
}

async function collectSourceFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(entryPath);
    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name)) || TEST_FILE_PATTERN.test(entry.name)) return [];
    return [entryPath];
  }));
  return nested.flat().sort();
}

function firstEmoji(line) {
  let match;
  for (const emoji of ILLUSTRATIVE_EMOJI) {
    const index = line.indexOf(emoji);
    if (index >= 0 && (!match || index < match.index)) match = { emoji, index };
  }
  return match?.emoji;
}

function hasAvatarRewardExemption({ filePath, line, previousLine }) {
  return previousLine.includes(ALLOW_ANNOTATION) && AVATAR_REWARD_CONTEXT.test(`${filePath} ${line}`);
}

function issue(file, zeroBasedLine, zeroBasedColumn, rule, message, sourceLine) {
  return {
    file,
    line: zeroBasedLine + 1,
    column: zeroBasedColumn + 1,
    rule,
    message,
    excerpt: sourceLine.trim()
  };
}

async function runCli() {
  try {
    const result = await verifyAppMedia();
    console.log(`App media source gate passed (${result.filesChecked} production files checked).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runCli();
}
