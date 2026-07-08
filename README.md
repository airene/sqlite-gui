# SQLite GUI

一个用 **Tauri v2 + Vue 3 + Rust** 写的极简 SQLite 浏览器桌面应用（macOS）。

- 顶部**原生 macOS 菜单栏**：文件 → 打开…（⌘O）/ 打开最近使用；编辑 → 复制 / 全选
- 记住**最近打开的文件**（持久化，跨启动保留）
- 左侧列出所有表 / 视图（含行数），右侧查看选中表的数据，**服务端分页**
- 界面只保留「当前打开哪个文件」的指示，打开操作走菜单栏
- **只读**打开，不改动你的数据文件
- 借用系统 WebView，打包体积很小（`.app` 约 10 MB，`.dmg` 约 4 MB）

## 架构

```
Rust 后端 (src-tauri)                     前端 (src, Vue 3 + Vite)
├─ 原生窗口 + 菜单栏 (Tauri)               ├─ 顶部：当前文件指示
├─ rusqlite 只读打开 SQLite               ├─ 左：表/视图列表
├─ 命令 get_rows —— 分页取数    ← invoke ──┤  右：数据表格 + 分页
├─ 事件 db-opened / db-error   ── emit ──→ │  监听事件刷新界面
└─ 最近文件持久化 (recent.json)            └─
```

- 菜单点击（打开/打开最近/清除）在 Rust 里处理：弹原生文件框 → 只读打开 →
  更新状态和菜单 → `emit("db-opened")` 通知前端刷新。
- 前端通过 `invoke("get_rows", …)` 取某一页数据；通过 `listen("db-opened", …)` 接收打开结果。

## 环境要求

- [Rust](https://rustup.rs)（已在 1.96 上验证）+ Xcode Command Line Tools
- [Node.js](https://nodejs.org) + npm（前端与 Tauri CLI）
- macOS（Apple Silicon / Intel）

## 快速开始

```bash
# 安装前端依赖（含 Tauri CLI）
npm install

# 开发模式：起 Vite + 原生窗口，改前端代码热更新
npm run tauri dev

# 打包发布（产出 .app 和 .dmg）
npm run tauri build
```

打包产物位置：

```
src-tauri/target/release/bundle/macos/SQLite GUI.app
src-tauri/target/release/bundle/dmg/SQLite GUI_1.0.0_aarch64.dmg
```

双击 `SQLite GUI.app` 启动，然后用菜单栏「文件 → 打开…」选择数据库。

## 项目结构

```
sqlite-gui/
├─ index.html            # Vite 入口
├─ vite.config.js
├─ package.json          # 前端 + Tauri CLI
├─ src/                  # 前端（Vue 3）
│  ├─ main.js
│  ├─ App.vue            #   顶部指示 + 左表列表 + 右数据；监听 db-opened 事件
│  ├─ api.js             #   invoke / listen 封装
│  ├─ style.css
│  └─ components/{TableList,DataView}.vue
└─ src-tauri/            # 后端（Rust）
   ├─ Cargo.toml
   ├─ tauri.conf.json    #   窗口、标识符、图标、打包配置
   ├─ capabilities/      #   前端可调用的权限（core:default）
   ├─ icons/             #   应用图标（由 build/icon.svg 生成）
   └─ src/
      ├─ main.rs         #   入口，调用 lib.rs 的 run()
      ├─ lib.rs          #   状态、命令、菜单事件、文件对话框
      ├─ db.rs           #   rusqlite 只读封装 + 分页（含单元测试）
      ├─ recent.rs       #   最近文件持久化
      └─ menu.rs         #   原生菜单栏
```

## 说明

- **只读与 WAL**：数据库以只读方式打开（`SQLITE_OPEN_READ_ONLY`）。若是 WAL 模式，
  SQLite 读取时会生成标准的 `-wal`/`-shm` 临时文件；`Db` 在被丢弃（切换数据库或退出）
  时会自动删除自己创建的空临时文件，保持目录原样。
- **最近文件**：存于 `~/Library/Application Support/me.xining.sqlite-gui/recent.json`
  （最多 10 条、去重、过滤已删除的文件）。
- **签名**：打包时做 **ad-hoc 签名**（`tauri.conf.json` 里 `bundle.macOS.signingIdentity = "-"`）。
  本机运行没问题；要分发给别人需要 Apple Developer ID 签名 + 公证（notarization）。
- **应用图标**：源文件是 [build/icon.svg](build/icon.svg)。改完执行 `npm run make-icon`
  重新生成 `src-tauri/icons/`（用 resvg 渲染成【透明】PNG，再交给 `tauri icon`；
  注意别用 `qlmanage`，它会把透明糊成白底）。

## 测试

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

会用仓库里的 `starcontrol-auth.sqlite3`（若存在）验证打开、列表与分页逻辑。
