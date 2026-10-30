import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";

export interface PutObjectInput {
  bucket: string;
  objectKey: string;
  body: Uint8Array;
  mimeType: string;
}

export interface PresignObjectInput {
  bucket: string;
  objectKey: string;
  expiresInSeconds: number;
}

export interface PresignedObject {
  url: string;
  expiresAt: Date;
}

export interface GetObjectInput {
  bucket: string;
  objectKey: string;
  range?: string;
}

export interface StoredObject {
  body: Readable;
  mimeType?: string;
  contentLength?: number;
  contentRange?: string;
  acceptRanges?: string;
}

export interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<void>;
  getObject?(input: GetObjectInput): Promise<StoredObject>;
  deleteObject(bucket: string, objectKey: string): Promise<void>;
  objectExists?(bucket: string, objectKey: string): Promise<boolean>;
  ready(bucket: string): Promise<void>;
  presignGetObject?(input: PresignObjectInput): Promise<PresignedObject>;
}

export const EVIDENCE_BUCKET = process.env.S3_EVIDENCE_BUCKET?.trim() || "e4s-evidence";
export const MEDIA_BUCKET = process.env.S3_MEDIA_BUCKET?.trim() || "e4s-media";

export interface S3StorageOptions {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function createS3Storage(options: S3StorageOptions): ObjectStorage {
  const client = new S3Client({
    endpoint: options.endpoint,
    region: options.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey
    }
  });

  return {
    async putObject(input) {
      await client.send(new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        Body: input.body,
        ContentType: input.mimeType
      }));
    },
    async getObject(input) {
      const response = await client.send(new GetObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        ...(input.range ? { Range: input.range } : {})
      }));
      if (!response.Body) throw new Error("S3 object body is unavailable");
      if (!("pipe" in response.Body) || typeof response.Body.pipe !== "function") {
        throw new Error("S3 object body is not a Node.js readable stream");
      }
      return {
        body: response.Body as Readable,
        ...(response.ContentType ? { mimeType: response.ContentType } : {}),
        ...(response.ContentLength !== undefined ? { contentLength: response.ContentLength } : {}),
        ...(response.ContentRange ? { contentRange: response.ContentRange } : {}),
        ...(response.AcceptRanges ? { acceptRanges: response.AcceptRanges } : {})
      };
    },
    async deleteObject(bucket, objectKey) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    },
    async objectExists(bucket, objectKey) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
        return true;
      } catch (error) {
        if (isMissingObject(error)) return false;
        throw error;
      }
    },
    async ready(bucket) {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    },
    async presignGetObject(input) {
      const expiresInSeconds = Math.max(1, Math.min(900, Math.floor(input.expiresInSeconds)));
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: input.bucket, Key: input.objectKey }),
        { expiresIn: expiresInSeconds }
      );
      return { url, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
    }
  };
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return value.$metadata?.httpStatusCode === 404
    || value.name === "NotFound"
    || value.name === "NoSuchKey";
}
