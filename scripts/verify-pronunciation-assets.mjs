import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const sha256Pattern = /^[a-f0-9]{64}$/;
const audioRoots = {
  phoneme: "apps/web/public/media/audio/phonemes",
  word: "apps/web/public/media/audio/words"
};

export async function verifyPronunciationAssets(options = {}) {
  const repoRoot = resolve(options.repoRoot ?? fileURLToPath(new URL("..", import.meta.url)));
  const manifestPath = resolve(repoRoot, options.manifestPath ?? "apps/web/public/media/pronunciation-manifest.json");
  const entries = await readManifest(manifestPath);
  const errors = [];
  const declared = new Set();
  const urls = new Set();

  for (const entry of entries) {
    const label = `${entry.kind}:${entry.key}`;
    const root = audioRoots[entry.kind];
    const expectedExtension = entry.kind === "phoneme" ? ".ogg" : ".mp3";
    if (!root || typeof entry.key !== "string" || !entry.key.trim()) errors.push(`${label}: invalid kind or key`);
    if (typeof entry.id !== "string" || !entry.id.trim()) errors.push(`${label}: missing id`);
    if (typeof entry.url !== "string" || !entry.url.startsWith(`/media/audio/${entry.kind === "phoneme" ? "phonemes" : "words"}/`)) errors.push(`${label}: invalid URL`);
    if (urls.has(entry.url)) errors.push(`${label}: duplicate URL`);
    else urls.add(entry.url);
    if (typeof entry.localPath !== "string" || !entry.localPath.startsWith(`${root}/`) || extname(entry.localPath).toLowerCase() !== expectedExtension) errors.push(`${label}: invalid localPath`);
    if (!sha256Pattern.test(entry.sha256 ?? "")) errors.push(`${label}: invalid sha256`);
    if (typeof entry.licence !== "string" || !entry.licence.trim() || entry.licence === "pending") errors.push(`${label}: missing verified licence`);
    if (typeof entry.sourceUrl !== "string" || !/^https?:\/\//u.test(entry.sourceUrl)) errors.push(`${label}: missing sourceUrl`);

    if (typeof entry.localPath !== "string") continue;
    const absolutePath = resolve(repoRoot, entry.localPath);
    if (!isInside(resolve(repoRoot, root), absolutePath)) {
      errors.push(`${label}: localPath escapes audio root`);
      continue;
    }
    declared.add(absolutePath);
    try {
      if (!(await stat(absolutePath)).isFile()) throw new Error("not a file");
      const contents = await readFile(absolutePath);
      if (!isPlayableAudio(contents, entry.kind)) errors.push(`${label}: packaged file is not a nonempty playable ${entry.kind} asset`);
      const actual = createHash("sha256").update(contents).digest("hex");
      if (actual !== entry.sha256) errors.push(`${label}: SHA-256 mismatch`);
    } catch {
      errors.push(`${label}: missing file ${entry.localPath}`);
    }
  }

  for (const kind of Object.keys(audioRoots)) {
    const directory = resolve(repoRoot, audioRoots[kind]);
    for (const file of await listAudioFiles(directory)) {
      if (!declared.has(file)) errors.push(`Audio file not registered: ${relative(repoRoot, file).replaceAll(sep, "/")}`);
    }
  }
  if (errors.length) throw new Error(`Pronunciation asset verification failed:\n- ${errors.join("\n- ")}`);
  return { entries: entries.length, files: declared.size };
}

async function readManifest(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read pronunciation asset manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.phonemes) || !Array.isArray(manifest.words)) {
    throw new Error("Pronunciation asset manifest must contain version 1 phonemes and words arrays");
  }
  const entries = [...manifest.phonemes, ...manifest.words];
  const keys = new Set();
  for (const entry of entries) {
    const key = `${entry?.kind}:${entry?.key}`;
    if (keys.has(key)) throw new Error(`Duplicate pronunciation registry entry: ${key}`);
    keys.add(key);
  }
  return entries;
}

async function listAudioFiles(directory) {
  try {
    if (!(await stat(directory)).isDirectory()) return [];
  } catch {
    return [];
  }
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listAudioFiles(absolutePath));
    else if (entry.isFile() && [".ogg", ".wav", ".mp3"].includes(extname(entry.name).toLowerCase())) files.push(absolutePath);
  }
  return files;
}

function isPlayableAudio(contents, kind) {
  if (!contents.length) return false;
  if (kind === "phoneme") return contents.subarray(0, 4).toString("ascii") === "OggS";
  return contents.subarray(0, 4).toString("ascii") === "RIFF" || contents.subarray(0, 3).toString("ascii") === "ID3";
}

function isInside(parent, child) {
  const childRelative = relative(parent, child);
  return childRelative === "" || (!childRelative.startsWith(`..${sep}`) && childRelative !== "..");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyPronunciationAssets()
    .then(({ entries, files }) => console.log(`Verified ${files} pronunciation files from ${entries} registry entries.`))
    .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
