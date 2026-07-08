// Tauri 应用入口。main.rs 只调用这里的 run()。
mod db;
mod menu;
mod recent;

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

// 全局状态：当前打开的数据库（同一时刻只有一个）。用 Mutex 保证串行访问。
pub struct AppState {
    db: Mutex<Option<db::Db>>,
}

// 发给前端的「数据库已打开」事件负载
#[derive(Serialize, Clone)]
struct OpenedPayload {
    path: String,
    tables: Vec<db::TableInfo>,
}

// 打开数据库并广播结果：更新状态 → 刷新最近列表和菜单 → 通知前端。
// 供菜单里的“打开…”和“打开最近使用”共用。
fn open_and_broadcast(app: &AppHandle, path: &str) {
    match db::open_readonly(path) {
        Ok((new_db, tables)) => {
            {
                let state = app.state::<AppState>();
                let mut cur = state.db.lock().unwrap();
                // 赋新值会 drop 掉旧的 Db：关闭旧连接并清理它创建的临时文件
                *cur = Some(new_db);
            }
            let recent = recent::add(app, path);
            if let Ok(m) = menu::build_menu(app, &recent) {
                let _ = app.set_menu(m); // 重建菜单以刷新“打开最近使用”
            }
            let _ = app.emit(
                "db-opened",
                OpenedPayload { path: path.to_string(), tables },
            );
        }
        Err(e) => {
            let _ = app.emit("db-error", e);
        }
    }
}

// 前端命令：取某个表的一页数据。参数名需与前端 invoke 时一致（snake_case）。
#[tauri::command]
fn get_rows(
    state: State<AppState>,
    table: String,
    page: i64,
    page_size: i64,
) -> Result<db::RowsResult, String> {
    let guard = state.db.lock().unwrap();
    let db = guard.as_ref().ok_or_else(|| "尚未打开数据库".to_string())?;
    db.get_rows(&table, page, page_size)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            db: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![get_rows])
        // 顶部菜单点击事件
        .on_menu_event(|app, event| {
            use tauri_plugin_dialog::DialogExt;
            let id = event.id().as_ref();
            if id == "open" {
                // 弹出原生文件选择框（异步，选完在回调里打开）
                let app = app.clone();
                app.dialog().file().pick_file(move |file| {
                    if let Some(fp) = file {
                        if let Ok(pb) = fp.into_path() {
                            open_and_broadcast(&app, &pb.to_string_lossy());
                        }
                    }
                });
            } else if id == "clear_recent" {
                recent::clear(app);
                if let Ok(m) = menu::build_menu(app, &[]) {
                    let _ = app.set_menu(m);
                }
            } else if let Some(idx) = id.strip_prefix("recent:") {
                // “打开最近使用”里的条目，id 形如 "recent:2"
                if let Ok(i) = idx.parse::<usize>() {
                    let list = recent::load(app);
                    if let Some(path) = list.get(i).cloned() {
                        open_and_broadcast(app, &path);
                    }
                }
            }
        })
        .setup(|app| {
            // 启动时根据磁盘上的最近列表构建菜单
            let recent = recent::load(app.handle());
            let m = menu::build_menu(app.handle(), &recent)?;
            app.set_menu(m)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
