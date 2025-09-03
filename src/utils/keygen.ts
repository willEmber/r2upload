import crypto from 'crypto';

function toHex(buf: Buffer, len = 32) {
  return buf.toString('hex').slice(0, len);
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

// Generates key like: {env}/{yyyy}/{mm}/{hash16}/{hash}.{ext}
export function generateObjectKey(params: {
  env: string;
  filename: string;
  now?: Date;
  contentHash?: string; // optional content hash if available
}): string {
  const { env, filename } = params;
  const now = params.now ?? new Date();

  const yyyy = now.getUTCFullYear();
  const mm = pad2(now.getUTCMonth() + 1);

  const ext = (() => {
    const dot = filename.lastIndexOf('.');
    if (dot === -1 || dot === filename.length - 1) return '';
    return filename.slice(dot + 1).toLowerCase();
  })();

  const random = crypto.randomBytes(32);
  const base = `${filename}\n${now.toISOString()}\n${toHex(random, 64)}`;
  const sha256 = crypto.createHash('sha256').update(base).digest();
  const hash = params.contentHash ?? toHex(sha256, 40);
  const prefix = toHex(sha256, 16);

  const baseName = ext ? `${hash}.${ext}` : hash;
  return `${env}/${yyyy}/${mm}/${prefix}/${baseName}`;
}

