import dotenv from 'dotenv';

dotenv.config();

export type AppConfig = {
  accountId?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl?: string; // e.g. https://img.example.com
  uploadEnv: string; // e.g. dev/stage/prod
  port: number;
  allowOrigins: string[] | '*';
  endpoint: string; // full https endpoint for R2 S3
  keyStrategy: 'hash' | 'original';
};

function getEnv(name: string, required = true): string | undefined {
  const v = process.env[name];
  if (required && (!v || v.trim() === '')) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export function loadConfig(): AppConfig {
  const endpointEnv = getEnv('R2_ENDPOINT', false);
  const accountId = endpointEnv ? undefined : getEnv('R2_ACCOUNT_ID')!;
  const accessKeyId = getEnv('R2_ACCESS_KEY_ID')!;
  const secretAccessKey = getEnv('R2_SECRET_ACCESS_KEY')!;
  const bucket = getEnv('R2_BUCKET')!;
  const publicBaseUrl = getEnv('PUBLIC_BASE_URL', false)?.replace(/\/$/, '');
  const uploadEnv = getEnv('UPLOAD_ENV', false) || 'dev';

  const port = parseInt(getEnv('PORT', false) || '3000', 10);

  const allowOriginsRaw = getEnv('ALLOW_ORIGINS', false) || '*';
  const allowOrigins = allowOriginsRaw === '*'
    ? '*'
    : allowOriginsRaw.split(',').map((s) => s.trim()).filter(Boolean);

  const endpoint = endpointEnv || `https://${accountId}.r2.cloudflarestorage.com`;
  const keyStrategy = (getEnv('KEY_STRATEGY', false) || 'hash') as 'hash' | 'original';

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
    uploadEnv,
    port,
    allowOrigins,
    endpoint,
    keyStrategy,
  };
}
