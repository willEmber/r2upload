# R2 Upload

[English](README_EN.md) | 中文

Cloudflare R2 文件上传管理工具，提供 **网页端** 和 **桌面 GUI 客户端** 两种使用方式。

-  **网页端**：通过后端服务器代理，浏览器直接上传到 R2（使用预签名 URL）
- 🖥️ **桌面端**：独立 GUI 应用，无需后端服务器，直接与 R2 通信

![R2 Upload](r2upload.png)

## 功能特性

-  文件上传（支持拖拽、多文件）
-  文件列表浏览和分页
-  批量删除文件
-  复制公开链接
-  自定义前缀路径
-  Hash / 原始文件名命名策略
-  深色/浅色主题切换
-  Cloudflare 风格 UI

---

##  桌面 GUI 客户端

### 下载安装

从 [Releases](https://github.com/willEmber/r2upload/releases) 下载最新版本：

- **Windows**: `R2 Upload_x.x.x_x64-setup.exe` (NSIS 安装程序) 或 `R2 Upload_x.x.x_x64_en-US.msi`
- 双击运行安装程序，按提示完成安装

### 配置使用

1. 启动应用后，点击右上角 **Settings** 按钮
2. 填写 R2 存储配置：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| R2 Endpoint | Cloudflare R2 S3 API 端点 | `https://xxxx.r2.cloudflarestorage.com` |
| Access Key ID | R2 API 访问密钥 ID | `3bc38007e210ab2ecc040ff59874b47c` |
| Secret Access Key | R2 API 访问密钥 | `e6f361dd9945...` |
| 存储桶名称 | R2 Bucket 名称 | `my-bucket` |
| 公开访问基础 URL | 可选，用于生成公开链接 | `https://res.example.com` |

3. 点击 **保存设置**
4. 现在可以上传和管理文件了！

### 获取 R2 凭证

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **R2 Object Storage**  **Overview**
3. 点击右侧 **Manage R2 API Tokens**
4. 创建新的 API Token，获取：
   - **Access Key ID**
   - **Secret Access Key**
5. 在 R2 Bucket 设置页面找到 **S3 API** 端点 URL

### 从源码构建

需要安装 [Rust](https://rustup.rs/) 和 [Node.js 18+](https://nodejs.org/)：

```ash
# 安装依赖
npm install

# 构建桌面应用
npm run tauri:build

# 输出位置
# src-tauri/target/release/r2-upload.exe
# src-tauri/target/release/bundle/nsis/R2 Upload_x.x.x_x64-setup.exe
```

---

##  网页端

网页端需要部署后端服务器，R2 凭证存储在服务器环境变量中，更安全。

### 快速开始

```ash
# 1. 克隆仓库
git clone https://github.com/willEmber/r2upload.git
cd r2upload

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填写 R2 凭证

# 3. 安装依赖并启动
npm install
npm run dev

# 4. 打开浏览器访问
# http://localhost:3000
```

### 环境变量配置

编辑 `.env` 文件：

```dotenv
# R2 存储配置（必填）
R2_ENDPOINT=https://xxxx.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET=your-bucket-name

# 可选配置
PUBLIC_BASE_URL=https://res.example.com  # 公开访问 URL
UPLOAD_ENV=dev                            # 上传路径前缀
PORT=3000                                 # 服务端口
ALLOW_ORIGINS=*                           # CORS 允许的源
KEY_STRATEGY=hash                         # 命名策略: hash 或 original
```

### 生产部署

**直接部署：**

```ash
npm run build
npm start
```

**Docker 部署：**

```ash
# 构建镜像
docker build -t r2upload .

# 运行容器
docker run --env-file .env -p 3000:3000 r2upload

# 或使用 docker-compose
docker compose up --build
```

### API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/sign-upload` | 获取预签名上传 URL |
| GET | `/api/objects` | 列出对象 |
| DELETE | `/api/objects/<key>` | 删除对象 |
| POST | `/api/objects/rename` | 重命名对象 |
| POST | `/api/objects/batch` | 批量操作 |
| GET | `/api/objects/<key>/head` | 获取对象元数据 |
| GET | `/api/health` | 健康检查 |

---

## 安全注意事项

### 桌面端

- R2 凭证保存在本地 `localStorage`，仅在本机使用
- 不要在公共电脑上保存凭证
- 建议为桌面端创建仅限特定 Bucket 的 API Token

### 网页端

- **永远不要提交 `.env` 文件**，已在 `.gitignore` 中排除
- 生产环境使用具体的 `ALLOW_ORIGINS` 而不是 `*`
- 使用最小权限原则创建 R2 API Token
- 考虑添加 Cloudflare Access/WAF 保护

### 如果意外泄露了凭证

1. 立即在 Cloudflare Dashboard 撤销/轮换 API Token
2. 检查 R2 Bucket 是否有异常访问
3. 如果已提交到 Git，使用 `git filter-repo` 清理历史

---

## 项目结构

```	ext
r2upload/
 public/                 # 前端静态文件
    index.html         # 网页版入口
    desktop.html       # 桌面版入口
    app.js             # 网页版 JS
    app-standalone.js  # 桌面版 JS
    style.css          # 样式
 src/                    # 后端源码
    server.ts          # Express 服务器
    r2.ts              # R2 操作封装
    config.ts          # 配置加载
    browser/           # 浏览器端 R2 客户端
    utils/             # 工具函数
 src-tauri/             # Tauri 桌面应用
    src/               # Rust 源码
    icons/             # 应用图标
    tauri.conf.json    # Tauri 配置
 scripts/               # 构建脚本
 Dockerfile             # Docker 构建
 docker-compose.yml     # Docker Compose
```

---

## 技术栈

- **后端**: Node.js + TypeScript + Express
- **前端**: Vanilla JS + CSS (Cloudflare 风格)
- **桌面端**: Tauri 2.x + Rust
- **存储**: Cloudflare R2 (S3 兼容 API)
- **SDK**: AWS SDK v3 (@aws-sdk/client-s3)

---

## License

MIT