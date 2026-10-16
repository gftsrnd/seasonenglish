import { hostname } from "node:os";

export interface WorkerConfig {
  databaseUrl: string;
  workerId: string;
  pollMs: number;
  leaseSeconds: number;
  minio: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  };
  groq?: {
    apiKey: string;
    model: string;
    baseUrl?: string;
  };
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const databaseUrl = required(env.DATABASE_URL, "DATABASE_URL");
  const workerId = env.WORKER_ID?.trim() || `e4s-worker-${hostname()}-${process.pid}`;
  const minioEndpoint = env.S3_ENDPOINT?.trim() || env.MINIO_ENDPOINT?.trim() || "http://minio:9000";
  const accessKeyId = env.S3_ACCESS_KEY?.trim() || env.MINIO_ROOT_USER?.trim() || "e4s_minio";
  const secretAccessKey = env.S3_SECRET_KEY?.trim() || env.MINIO_ROOT_PASSWORD?.trim() || "e4s_local_minio_password";
  const groqApiKey = env.GROQ_API_KEY?.trim();

  return {
    databaseUrl,
    workerId,
    pollMs: positiveInteger(env.WORKER_POLL_MS, 1_000, "WORKER_POLL_MS"),
    leaseSeconds: positiveInteger(env.WORKER_LEASE_SECONDS, 60, "WORKER_LEASE_SECONDS"),
    minio: {
      endpoint: minioEndpoint,
      region: env.S3_REGION?.trim() || "us-east-1",
      accessKeyId,
      secretAccessKey,
      bucket: env.S3_BUCKET?.trim() || "e4s-evidence"
    },
    ...(groqApiKey ? {
      groq: {
        apiKey: groqApiKey,
        model: env.GROQ_MODEL?.trim() || "qwen/qwen3.8-27b",
        ...(env.GROQ_BASE_URL?.trim() ? { baseUrl: env.GROQ_BASE_URL.trim() } : {})
      }
    } : {})
  };
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}
