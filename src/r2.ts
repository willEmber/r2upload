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

export const r2 = new S3Client({
  region: 'auto',
  endpoint: cfg.endpoint,
  credentials: {
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
  },
});

export async function createUploadUrl(key: string, contentType: string, cacheControl?: string) {
  const cmd = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: contentType,
    CacheControl: cacheControl ?? 'public, max-age=31536000, immutable',
  });
  const url = await getSignedUrl(r2, cmd, { expiresIn: 60 });
  return url;
}

export async function listObjects(params: {
  prefix?: string;
  maxKeys?: number;
  continuationToken?: string;
}) {
  const { prefix = '', maxKeys = 100, continuationToken } = params;
  const res = await r2.send(new ListObjectsV2Command({
    Bucket: cfg.bucket,
    Prefix: prefix,
    MaxKeys: maxKeys,
    ContinuationToken: continuationToken,
  }));
  return res;
}

export async function deleteObject(key: string) {
  return r2.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

export async function copyObject(oldKey: string, newKey: string) {
  return r2.send(new CopyObjectCommand({
    Bucket: cfg.bucket,
    Key: newKey,
    CopySource: `/${cfg.bucket}/${encodeURIComponent(oldKey)}`,
    MetadataDirective: 'COPY',
  }));
}

export async function renameObject(oldKey: string, newKey: string) {
  await copyObject(oldKey, newKey);
  await deleteObject(oldKey);
  return { ok: true };
}

export async function headObject(key: string) {
  return r2.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

export function publicUrlFor(key: string) {
  if (!cfg.publicBaseUrl) return null;
  return `${cfg.publicBaseUrl}/${encodeURI(key)}`;
}
