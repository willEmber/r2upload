import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { loadConfig } from './config';

const cfg = loadConfig();

// Default R2 client from .env
export const r2 = new S3Client({
  region: 'auto',
  endpoint: cfg.endpoint,
  credentials: {
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
  },
});

// Create R2 client with custom config (for desktop app)
export function createR2Client(config: {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}) {
  return new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function createUploadUrl(
  key: string,
  contentType: string,
  cacheControl?: string,
  client?: S3Client,
  bucket?: string
) {
  const cmd = new PutObjectCommand({
    Bucket: bucket || cfg.bucket,
    Key: key,
    ContentType: contentType,
    CacheControl: cacheControl ?? 'public, max-age=31536000, immutable',
  });
  const url = await getSignedUrl(client || r2, cmd, { expiresIn: 60 });
  return url;
}

export async function listObjects(
  params: {
    prefix?: string;
    maxKeys?: number;
    continuationToken?: string;
  },
  client?: S3Client,
  bucket?: string
) {
  const { prefix = '', maxKeys = 100, continuationToken } = params;
  const res = await (client || r2).send(new ListObjectsV2Command({
    Bucket: bucket || cfg.bucket,
    Prefix: prefix,
    MaxKeys: maxKeys,
    ContinuationToken: continuationToken,
  }));
  return res;
}

export async function deleteObject(key: string, client?: S3Client, bucket?: string) {
  return (client || r2).send(new DeleteObjectCommand({ Bucket: bucket || cfg.bucket, Key: key }));
}

export async function copyObject(oldKey: string, newKey: string, client?: S3Client, bucket?: string) {
  const bucketName = bucket || cfg.bucket;
  return (client || r2).send(new CopyObjectCommand({
    Bucket: bucketName,
    Key: newKey,
    CopySource: `/${bucketName}/${encodeURIComponent(oldKey)}`,
    MetadataDirective: 'COPY',
  }));
}

export async function renameObject(oldKey: string, newKey: string, client?: S3Client, bucket?: string) {
  await copyObject(oldKey, newKey, client, bucket);
  await deleteObject(oldKey, client, bucket);
  return { ok: true };
}

export async function headObject(key: string, client?: S3Client, bucket?: string) {
  return (client || r2).send(new HeadObjectCommand({ Bucket: bucket || cfg.bucket, Key: key }));
}

export function publicUrlFor(key: string, publicBaseUrl?: string) {
  const baseUrl = publicBaseUrl || cfg.publicBaseUrl;
  if (!baseUrl) return null;
  return `${baseUrl}/${encodeURI(key)}`;
}
