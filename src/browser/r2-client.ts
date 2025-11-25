/**
 * Browser-side R2 client for standalone desktop app
 * Directly communicates with Cloudflare R2 using AWS SDK
 */

import {
    S3Client,
    PutObjectCommand,
    ListObjectsV2Command,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface R2Config {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicBaseUrl?: string;
}

let r2Client: S3Client | null = null;
let currentConfig: R2Config | null = null;

export function initR2Client(config: R2Config): S3Client {
    currentConfig = config;
    r2Client = new S3Client({
        region: 'auto',
        endpoint: config.endpoint,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    });
    return r2Client;
}

export function getR2Client(): S3Client | null {
    return r2Client;
}

export function getConfig(): R2Config | null {
    return currentConfig;
}

export function isConfigured(): boolean {
    return r2Client !== null && currentConfig !== null;
}

// Generate a hash-based key
function generateHashKey(filename: string, prefix?: string): string {
    const ext = filename.includes('.') ? '.' + filename.split('.').pop() : '';
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    const hash = `${timestamp}-${random}`;
    const base = prefix ? `${prefix}/${hash}${ext}` : `${hash}${ext}`;
    return base;
}

// Sanitize filename
function sanitizeFilename(name: string): string {
    return name.replace(/[\\/\u0000-\u001f]/g, '_').replace(/\s+/g, '-');
}

export async function createUploadUrl(
    filename: string,
    contentType: string,
    options?: {
        prefix?: string;
        strategy?: 'hash' | 'original';
        cacheControl?: string;
    }
): Promise<{ key: string; url: string; publicUrl: string | null }> {
    if (!r2Client || !currentConfig) {
        throw new Error('R2 client not initialized. Please configure R2 settings first.');
    }

    const strategy = options?.strategy || 'hash';
    let key: string;

    if (strategy === 'original') {
        const sanitized = sanitizeFilename(filename);
        key = options?.prefix ? `${options.prefix}/${sanitized}` : sanitized;
    } else {
        key = generateHashKey(filename, options?.prefix);
    }

    const cmd = new PutObjectCommand({
        Bucket: currentConfig.bucket,
        Key: key,
        ContentType: contentType,
        CacheControl: options?.cacheControl ?? 'public, max-age=31536000, immutable',
    });

    const url = await getSignedUrl(r2Client, cmd, { expiresIn: 300 });
    const publicUrl = currentConfig.publicBaseUrl
        ? `${currentConfig.publicBaseUrl}/${encodeURI(key)}`
        : null;

    return { key, url, publicUrl };
}

export async function listObjects(params: {
    prefix?: string;
    maxKeys?: number;
    continuationToken?: string;
}) {
    if (!r2Client || !currentConfig) {
        throw new Error('R2 client not initialized. Please configure R2 settings first.');
    }

    const { prefix = '', maxKeys = 100, continuationToken } = params;
    const res = await r2Client.send(
        new ListObjectsV2Command({
            Bucket: currentConfig.bucket,
            Prefix: prefix,
            MaxKeys: maxKeys,
            ContinuationToken: continuationToken,
        })
    );

    return {
        isTruncated: res.IsTruncated ?? false,
        nextContinuationToken: res.NextContinuationToken ?? null,
        keyCount: res.KeyCount ?? 0,
        contents: (res.Contents ?? []).map((o) => ({
            key: o.Key,
            size: o.Size,
            eTag: o.ETag,
            lastModified: o.LastModified,
            storageClass: o.StorageClass,
        })),
        prefix: res.Prefix ?? prefix,
    };
}

export async function deleteObject(key: string) {
    if (!r2Client || !currentConfig) {
        throw new Error('R2 client not initialized. Please configure R2 settings first.');
    }

    await r2Client.send(
        new DeleteObjectCommand({
            Bucket: currentConfig.bucket,
            Key: key,
        })
    );

    return { ok: true };
}

export async function deleteObjects(keys: string[]) {
    if (!r2Client || !currentConfig) {
        throw new Error('R2 client not initialized. Please configure R2 settings first.');
    }

    // R2 supports batch delete
    await r2Client.send(
        new DeleteObjectsCommand({
            Bucket: currentConfig.bucket,
            Delete: {
                Objects: keys.map((key) => ({ Key: key })),
                Quiet: true,
            },
        })
    );

    return { ok: true, count: keys.length };
}

export async function headObject(key: string) {
    if (!r2Client || !currentConfig) {
        throw new Error('R2 client not initialized. Please configure R2 settings first.');
    }

    const h = await r2Client.send(
        new HeadObjectCommand({
            Bucket: currentConfig.bucket,
            Key: key,
        })
    );

    return {
        key,
        contentLength: h.ContentLength ?? null,
        eTag: h.ETag ?? null,
        contentType: h.ContentType ?? null,
        lastModified: h.LastModified ?? null,
        metadata: h.Metadata ?? {},
        cacheControl: h.CacheControl ?? null,
    };
}

export function publicUrlFor(key: string): string | null {
    if (!currentConfig?.publicBaseUrl) return null;
    return `${currentConfig.publicBaseUrl}/${encodeURI(key)}`;
}

// Health check - try to list with maxKeys=1
export async function checkHealth(): Promise<{ ok: boolean; error?: string }> {
    if (!r2Client || !currentConfig) {
        return { ok: false, error: 'R2 not configured' };
    }

    try {
        await r2Client.send(
            new ListObjectsV2Command({
                Bucket: currentConfig.bucket,
                MaxKeys: 1,
            })
        );
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e.message || 'Connection failed' };
    }
}
