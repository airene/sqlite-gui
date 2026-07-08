# SQLite GUI

一个用 **Deno + Vue 3 + Vite** 写的极简 SQLite 浏览器桌面应用，可打包成单个 macOS 可执行文件。

- 顶部**原生 macOS 菜单栏**：文件 → 打开…（⌘O）/ 打开最近使用
- 记住**最近打开的文件**（持久化，跨启动保留）
- 打开任意 SQLite3 数据库文件（原生 macOS 文件对话框）
- 左侧列出所有表 / 视图（含行数），右侧查看选中表的数据
- 服务端分页（每页 25 / 50 / 100 / 200 行可选）
- 界面只保留「当前打开哪个文件」的指示，打开操作走菜单栏
- **只读**打开，不改动你的数据文件
- 打包为 macOS 应用：`.app`（可双击、有图标）+ `.dmg`（拖拽安装）

## 架构

```
原生窗口 (webview, 用 macOS 内置 WebKit)   ← 主线程，webview.run() 阻塞
        │  navigate → http://127.0.0.1:<随机端口>
        ▼
本地 HTTP 服务 (Deno.serve)                ← 运行在 Web Worker（独立事件循环）
        │  /            → 内嵌的前端单文件 (Vue 编译产物)
        │  /api/open    → 弹出原生文件对话框 (osascript) 并打开数据库
        │  /api/state   → 当前文件 + 表列表
        │  /api/rows    → 某表的一页数据
        ▼
node:sqlite (Deno 内置，只读)              ← 无需额外原生库，随可执行文件一起打包
```

为什么服务放在 Worker：`webview.run()` 会阻塞主线程的事件循环直到窗口关闭；把
HTTP 服务放到独立 Worker，WKWebView 通过 TCP 访问它，不受主线程阻塞影响。

## 环境要求

- [Deno](https://deno.com) 2.x（已在 2.9.1 上验证）
- [Node.js](https://nodejs.org) + npm —— 仅用于构建前端（Vite）
- macOS（Apple Silicon / Intel）

## 快速开始

```bash
# 1. 安装前端依赖（首次）
deno task install

# 2. 打包成 macOS 应用（.app + .dmg）
deno task bundle
#   产出:
#   release/SQLite GUI.app   —— 可双击、有图标、可拖进「应用程序」
#   release/SQLite-GUI.dmg   —— 拖拽安装的磁盘镜像（约 31 MB）
```

双击 `SQLite GUI.app` 启动，然后点窗口里的「打开数据库…」选择文件即可。

如果只想要一个裸可执行文件（命令行形态，无图标/不可双击）：

```bash
deno task compile          # 产出 ./sqlite-gui （约 66 MB）
./sqlite-gui                       # 或 ./sqlite-gui path/to/your.db
```

开发时直接开窗口、不打包：

```bash
deno task start            # 构建前端 + 打开原生窗口
```

> **首次启动**会自动下载一个很小的 webview 原生库（几百 KB，缓存到 Deno cache），
> 之后即可离线运行。

## 关于签名与 Gatekeeper

`.app` 使用 **ad-hoc 签名**（没有 Apple 开发者账号）：

- **本机构建、本机运行**：不会被 Gatekeeper 拦截，双击即开。
- **把 `.dmg` 发给别人 / 从网上下载**：文件会带上 quarantine 标记，首次打开需
  右键 →「打开」，或执行 `xattr -dr com.apple.quarantine "SQLite GUI.app"`。
- 要让别人下载也完全无提示，需要 Apple Developer ID 签名 + 公证（notarization）。

## 菜单与最近文件

- 顶部菜单栏由 [server/menu.js](server/menu.js) 通过 Deno FFI 调用 Objective-C
  运行时（`NSMenu`/`NSMenuItem`）构建 —— webview 库本身不提供菜单 API。
- 菜单点击通过 `webview.eval(...)` 回到网页里复用既有的打开流程；网页则通过
  `webview.bind("syncRecentMenu", …)` 把最近列表推给原生菜单。
- 最近文件由 [server/recent.js](server/recent.js) 持久化到
  `~/Library/Application Support/SQLite GUI/recent.json`（最多 10 条，自动去重、
  过滤掉已不存在的文件）。
- 在浏览器里跑（开发模式）没有原生菜单，此时界面会保留一个「打开数据库…」按钮兜底。

## 开发模式（热更新）

```bash
deno task install          # 首次
deno task dev              # 启动 API 服务 + Vite (HMR)，然后打开 http://localhost:5173
```

Vite 会把 `/api/*` 代理到本地 Deno 服务（见 [web/vite.config.js](web/vite.config.js)）。
开发时在浏览器里调试，前端代码热更新。

## 只读与 WAL 说明

数据库以**只读**方式打开，`.sqlite3` 文件本身的内容不会被修改。

如果数据库是 WAL 模式，SQLite 在读取时会生成标准的 `-wal` / `-shm` 临时文件
（`sqlite3` 命令行和所有 SQLite 工具都是这样）。本应用会记录哪些临时文件是自己
创建的，并在关闭 / 切换数据库时把空的临时文件删除，尽量让目录保持原样。

## 项目结构

```
sqlite-gui/
├─ deno.json              # Deno 任务与依赖
├─ server/                # 后端（Deno，纯 JS）
│  ├─ main.js             #   入口：起 Worker + 打开 webview 窗口（compile 目标）
│  ├─ worker.js           #   Worker：在独立线程跑 HTTP 服务
│  ├─ serve.js            #   Deno.serve 封装
│  ├─ handlers.js         #   路由：静态页面 + /api/*
│  ├─ db.js               #   node:sqlite 只读封装 + 分页
│  ├─ dialog.js           #   osascript 原生文件对话框
│  ├─ menu.js             #   原生菜单栏（ObjC 运行时 via FFI）
│  ├─ recent.js           #   最近文件历史（持久化）
│  └─ embedded.js         #   构建产物（前端单文件，自动生成）
├─ web/                   # 前端（Vue 3 + Vite）
│  ├─ index.html
│  ├─ vite.config.js
│  ├─ package.json
│  └─ src/
│     ├─ App.vue
│     ├─ api.js
│     ├─ style.css
│     └─ components/{TableList,DataView}.vue
├─ scripts/
│  ├─ dev.js              # 开发启动器（API + Vite）
│  ├─ embed.js            # 把 dist/index.html 嵌进 server/embedded.js
│  └─ bundle.js           # 打包成 .app / .dmg
├─ build/
│  ├─ icon.svg            # 应用图标源文件
│  └─ icon.icns           # 生成的图标（自动）
├─ dist/                  # Vite 构建输出（单文件 index.html）
└─ release/               # 打包产物 .app / .dmg（自动生成）
```

## deno task 一览

| 命令 | 作用 |
| --- | --- |
| `deno task install` | 安装前端依赖（`web/` 下 `npm install`） |
| `deno task dev` | 开发模式：API + Vite HMR |
| `deno task build` | 构建前端并嵌入 `server/embedded.js` |
| `deno task start` | 构建 + 打开原生窗口 |
| `deno task serve` | 无窗口，仅起本地服务（用默认浏览器打开） |
| `deno task compile` | 构建 + 打包成 `./sqlite-gui` 裸可执行文件 |
| `deno task bundle` | 构建 + 打包成 `.app` 和 `.dmg` |
