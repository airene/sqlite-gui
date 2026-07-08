// 数据库访问层：用 rusqlite 以【只读】方式打开 SQLite，提供表列表与分页取数。
use rusqlite::types::ValueRef;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

// 传给前端的表信息。#[serde(rename_all = "camelCase")] 让字段名变成前端习惯的驼峰。
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String, // "table" 或 "view"
    pub rows: Option<i64>, // 行数（取不到则为 null）
}

#[derive(Serialize, Clone)]
pub struct ColumnInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
}

// 一页数据的结果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RowsResult {
    pub table: String,
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<Vec<Value>>, // 每行是一组“已转成 JSON 的单元格值”
    pub page: i64,
    pub page_size: i64,
    pub total: i64,
    pub page_count: i64,
}

// 打开的数据库。用一个结构体包住连接，并记录“我们创建的临时文件”，
// 在它被丢弃（切换数据库或退出）时顺手清理，保持用户目录干净。
pub struct Db {
    conn: Option<Connection>,
    created_sidecars: Vec<PathBuf>,
}

impl Drop for Db {
    fn drop(&mut self) {
        // 先关闭连接（把 Connection 取出丢弃），再删我们创建的临时文件
        self.conn.take();
        for p in &self.created_sidecars {
            // -wal 只删空的（非空可能含未落盘数据，不能动）；-shm 直接删
            if p.to_string_lossy().ends_with("-wal") {
                if let Ok(meta) = std::fs::metadata(p) {
                    if meta.len() != 0 {
                        continue;
                    }
                }
            }
            let _ = std::fs::remove_file(p);
        }
    }
}

// 把标识符（表名/列名）安全地加上双引号，防止 SQL 注入
fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

// 把任意错误转成字符串（前端命令返回 Result<_, String>）
fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// 只读打开一个 SQLite 文件，返回 (数据库句柄, 表列表)
pub fn open_readonly(path: &str) -> Result<(Db, Vec<TableInfo>), String> {
    let wal = format!("{path}-wal");
    let shm = format!("{path}-shm");
    let had_wal = Path::new(&wal).exists();
    let had_shm = Path::new(&shm).exists();

    // NO_MUTEX：由我们自己的 Mutex 保证串行访问；URI：无害
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY
        | OpenFlags::SQLITE_OPEN_NO_MUTEX
        | OpenFlags::SQLITE_OPEN_URI;
    let conn = Connection::open_with_flags(path, flags).map_err(|e| format!("打开失败: {e}"))?;
    // 读一下 sqlite_master，确认确实是合法的 SQLite 文件
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))
        .map_err(|e| format!("不是有效的 SQLite 数据库: {e}"))?;

    // 记录本次打开【新产生】的 -wal / -shm（WAL 模式的库只读打开也会生成）
    let mut created = Vec::new();
    if !had_wal && Path::new(&wal).exists() {
        created.push(PathBuf::from(&wal));
    }
    if !had_shm && Path::new(&shm).exists() {
        created.push(PathBuf::from(&shm));
    }

    let db = Db {
        conn: Some(conn),
        created_sidecars: created,
    };
    let tables = db.list_tables()?;
    Ok((db, tables))
}

impl Db {
    fn conn(&self) -> &Connection {
        self.conn.as_ref().expect("连接已关闭")
    }

    // 列出所有表和视图（排除 sqlite 内部表），并带上行数
    pub fn list_tables(&self) -> Result<Vec<TableInfo>, String> {
        let mut stmt = self
            .conn()
            .prepare(
                "SELECT name, type FROM sqlite_master \
                 WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' \
                 ORDER BY type, name",
            )
            .map_err(err)?;
        let it = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(err)?;

        let mut out = Vec::new();
        for row in it {
            let (name, kind) = row.map_err(err)?;
            // 行数单独查；视图等查不到就记为 None
            let count: Option<i64> = self
                .conn()
                .query_row(
                    &format!("SELECT COUNT(*) FROM {}", quote_ident(&name)),
                    [],
                    |r| r.get(0),
                )
                .ok();
            out.push(TableInfo { name, kind, rows: count });
        }
        Ok(out)
    }

    // 校验表/视图确实存在，防止把任意字符串拼进 SQL
    fn assert_table(&self, table: &str) -> Result<(), String> {
        let found: Option<i64> = self
            .conn()
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?1",
                [table],
                |r| r.get(0),
            )
            .ok();
        if found.is_some() {
            Ok(())
        } else {
            Err(format!("未知的表: {table}"))
        }
    }

    pub fn get_columns(&self, table: &str) -> Result<Vec<ColumnInfo>, String> {
        let mut stmt = self
            .conn()
            .prepare(&format!("PRAGMA table_info({})", quote_ident(table)))
            .map_err(err)?;
        // PRAGMA table_info 的列：cid, name, type, notnull, dflt_value, pk
        let it = stmt
            .query_map([], |r| {
                Ok(ColumnInfo {
                    name: r.get::<_, String>(1)?,
                    kind: r.get::<_, String>(2).unwrap_or_default(),
                })
            })
            .map_err(err)?;
        let mut out = Vec::new();
        for c in it {
            out.push(c.map_err(err)?);
        }
        Ok(out)
    }

    // 取某个表的一页数据（服务端分页）
    pub fn get_rows(&self, table: &str, page: i64, page_size: i64) -> Result<RowsResult, String> {
        self.assert_table(table)?;
        let page_size = page_size.clamp(1, 500);
        let quoted = quote_ident(table);

        let total: i64 = self
            .conn()
            .query_row(&format!("SELECT COUNT(*) FROM {quoted}"), [], |r| r.get(0))
            .map_err(err)?;
        let page_count = ((total as f64 / page_size as f64).ceil() as i64).max(1);
        let page = page.max(1).min(page_count);
        let offset = (page - 1) * page_size;

        let columns = self.get_columns(table)?;
        let n = columns.len();
        let mut stmt = self
            .conn()
            .prepare(&format!("SELECT * FROM {quoted} LIMIT ?1 OFFSET ?2"))
            .map_err(err)?;
        let it = stmt
            .query_map([page_size, offset], |row| {
                let mut cells = Vec::with_capacity(n);
                for i in 0..n {
                    cells.push(value_to_json(row.get_ref(i)?));
                }
                Ok(cells)
            })
            .map_err(err)?;
        let mut rows = Vec::new();
        for r in it {
            rows.push(r.map_err(err)?);
        }

        Ok(RowsResult {
            table: table.to_string(),
            columns,
            rows,
            page,
            page_size,
            total,
            page_count,
        })
    }
}

// 把一个 SQLite 单元格值转成 JSON 值
fn value_to_json(v: ValueRef) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => Value::from(f),
        ValueRef::Text(t) => Value::from(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::from(format!("⟨BLOB {} bytes⟩", b.len())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 用仓库里的测试库验证数据库逻辑（cargo test 在 src-tauri 目录运行，库在上一级）
    #[test]
    fn opens_test_db() {
        let path = "../starcontrol-auth.sqlite3";
        if !Path::new(path).exists() {
            return; // 没有测试库就跳过
        }
        let (db, tables) = open_readonly(path).expect("应能打开测试库");
        assert!(tables.iter().any(|t| t.name == "users"), "应包含 users 表");

        let res = db.get_rows("users", 1, 10).expect("应能取到数据");
        assert_eq!(res.page, 1);
        assert!(res.total >= 1);
        assert!(!res.columns.is_empty());
    }
}
