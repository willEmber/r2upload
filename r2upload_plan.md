下面是一份**可直接落地**的开发计划，用 Cloudflare R2 作为图床（对象存储）并在本地开发一套上传与管理应用。计划涵盖架构、Cloudflare 端配置、后端/前端实现细节、权限安全、缓存与费用、测试验收与里程碑等，并附关键配置与示例代码（Node.js/TypeScript 为例）。

---

## 0) 背景与目标

* **目标**：实现一个支持**浏览器直传**到 R2、带后台管理（列出/删除/复制重命名/批量操作/元数据）的图床系统，具备自定义域名访问、CDN 缓存、生命周期清理与基础的访问控制。
* **关键选择**

  * 存储：Cloudflare **R2**（S3 兼容 API，零出口费）。([Cloudflare][1])
  * 访问方式：**自定义域名**（生产），**r2.dev**（开发/非生产）。([Cloudflare Docs][2])
  * 上传路径：**浏览器直传 + 后端预签名 URL**（减少服务器带宽、支持大文件/断点）。预签名 URL 是 S3/R2 通用做法。([Cloudflare Docs][3], [AWS Documentation][4])
  * SDK：基于 **AWS SDK v3（S3Client）** 直连 R2 的 **S3 兼容端点**。端点格式 `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`，region 使用 `auto`（兼容某些工具时也可用空或 `us-east-1`）。([Cloudflare Docs][5])

---

## 1) 系统架构

**推荐参考架构（生产）**

```
[浏览器] --直传(预签名URL)--> [R2 Bucket]
    |                               ^
    | 列表/删除/改名/生成URL        | 自定义域(HTTPS) + Cloudflare CDN缓存
    v                               |
[后端管理API (Node.js/TS)] ---------+
    |
    +--> 数据库(meta：文件key/尺寸/类型/哈希/标签/owner/创建时间...)
```

* **可选增强**：在自定义域后方增加 **Cloudflare Workers + Image Resizing**，按 URL 参数进行缩放/裁剪、并在边缘缓存，适合生成多规格缩略图。官方参考架构给出了 R2 + Image Resizing 的端到端流程。([Cloudflare Docs][6])

---

## 2) Cloudflare R2 端配置（一步步）

1. **创建 R2 Bucket**
   在 Cloudflare Dashboard 或用 Wrangler 创建。([Cloudflare Docs][7])

2. **生成最小权限的 R2 API Token**（仅限对应 bucket 的读/写所需操作）。SDK 连接时配置端点 `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`。 ([Cloudflare Docs][5])

3. **开启公共访问**

   * 开发/临时：启用 **r2.dev** 公共访问（不建议生产）。
   * 生产：给 bucket 绑定**自定义域名**，随后可以使用 WAF/Zero Trust/缓存规则等能力。([Cloudflare Docs][2])
     绑定自定义域需设置 DNS + Origin/Rewrite 规则（官方教程与模版可用）。([Cloudflare Docs][8], [GitHub][9])

4. **配置 CORS**（直传必需）
   在 Bucket 的 Settings > **CORS Policy** 添加 JSON 策略，允许你的前端域名对 `PUT/POST/GET/HEAD` 发起跨域请求，允许 `Content-Type`, `x-amz-*` 等头。官方操作路径与说明见文档。([Cloudflare Docs][10])

5. **开启并调优缓存**
   R2 自定义域名可走 Cloudflare CDN。Cloudflare 默认**尊重源站 Cache-Control**，你可以在对象上传时设置 `Cache-Control`，或通过 Cache Rules/Smart Tiered Cache 优化。([Cloudflare Docs][11])

6. **对象生命周期（自动清理）**
   在 Bucket 配置 Lifecycle 规则，自动删除临时文件（例如 7/30/90 天后），或转低频存储（如开启）。([Cloudflare Docs][12], [The Cloudflare Blog][13])

7. **（可选）访问保护**

   * 管理端：用 **Cloudflare Zero Trust Access** 限制内部访问。
   * 资源域：可对自定义域设置 WAF/Rate Limit/Access 等。([Cloudflare Docs][14])

---

## 3) 本地开发环境与技术栈

* **后端**：Node.js 18+/TypeScript、Express/Nest 任一；使用 **@aws-sdk/client-s3** + **@aws-sdk/s3-request-presigner** 连接 R2 的 S3 端点。预签名 URL 生成方式与 S3 相同。([Amazon Web Services, Inc.][15], [npm][16])
* **前端**：任意（React/Vue/Svelte），直传使用 `fetch`/XHR，将文件 PUT/POST 到预签名 URL。
* **数据库（可选）**：本地 SQLite，生产 PostgreSQL；存文件元数据与业务标签。
* **环境变量**：`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `PUBLIC_BASE_URL`（自定义域）等。

**S3 客户端与预签名示例（Node.js / TS）**

```ts
// r2.ts
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const accountId = process.env.R2_ACCOUNT_ID!;
export const r2 = new S3Client({
  region: 'auto', // R2 的 S3 兼容 region
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`, // R2 S3 端点
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// 生成直传 URL（PUT）
export async function createUploadUrl(key: string, contentType: string) {
  const cmd = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    ContentType: contentType,
    // 可设置 Cache-Control / Metadata 等
    CacheControl: 'public, max-age=31536000, immutable',
  });
  return getSignedUrl(r2, cmd, { expiresIn: 60 }); // 60 秒有效
}

// 列表
export async function list(prefix = '', maxKeys = 100) {
  return r2.send(new ListObjectsV2Command({
    Bucket: process.env.R2_BUCKET!,
    Prefix: prefix,
    MaxKeys: maxKeys,
  }));
}

// 删除
export async function remove(key: string) {
  return r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }));
}

// “重命名”= Copy + Delete
export async function rename(oldKey: string, newKey: string) {
  await r2.send(new CopyObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: newKey,
    CopySource: `/${process.env.R2_BUCKET!}/${encodeURIComponent(oldKey)}`,
    MetadataDirective: 'COPY',
  }));
  await remove(oldKey);
}
```

> 预签名 URL 的概念与用法可参考 Cloudflare R2 文档与 AWS 的示例文档。([Cloudflare Docs][3], [AWS Documentation][4])

**后端 API（示例）**

* `POST /api/sign-upload`：入参 `filename`, `contentType`；返回预签名 URL + 建议的最终公共访问 URL（自定义域）。
* `GET /api/objects?prefix=&page=`：分页列出对象。
* `DELETE /api/objects/:key`：删除对象。
* `POST /api/objects/rename`：`oldKey`, `newKey`。
* `POST /api/objects/batch`：批量删除/复制移动。
* `GET /api/objects/:key/head`：返回对象元信息（Content-Length、ETag、Content-Type等）。

**前端直传（示意）**

```ts
const { url } = await fetch('/api/sign-upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ filename, contentType: file.type }),
}).then(r => r.json());

await fetch(url, { // 直传到 R2 S3 端点
  method: 'PUT',
  headers: { 'Content-Type': file.type },
  body: file,
});
```

---

## 4) R2 CORS 与安全要点

**典型 CORS 策略（放到 R2 Bucket Settings > CORS Policy）**
（将 `https://your-admin.example.com` 和 `https://your-site.example.com` 改成你的域名）

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://your-admin.example.com", "https://your-site.example.com"],
      "AllowedMethods": ["GET", "HEAD", "PUT", "POST"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "x-amz-request-id"],
      "MaxAgeSeconds": 300
    }
  ]
}
```

> 配置入口与思路参考 R2 官方 CORS 文档。([Cloudflare Docs][10])

**安全建议**

* 预签名 URL **短时效**（如 60–120s）且仅限单对象单操作；后端校验 MIME/尺寸等。([Cloudflare Docs][3])
* 管理面板走 **Zero Trust Access**（SSO/MFA），R2 自定义域支持在 Cloudflare 侧加 WAF/速率限制。([Cloudflare Docs][14])
* **不要**在前端暴露 `AccessKey/Secret`；只暴露预签名 URL。
* 元数据校验/病毒扫描（可在上传后异步队列处理）；去 EXIF（隐私）。

---

## 5) 缓存与加速

* **对象级缓存头**：上传时设置 `Cache-Control: public, max-age=31536000, immutable`（对带哈希文件名的静态图尤佳）。Cloudflare 默认尊重源站缓存头；必要时用 Cache Rules 调整。([Cloudflare Docs][11])
* **CDN 侧**：自定义域 + 开启 **Smart Tiered Cache**（让上游层靠近 R2）。([Cloudflare Docs][17])
* **失效策略**：采用**文件名版本化**（内容变更改 key），避免频繁清缓存。
* **（可选）边缘缩放**：Cloudflare **Image Resizing + R2**，按 URL 参数生成多尺寸并缓存。([Cloudflare Docs][6])

---

## 6) 大文件与断点续传

* 使用 **Multipart Upload**（S3 标准流程：Initiate → UploadPart（并发/分片）→ Complete；失败可重传指定分片；未完成需 Abort）。可直接套 AWS SDK v3 示例与流程。([AWS Documentation][18])
* 在 R2 的 Lifecycle 规则中**自动清理未完成的分段上传**与临时对象。([The Cloudflare Blog][13])

---

## 7) 数据模型与命名

* **对象 key 设计**：`{env}/{yyyy}/{mm}/{hash16}/{hash}.{ext}`，目录只是 key 前缀（R2/S3 为扁平命名空间）。([Cloudflare Docs][19])
* **数据库表（assets）**：`id`, `bucket`, `key`, `url`, `content_type`, `size`, `width`, `height`, `etag`, `checksum`, `tags(jsonb)`, `owner`, `created_at`, `updated_at`。
* **“重命名/移动”**：S3 语义需 `CopyObject` + `DeleteObject`。

---

## 8) 费用与配额（粗略）

* R2 **零出口费**（对外下载不计 egress），存储/请求按量计费：有免费层（10GB 存储/月；100 万 Class A、1,000 万 Class B 请求的价格参考见页）。以官网为准。([Cloudflare][1])

---

## 9) 里程碑与交付

**第 1 周：R2 与本地环境打通**

* 完成：Bucket、Token、CORS、r2.dev 验证；后端项目脚手架；预签名上传打通；对象列表/删除 API。
* 验收：本地页面可直传并在 r2.dev 访问，能在管理页看到对象列表并删除。

**第 2 周：自定义域与缓存**

* 完成：自定义域绑定 + CDN 缓存规则；上传时写入合适的 `Cache-Control`；版本化命名。
* 验收：自定义域下访问图片，命中缓存；修改内容后新 key 可立即生效。

**第 3 周：管理功能完善**

* 完成：批量操作、复制/重命名、标签与搜索、元数据面板；生命周期规则上线（清理 tmp/未完成分片）。
* 验收：批量删除/移动稳定可用；临时目录定期清理；操作有审计日志。

**第 4 周：可选增强**

* （可选）Workers + Image Resizing 管线，按 `?w=...&q=...` 生成缩略图并缓存。([Cloudflare Docs][6])
* （可选）接入 Zero Trust Access 保护管理端与特定路径。([Cloudflare Docs][14])

---

## 10) 测试清单（节选）

* 直传：小/大文件（>100MB）成功率、超时/中断续传、Content-Type 正确。
* CORS：OPTIONS 预检、PUT/POST/GET/HEAD 正常。([Cloudflare Docs][10])
* 列表/分页：前缀过滤与分页性能。
* 缓存：命中率、二次访问速度、`Cache-Control` 是否被尊重。([Cloudflare Docs][11])
* 生命周期：临时目录/未完成分片是否自动清除。([Cloudflare Docs][12])
* 安全：预签名过期后不可用；WAF/速率限制触发逻辑；Access 保护生效。([Cloudflare Docs][14])

---

## 11) 关键配置与“抄作业”片段

**.env 示例**

```
R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=************************
R2_SECRET_ACCESS_KEY=************************
R2_BUCKET=img-bucket
PUBLIC_BASE_URL=https://img.example.com
```

**前端上传限制**

* 单文件大小上限（前端校验）
* 允许 MIME（image/png, image/jpeg, image/webp, image/avif, image/gif）
* 黑名单后缀与双扩展名检查（`xxx.jpg.exe`）

**服务端校验**

* 仅允许受信来源请求预签名（CSRF/Origin 检查）
* 预签名 URL 1 次性+短时效（如 60s）([Cloudflare Docs][3])

---

## 12) 进阶：边缘缩放与响应式图片（可选）

* 通过 **Cloudflare Image Resizing + R2**，将 `https://img.example.com/cdn-cgi/image/width=800,quality=85/<bucket-path>` 这类 URL 规则应用到自定义域，按需缩放并缓存（官方参考架构）。([Cloudflare Docs][6])
* 在上传时只存原图；首请求触发生成并缓存变体，降低存储与处理成本。

---

## 13) 风险与对策

* **公共桶误配置风险**：生产请使用**自定义域 + WAF/ACL**，不要长期依赖 r2.dev；敏感资源使用 Access 或服务端签名下载。([Cloudflare Docs][2])
* **缓存难以命中或难以失效**：统一**文件名哈希**策略 + 长 Cache-Control；变更即换 key。([Cloudflare Docs][11])
* **大文件上传失败**：启用 Multipart Upload，重传单分片；并设置生命周期自动清理未完成上传。([AWS Documentation][18], [The Cloudflare Blog][13])

---

### 参考文档（核心）

* R2 **S3 兼容 API**、region 与端点、预签名 URLs：Cloudflare R2 文档。([Cloudflare Docs][20])
* **公共桶与自定义域/r2.dev**、接入安全与缓存说明：Cloudflare R2 公共桶文档。([Cloudflare Docs][2])
* **CORS 配置**：R2 CORS 文档。([Cloudflare Docs][10])
* **对象生命周期**：R2 Lifecycle 文档与公告。([Cloudflare Docs][12], [The Cloudflare Blog][13])
* **CDN 缓存行为**与 R2 结合：Cloudflare Cache 默认行为与 R2 缓存接入。([Cloudflare Docs][11])
* **费用与零出口费**：R2 产品页。([Cloudflare][1])
* **Multipart Upload 流程**：AWS S3 文档（R2 兼容该流程）。([AWS Documentation][18])
* **R2 + Image Resizing 架构**（可选）：Cloudflare 参考架构。([Cloudflare Docs][6])

---

如果你愿意，我可以把以上计划中的\*\*项目骨架（后端 API + 前端直传 demo + Docker Compose + 环境模板）\*\*直接按上述规范生成出来，包含可运行的最小实现与脚本。

[1]: https://www.cloudflare.com/developer-platform/products/r2/?utm_source=chatgpt.com "Cloudflare R2 | Zero Egress Fee Object Storage"
[2]: https://developers.cloudflare.com/r2/buckets/public-buckets/?utm_source=chatgpt.com "Public buckets · Cloudflare R2 docs"
[3]: https://developers.cloudflare.com/r2/api/s3/presigned-urls/?utm_source=chatgpt.com "Presigned URLs · Cloudflare R2 docs"
[4]: https://docs.aws.amazon.com/AmazonS3/latest/API/s3_example_s3_Scenario_PresignedUrl_section.html?utm_source=chatgpt.com "Create a presigned URL for Amazon S3 using an AWS SDK"
[5]: https://developers.cloudflare.com/r2/api/tokens/?utm_source=chatgpt.com "Authentication · Cloudflare R2 docs"
[6]: https://developers.cloudflare.com/reference-architecture/diagrams/content-delivery/optimizing-image-delivery-with-cloudflare-image-resizing-and-r2/?utm_source=chatgpt.com "Optimizing image delivery with Cloudflare image resizing and R2"
[7]: https://developers.cloudflare.com/r2/buckets/create-buckets/?utm_source=chatgpt.com "Create new buckets · Cloudflare R2 docs"
[8]: https://developers.cloudflare.com/rules/origin-rules/tutorials/point-to-r2-bucket-with-custom-domain/?utm_source=chatgpt.com "Point to R2 bucket with a custom domain - Cloudflare Docs"
[9]: https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/rules/origin-rules/tutorials/point-to-r2-bucket-with-custom-domain.mdx?utm_source=chatgpt.com "point-to-r2-bucket-with-custom-domain.mdx - GitHub"
[10]: https://developers.cloudflare.com/r2/buckets/cors/?utm_source=chatgpt.com "Configure CORS · Cloudflare R2 docs"
[11]: https://developers.cloudflare.com/cache/concepts/default-cache-behavior/?utm_source=chatgpt.com "Default Cache Behavior · Cloudflare Cache (CDN) docs"
[12]: https://developers.cloudflare.com/r2/buckets/object-lifecycles/?utm_source=chatgpt.com "Object lifecycles · Cloudflare R2 docs"
[13]: https://blog.cloudflare.com/introducing-object-lifecycle-management-for-cloudflare-r2/?utm_source=chatgpt.com "Introducing Object Lifecycle Management for Cloudflare R2"
[14]: https://developers.cloudflare.com/r2/tutorials/cloudflare-access/?utm_source=chatgpt.com "Protect an R2 Bucket with Cloudflare Access"
[15]: https://aws.amazon.com/blogs/developer/generate-presigned-url-modular-aws-sdk-javascript/?utm_source=chatgpt.com "Generate a presigned URL in modular AWS SDK for JavaScript"
[16]: https://www.npmjs.com/package/%40aws-sdk/s3-request-presigner?utm_source=chatgpt.com "@aws-sdk/s3-request-presigner - npm"
[17]: https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/?utm_source=chatgpt.com "Enable cache in an R2 bucket · Cloudflare Cache (CDN) docs"
[18]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-upload-object.html?utm_source=chatgpt.com "Uploading an object using multipart upload - docs.aws.amazon.com"
[19]: https://developers.cloudflare.com/r2/buckets/?utm_source=chatgpt.com "Buckets · Cloudflare R2 docs"
[20]: https://developers.cloudflare.com/r2/api/s3/api/?utm_source=chatgpt.com "S3 API compatibility · Cloudflare R2 docs"
