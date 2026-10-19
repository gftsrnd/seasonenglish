import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_MEDIA_IDS = [
  "mascot", "basket", "dinosaur", "gift-closed", "gift-correct", "gift-wrong", "flag", "mushroom", "bomb",
  "hero-rabbit", "hero-cricket", "hero-squirrel", "hero-penguin", "hero-swallow", "hero-reindeer",
  "food-rabbit", "food-cricket", "food-squirrel", "food-penguin", "food-swallow", "food-reindeer",
  "catch-spring", "catch-summer", "catch-autumn", "catch-winter", "catch-tet", "catch-midautumn", "catch-christmas"
];

const rasterExtensions = new Set([".png", ".webp"]);
const sha256Pattern = /^[a-f0-9]{64}$/;

export async function verifyMediaAssets(options = {}) {
  const repoRoot = resolve(options.repoRoot ?? dirname(dirname(fileURLToPath(import.meta.url))));
  const manifestPath = resolve(repoRoot, options.manifestPath ?? "apps/web/public/media/manifest.json");
  const mediaRoot = resolve(repoRoot, options.mediaRoot ?? "apps/web/public/media");
  const requiredIds = options.requiredIds ?? REQUIRED_MEDIA_IDS;
  const errors = [];
  let entries;

  try {
    entries = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Không đọc được media manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(entries)) throw new Error("Media manifest phải là một JSON array.");

  const ids = new Set();
  const paths = new Set();
  for (const [index, entry] of entries.entries()) {
    const label = typeof entry?.id === "string" ? entry.id : `entry #${index + 1}`;
    if (!entry || typeof entry !== "object") { errors.push(`${label}: entry không hợp lệ.`); continue; }
    if (typeof entry.id !== "string" || !entry.id) errors.push(`${label}: thiếu id.`);
    else if (ids.has(entry.id)) errors.push(`${label}: id bị trùng.`);
    else ids.add(entry.id);

    if (typeof entry.localPath !== "string" || !entry.localPath.startsWith("apps/web/public/media/") || entry.localPath.includes("\\")) {
      errors.push(`${label}: localPath phải nằm trong apps/web/public/media và dùng dấu '/'.`);
      continue;
    }
    if (paths.has(entry.localPath)) errors.push(`${label}: localPath bị trùng.`);
    else paths.add(entry.localPath);
    if (!rasterExtensions.has(extname(entry.localPath).toLowerCase())) errors.push(`${label}: chỉ chấp nhận PNG hoặc WebP.`);
    if (entry.licence !== "CC0-1.0") errors.push(`${label}: licence phải là CC0-1.0.`);
    if (typeof entry.sourcePage !== "string" || !/^https:\/\/kenney\.nl\/assets\/[a-z0-9-]+$/.test(entry.sourcePage)) errors.push(`${label}: sourcePage phải là trang asset chính thức của Kenney.`);
    if (typeof entry.sourcePack !== "string" || !entry.sourcePack.trim()) errors.push(`${label}: thiếu sourcePack.`);
    if (typeof entry.originalArchivePath !== "string" || !entry.originalArchivePath.trim()) errors.push(`${label}: thiếu originalArchivePath.`);
    if (typeof entry.purpose !== "string" || !entry.purpose.trim()) errors.push(`${label}: thiếu purpose.`);
    if (typeof entry.sha256 !== "string" || !sha256Pattern.test(entry.sha256)) errors.push(`${label}: sha256 phải gồm đúng 64 ký tự hex viết thường.`);

    const absolutePath = resolve(repoRoot, entry.localPath);
    if (!isInside(mediaRoot, absolutePath)) { errors.push(`${label}: localPath thoát khỏi media root.`); continue; }
    try {
      if (!(await stat(absolutePath)).isFile()) throw new Error("not a file");
      if (sha256Pattern.test(entry.sha256)) {
        const actual = createHash("sha256").update(await readFile(absolutePath)).digest("hex");
        if (actual !== entry.sha256) errors.push(`${label}: SHA-256 không khớp (thực tế ${actual}).`);
      }
    } catch {
      errors.push(`${label}: thiếu file ${entry.localPath}.`);
    }
  }

  for (const requiredId of requiredIds) if (!ids.has(requiredId)) errors.push(`Manifest thiếu id bắt buộc: ${requiredId}.`);

  const declared = new Set([...paths].map((path) => path.replaceAll("/", sep)));
  for (const absolutePath of await listRasterFiles(mediaRoot)) {
    const repositoryPath = relative(repoRoot, absolutePath);
    if (!declared.has(repositoryPath)) errors.push(`File raster chưa khai báo trong manifest: ${repositoryPath.replaceAll(sep, "/")}.`);
  }

  if (errors.length) throw new Error(`Media asset verification failed:\n- ${errors.join("\n- ")}`);
  return { entries: entries.length, files: paths.size };
}

async function listRasterFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listRasterFiles(absolutePath));
    else if (entry.isFile() && rasterExtensions.has(extname(entry.name).toLowerCase())) files.push(absolutePath);
  }
  return files;
}

function isInside(parent, child) {
  const childRelative = relative(parent, child);
  return childRelative === "" || (!childRelative.startsWith(`..${sep}`) && childRelative !== "..");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyMediaAssets()
    .then(({ entries, files }) => console.log(`Verified ${files} media files from ${entries} manifest entries.`))
    .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
