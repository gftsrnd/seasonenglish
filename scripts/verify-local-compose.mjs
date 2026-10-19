import { verifyLocalObjectStorage } from "./local-storage-preflight.mjs";

const webUrl = process.env.E4S_WEB_URL ?? "http://127.0.0.1:4175";
const apiUrl = process.env.E4S_API_URL ?? "http://127.0.0.1:3001";
const minioUrl = process.env.E4S_MINIO_URL ?? "http://127.0.0.1:9002";

const checks = [
  ["web", webUrl],
  ["api health", `${apiUrl}/api/health`],
  ["api readiness", `${apiUrl}/api/readiness`]
];

for (const [name, url] of checks) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name} failed: ${response.status} ${url}`);
  process.stdout.write(`ok ${name}: ${url}\n`);
}

const storage = await verifyLocalObjectStorage({ endpoint: minioUrl });
process.stdout.write(`ok minio: ${storage.endpoint} (${storage.buckets.join(", ")})\n`);
