const webUrl = process.env.E4S_WEB_URL ?? "http://127.0.0.1:4174";
const apiUrl = process.env.E4S_API_URL ?? "http://127.0.0.1:3002";

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
