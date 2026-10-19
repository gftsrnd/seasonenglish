import { createRequire } from "node:module";

const requireFromStoragePackage = createRequire(new URL("../packages/storage/package.json", import.meta.url));
const { HeadBucketCommand, S3Client } = requireFromStoragePackage("@aws-sdk/client-s3");

export const LOCAL_STORAGE_RECOVERY_COMMAND = "docker compose up -d minio minio-init";
export const LOCAL_EVIDENCE_BUCKET = "e4s-evidence";
export const LOCAL_MEDIA_BUCKET = "e4s-media";

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

function localStorageError(reason) {
  return new Error(`${reason}\nKhởi động đúng storage của E4S rồi chạy lại:\n${LOCAL_STORAGE_RECOVERY_COMMAND}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
