import { createRequire } from "node:module";
import { createServer } from "node:net";

const requireFromStoragePackage = createRequire(new URL("../packages/storage/package.json", import.meta.url));
const { HeadBucketCommand, S3Client } = requireFromStoragePackage("@aws-sdk/client-s3");

export const LOCAL_STORAGE_RECOVERY_COMMAND = "docker compose up -d minio minio-init";
export const LOCAL_EVIDENCE_BUCKET = "e4s-evidence";
export const LOCAL_MEDIA_BUCKET = "e4s-media";
const configuredPort = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 && value < 65_536 ? value : fallback;
};
export const LOCAL_DEV_PORTS = Object.freeze({
  web: configuredPort("E4S_LOCAL_WEB_PORT", 4175),
  api: configuredPort("E4S_LOCAL_API_PORT", 3001),
  postgres: configuredPort("E4S_LOCAL_POSTGRES_PORT", 54329),
  minio: configuredPort("E4S_LOCAL_MINIO_PORT", 9002),
  minioConsole: configuredPort("E4S_LOCAL_MINIO_CONSOLE_PORT", 9003)
});

export async function verifyLocalObjectStorage(options = {}) {
  const endpoint = options.endpoint ?? process.env.S3_ENDPOINT ?? "http://127.0.0.1:9002";
  const region = options.region ?? process.env.S3_REGION ?? "us-east-1";
  const accessKeyId = options.accessKeyId ?? process.env.S3_ACCESS_KEY ?? process.env.MINIO_ROOT_USER ?? "e4s_minio";
  const secretAccessKey = options.secretAccessKey ?? process.env.S3_SECRET_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? "e4s_local_minio_password";
  const buckets = options.buckets ?? [
    process.env.S3_EVIDENCE_BUCKET ?? process.env.S3_BUCKET ?? LOCAL_EVIDENCE_BUCKET,
    process.env.S3_MEDIA_BUCKET ?? LOCAL_MEDIA_BUCKET
  ];
  const fetchImpl = options.fetchImpl ?? fetch;
  const healthUrl = `${endpoint.replace(/\/$/, "")}/minio/health/ready`;

  try {
    const response = await fetchImpl(healthUrl, { signal: AbortSignal.timeout(3_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch {
    throw localStorageError(`MinIO chưa sẵn sàng tại ${endpoint}.`);
  }

  const headBucket = options.headBucket ?? (async (bucketName) => {
    const client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey }
    });
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
  });

  for (const bucket of buckets) {
    try {
      await headBucket(bucket);
    } catch {
      throw localStorageError(`Bucket ${bucket} chưa sẵn sàng trên MinIO E4S.`);
    }
  }

  return { endpoint, buckets };
}

export async function waitForHttpReady(name, url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(Math.min(3_000, timeoutMs)) });
      if (response.ok) return;
    } catch {
      // The child process can refuse connections briefly while it boots.
    }
    if (Date.now() > deadline) break;
    await delay(intervalMs);
  }

  throw new Error(`${name} chưa sẵn sàng tại ${url} sau ${timeoutMs}ms.`);
}

export function assertLocalPortAvailable(name, port, options = {}) {
  const host = options.host ?? "127.0.0.1";
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`${name} đang chiếm cổng ${host}:${port}. Hãy dừng tiến trình cũ rồi chạy lại E4S local.`)));
    server.listen({ host, port }, () => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
}

function localStorageError(reason) {
  return new Error(`${reason}\nMinIO API mặc định: http://127.0.0.1:${LOCAL_DEV_PORTS.minio}; Console: http://127.0.0.1:${LOCAL_DEV_PORTS.minioConsole}.\nKhởi động đúng storage của E4S rồi chạy lại:\n${LOCAL_STORAGE_RECOVERY_COMMAND}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
