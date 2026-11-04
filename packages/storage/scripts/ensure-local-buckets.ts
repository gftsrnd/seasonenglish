import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT;
const accessKeyId = process.env.S3_ACCESS_KEY;
const secretAccessKey = process.env.S3_SECRET_KEY;
if (!endpoint || !accessKeyId || !secretAccessKey) {
  throw new Error("S3_ENDPOINT, S3_ACCESS_KEY and S3_SECRET_KEY are required");
}

const client = new S3Client({
  endpoint,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey }
});

for (const Bucket of [process.env.S3_EVIDENCE_BUCKET ?? "e4s-evidence", process.env.S3_MEDIA_BUCKET ?? "e4s-media"]) {
  await ensureBucket(Bucket);
}

process.stdout.write("Local object-storage buckets are ready.\n");

async function ensureBucket(Bucket: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await client.send(new HeadBucketCommand({ Bucket }));
      return;
    } catch (error) {
      lastError = error;
      try {
        await client.send(new CreateBucketCommand({ Bucket }));
        return;
      } catch (createError) {
        lastError = createError;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw lastError instanceof Error ? lastError : new Error(`Unable to create local bucket ${Bucket}`);
}
