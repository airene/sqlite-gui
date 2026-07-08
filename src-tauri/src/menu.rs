// 原生菜单栏。Tauri 提供了跨平台的菜单 API，不用像之前 Deno 版那样手写 FFI。
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Wry};

// 根据最近文件列表，构建整套菜单。每次最近列表变化时会重新构建并 set_menu。
pub fn build_menu(app: &AppHandle, recent: &[String]) -> tauri::Result<Menu<Wry>> {
    // 应用菜单（macOS 左上角第一个，标题会自动显示成 App 名）
    let app_menu = SubmenuBuilder::new(app, "SQLite GUI")
        .item(&PredefinedMenuItem::quit(app, Some("退出 SQLite GUI"))?)
        .build()?;

    // 文件菜单：打开…（⌘O）+ 打开最近使用
    let open = MenuItemBuilder::with_id("open", "打开…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let recent_menu = build_recent_submenu(app, recent)?;
    let file_menu = SubmenuBuilder::new(app, "文件")
        .item(&open)
        .item(&recent_menu)
        .build()?;

    // 编辑菜单：让右侧表格里的文本可以复制/全选（预置项，无需自己处理事件）
    let edit_menu = SubmenuBuilder::new(app, "编辑")
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .build()
}

// “打开最近使用”子菜单：每个条目 id 为 "recent:序号"，点击时在事件处理里解析。
fn build_recent_submenu(app: &AppHandle, recent: &[String]) -> tauri::Result<Submenu<Wry>> {
    let mut b = SubmenuBuilder::new(app, "打开最近使用");
    if recent.is_empty() {
        b = b.item(
            &MenuItemBuilder::with_id("recent_empty", "无最近文件")
                .enabled(false)
                .build(app)?,
        );
    } else {
        for (i, path) in recent.iter().enumerate() {
            // 菜单上只显示文件名
            let name = std::path::Path::new(path)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone());
            b = b.item(&MenuItemBuilder::with_id(format!("recent:{i}"), name).build(app)?);
        }
        b = b.separator();
        b = b.item(&MenuItemBuilder::with_id("clear_recent", "清除菜单").build(app)?);
    }
    b.build()
}
