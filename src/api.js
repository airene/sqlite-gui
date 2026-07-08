// 前端与 Rust 后端的桥梁。
// - invoke(命令名, 参数)  调用 Rust 里 #[tauri::command] 定义的函数
// - listen(事件名, 回调)  订阅 Rust 用 app.emit 发来的事件
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const api = {
  // 取某个表的一页数据。
  // 注意：Tauri v2 会把 Rust 的 page_size 自动映射为前端的驼峰 pageSize，
  // 所以这里传 pageSize（不是 page_size）。
  rows: (table, page, pageSize) => invoke("get_rows", { table, page, pageSize }),

  // 订阅「数据库已打开」事件（由顶部菜单的“打开/打开最近”触发）。
  // 返回一个取消订阅的函数。
  onDbOpened: (cb) => listen("db-opened", (e) => cb(e.payload)),

  // 订阅「打开出错」事件。
  onDbError: (cb) => listen("db-error", (e) => cb(e.payload)),
};
