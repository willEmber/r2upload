# R2 Upload - 桌面应用构建指南

## 方案一：Tauri（推荐）

Tauri 是一个轻量级的桌面应用框架，生成的应用体积小（约 5-10MB）。

### 前置要求

1. **安装 Rust**
   ```powershell
   # 下载并运行 Rust 安装程序
   winget install Rustlang.Rust.MSVC
   # 或访问 https://rustup.rs/ 下载安装
   ```

2. **安装 Visual Studio Build Tools**
   - 下载 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - 安装时选择 "C++ 桌面开发"

3. **安装 WebView2**
   - Windows 10/11 通常已预装
   - 如未安装，访问 [WebView2 下载页](https://developer.microsoft.com/microsoft-edge/webview2/)

### 构建步骤

```powershell
# 1. 进入项目目录
cd d:\workspace\r2upload

# 2. 安装依赖
npm install

# 3. 开发模式运行（需要先启动后端服务器）
npm run dev          # 终端1：启动后端
npm run tauri:dev    # 终端2：启动 Tauri 开发模式

# 4. 构建生产版本
npm run tauri:build
```

构建完成后，安装包位于：
- `src-tauri/target/release/bundle/msi/` - MSI 安装包
- `src-tauri/target/release/bundle/nsis/` - NSIS 安装包

---

## 方案二：Electron（备选）

如果需要更成熟的生态或跨平台支持，可以使用 Electron。

### 安装

```powershell
npm install --save-dev electron electron-builder
```

### 创建 Electron 主进程

创建 `electron/main.js`：

```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../public/icon.ico'),
    title: 'R2 Upload Console'
  });

  // 等待服务器启动后加载
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 2000);
}

function startServer() {
  serverProcess = spawn('node', ['dist/server.js'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
}

app.whenReady().then(() => {
  startServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
```

### package.json 添加脚本

```json
{
  "main": "electron/main.js",
  "scripts": {
    "electron:dev": "electron .",
    "electron:build": "electron-builder"
  },
  "build": {
    "appId": "com.r2upload.app",
    "productName": "R2 Upload",
    "win": {
      "target": ["nsis", "portable"]
    }
  }
}
```

---

## 方案三：打包为单文件可执行程序

使用 `pkg` 将 Node.js 应用打包为独立可执行文件：

```powershell
# 安装 pkg
npm install -g pkg

# 构建
npm run build
pkg dist/server.js --targets node18-win-x64 --output r2upload.exe
```

然后用户双击运行 `r2upload.exe`，在浏览器访问 `http://localhost:3000`。

---

## 架构说明

由于本应用需要后端服务（与 R2 API 通信），桌面应用有两种架构：

### 架构 A：内嵌后端（推荐）
```
[Tauri/Electron 窗口]
       ↓
[内嵌 Node.js 后端服务器]
       ↓
[Cloudflare R2 API]
```

### 架构 B：纯前端 + Tauri Rust 后端
将 Node.js 后端逻辑用 Rust 重写，直接在 Tauri 中调用。这样可以生成完全独立的单文件应用。

---

## 常见问题

### Q: Tauri 构建失败？
确保已安装：
- Rust (rustc >= 1.70)
- Visual Studio Build Tools (C++ 桌面开发)
- WebView2 Runtime

### Q: 应用启动后白屏？
需要先启动后端服务器，或修改应用启动逻辑自动启动内嵌服务器。

### Q: 如何减小包体积？
- Tauri 已经很小（~5MB）
- Electron 可使用 `electron-builder` 的 ASAR 打包
- 移除不必要的 `node_modules`
