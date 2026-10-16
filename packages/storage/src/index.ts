import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

export interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<void>;
  deleteObject(bucket: string, objectKey: string): Promise<void>;
  ready(bucket: string): Promise<void>;
  presignGetObject?(input: PresignObjectInput): Promise<PresignedObject>;
}

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
    async deleteObject(bucket, objectKey) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
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
