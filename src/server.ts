import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { z } from 'zod';
import { loadConfig } from './config';
import { createUploadUrl, deleteObject, headObject, listObjects, publicUrlFor, renameObject, copyObject } from './r2';
import { generateObjectKey } from './utils/keygen';

const cfg = loadConfig();
const app = express();

// CORS setup
if (cfg.allowOrigins === '*') {
  app.use(cors({ origin: true }));
} else {
  const allow = new Set(cfg.allowOrigins);
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      return cb(null, allow.has(origin));
    },
    credentials: false,
  }));
}

app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Sign upload URL
const SignUploadBody = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  prefix: z.string().optional(),
  cacheControl: z.string().optional(),
  strategy: z.enum(['hash', 'original']).optional(),
});

app.post('/api/sign-upload', async (req, res, next) => {
  try {
    const body = SignUploadBody.parse(req.body);
    const strategy = body.strategy || cfg.keyStrategy;

    const sanitize = (name: string) => name.replace(/[\\/\u0000-\u001f]/g, '_').replace(/\s+/g, '-');
    let key: string;
    if (strategy === 'original') {
      const base = sanitize(body.filename);
      const pfx = body.prefix?.replace(/\/$/, '') || '';
      key = pfx ? `${pfx}/${base}` : base;
    } else {
      const baseKey = generateObjectKey({ env: cfg.uploadEnv, filename: body.filename });
      key = body.prefix && body.prefix.trim()
        ? baseKey.replace(`${cfg.uploadEnv}/`, `${cfg.uploadEnv}/${body.prefix.replace(/\/$/, '')}/`)
        : baseKey;
    }

    const url = await createUploadUrl(key, body.contentType, body.cacheControl);
    res.json({ key, url, publicUrl: publicUrlFor(key) });
  } catch (err) {
    next(err);
  }
});

// List objects
app.get('/api/objects', async (req, res, next) => {
  try {
    const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : '';
    const maxKeys = req.query.maxKeys ? Math.min(1000, Math.max(1, parseInt(String(req.query.maxKeys), 10))) : 100;
    const continuationToken = typeof req.query.continuationToken === 'string' ? req.query.continuationToken : undefined;

    const out = await listObjects({ prefix, maxKeys, continuationToken });
    res.json({
      isTruncated: out.IsTruncated ?? false,
      nextContinuationToken: out.NextContinuationToken ?? null,
      keyCount: out.KeyCount ?? 0,
      contents: (out.Contents ?? []).map((o) => ({
        key: o.Key,
        size: o.Size,
        eTag: o.ETag,
        lastModified: o.LastModified,
        storageClass: o.StorageClass,
      })),
      prefix: out.Prefix ?? prefix,
    });
  } catch (err) {
    next(err);
  }
});

// Delete object: key may contain '/'
app.delete('/api/objects/*', async (req, res, next) => {
  try {
    const key = decodeURIComponent((req.params as any)[0]);
    await deleteObject(key);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Rename (copy + delete)
const RenameBody = z.object({ oldKey: z.string().min(1), newKey: z.string().min(1) });
app.post('/api/objects/rename', async (req, res, next) => {
  try {
    const { oldKey, newKey } = RenameBody.parse(req.body);
    await renameObject(oldKey, newKey);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Batch ops: delete or copy+delete (move)
const BatchBody = z.object({
  action: z.enum(['delete', 'move', 'copy']).default('delete'),
  keys: z.array(z.string().min(1)),
  targetPrefix: z.string().optional(), // for move/copy
});

app.post('/api/objects/batch', async (req, res, next) => {
  try {
    const { action, keys, targetPrefix } = BatchBody.parse(req.body);
    if (action === 'delete') {
      for (const k of keys) await deleteObject(k);
      return res.json({ ok: true, count: keys.length });
    }

    if (!targetPrefix) throw new Error('targetPrefix is required for move/copy');
    const moved: Array<{ from: string; to: string }> = [];
    for (const k of keys) {
      const parts = k.split('/');
      const file = parts.pop()!;
      const rest = parts.join('/');
      const to = `${targetPrefix.replace(/\/$/, '')}/${file}`;
      if (action === 'copy') {
        await copyObject(k, to); // copy only
      } else {
        await renameObject(k, to); // move
      }
      moved.push({ from: k, to });
    }
    res.json({ ok: true, items: moved });
  } catch (err) {
    next(err);
  }
});

// Head object metadata
app.get('/api/objects/*/head', async (req, res, next) => {
  try {
    const key = decodeURIComponent((req.params as any)[0]);
    const h = await headObject(key);
    res.json({
      key,
      contentLength: h.ContentLength ?? null,
      eTag: h.ETag ?? null,
      contentType: h.ContentType ?? null,
      lastModified: h.LastModified ?? null,
      metadata: h.Metadata ?? {},
      cacheControl: h.CacheControl ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// Static frontend demo
app.use('/', express.static('public', { extensions: ['html'] }));

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (err.$metadata && err.$metadata.httpStatusCode) || err.status || 500;
  const message = err.name ? `${err.name}: ${err.message || 'Server error'}` : (err.message || 'Server error');
  res.status(status).json({ error: message, details: err?.code || undefined });
});

app.listen(cfg.port, () => {
  // eslint-disable-next-line no-console
  console.log(`r2upload listening on http://localhost:${cfg.port}`);
});
