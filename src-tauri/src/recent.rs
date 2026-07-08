// 最近打开文件的历史，持久化到应用配置目录，跨启动保留。
// macOS 上大致是 ~/Library/Application Support/<identifier>/recent.json
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const MAX: usize = 10;

fn file_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    Some(dir.join("recent.json"))
}

// 读取列表，并过滤掉已不存在的文件
pub fn load(app: &AppHandle) -> Vec<String> {
    let Some(p) = file_path(app) else {
        return Vec::new();
    };
    let Ok(text) = std::fs::read_to_string(&p) else {
        return Vec::new();
    };
    let list: Vec<String> = serde_json::from_str(&text).unwrap_or_default();
    list.into_iter()
        .filter(|f| std::path::Path::new(f).is_file())
        .collect()
}

// 把刚打开的文件放到列表最前面（去重、限量），返回更新后的列表
pub fn add(app: &AppHandle, path: &str) -> Vec<String> {
    let mut list = load(app);
    list.retain(|p| p != path);
    list.insert(0, path.to_string());
    list.truncate(MAX);
    save(app, &list);
    list
}

pub fn clear(app: &AppHandle) {
    save(app, &[]);
}

fn save(app: &AppHandle, list: &[String]) {
    if let Some(p) = file_path(app) {
        if let Some(dir) = p.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(&p, serde_json::to_string_pretty(list).unwrap_or_default());
    }
}
