# r2upload

Cloudflare R2 upload service with a simple web UI. The browser uploads directly to R2 using short‑lived, server‑signed S3 URLs. No R2 keys are ever exposed to the client.

- Backend: Node.js + TypeScript + Express
- Presigned upload: direct PUT to R2 via S3 API
- Management APIs: list, delete, rename, batch
- Frontend: minimal console in `public/`

## Quick Start

1) Configure environment (do NOT commit secrets)

```
cp .env.example .env
# edit .env with your R2 account, token and bucket
```

2) Install and run (Node 18+)

```
npm install
npm run dev
# http://localhost:3000
```

Production build:

```
npm run build
npm start
```

Docker:

```
docker build -t r2upload .
docker run --env-file .env -p 3000:3000 r2upload
# or
docker compose up --build
```

## Configuration

Server reads credentials from environment variables (managed via .env locally, or Docker/K8s secrets in production). See `.env.example` for all options:

- `R2_ACCOUNT_ID`: Cloudflare account ID (omit if using full `R2_ENDPOINT`)
- `R2_ENDPOINT`: Full S3 endpoint, e.g. `https://<account>.r2.cloudflarestorage.com`
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: R2 API token with minimal permissions for the target bucket
- `R2_BUCKET`: Target bucket name
- `PUBLIC_BASE_URL` (optional): Public CDN/domain to compose share URLs (e.g. `https://img.example.com`)
- `UPLOAD_ENV` (optional): Namespace prefix in generated keys (default `dev`)
- `ALLOW_ORIGINS`: CORS allowed origins for API (comma‑separated) or `*` for any (use specific origins in prod)
- `KEY_STRATEGY`: `hash` (default) or `original`

Frontend has local, non‑sensitive settings stored in `localStorage` (open the “Settings” dialog in UI): API base URL override, public base URL override, default prefix, naming strategy, theme.

## Security Model

- Secrets stay server‑side: R2 credentials are only read on the server from environment variables. Never expose them in frontend code.
- Presigned uploads: The server issues a short‑lived signed URL (`PUT`) and the browser uploads directly to R2. Default expiry: 60s (see `src/r2.ts`).
- CORS: Configure your R2 bucket to allow your site/admin origins for `GET, HEAD, PUT, POST` and `x-amz-*` headers. Lock this down in production.
- API CORS: Set `ALLOW_ORIGINS` to explicit origins (not `*`) in production.
- Principle of least privilege: Create a token restricted to the exact bucket (and path, if possible) required for this app.

## API Endpoints

- `POST /api/sign-upload` → `{ filename, contentType, prefix?, strategy?, cacheControl? }` → `{ key, url, publicUrl }`
- `GET /api/objects?prefix=&maxKeys=&continuationToken=` → list objects
- `DELETE /api/objects/<key>` → delete object
- `POST /api/objects/rename` → `{ oldKey, newKey }`
- `POST /api/objects/batch` → `{ action: 'delete'|'move'|'copy', keys: string[], targetPrefix? }`
- `GET /api/objects/<key>/head` → object metadata

Notes
- Keys with slashes are supported via wildcard routes.
- `PUBLIC_BASE_URL` is used to generate shareable URLs; in dev, you may rely on r2.dev if public access is enabled.

## Object Key Format

Default (`hash` strategy): `{env}/{yyyy}/{mm}/{hash16}/{hash}.{ext}`

Set `strategy: 'original'` (or `KEY_STRATEGY=original`) with an optional `prefix` to match patterns like `img/{fileName}`.

## Deploying Securely (Public Repos)

- Never commit `.env` or any secrets. `.gitignore` excludes them; commit only `.env.example`.
- If a secret was committed accidentally:
  1) `git rm --cached .env` and rotate the leaked credentials in Cloudflare immediately
  2) Force‑rewrite history if needed (e.g. `git filter-repo` or the GitHub UI) and push again
- Use CI/CD secrets (e.g. GitHub Actions Secrets) and pass them as environment variables at runtime.
- Consider placing the API behind Cloudflare Access/WAF and restricting `ALLOW_ORIGINS`.

## Project Structure

- `src/config.ts`: Loads env + app config
- `src/r2.ts`: R2 S3 client and operations (sign, list, delete, copy)
- `src/server.ts`: Express app, routes, static UI
- `src/utils/keygen.ts`: Key generation helpers
- `public/`: Minimal frontend console
- `r2upload_plan.md`: Architecture notes and enhancements

## References
See `r2upload_plan.md` for architecture, CORS, caching, lifecycle rules, and optional enhancements (Workers Image Resizing, multipart upload, etc.).
