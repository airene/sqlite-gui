// Recent-files history, persisted to the user's Application Support directory so
// it survives across launches. Server-side (runs in the worker); the native
// menu receives the list from the web UI via a webview binding.
import { join } from "node:path";

const APP_DIR = join(
  Deno.env.get("HOME") ?? ".",
  "Library",
  "Application Support",
  "SQLite GUI",
);
const FILE = join(APP_DIR, "recent.json");
const MAX = 10;

function read() {
  try {
    const data = JSON.parse(Deno.readTextFileSync(FILE));
    if (Array.isArray(data)) return data.filter((p) => typeof p === "string");
  } catch {
    // missing / malformed → empty
  }
  return [];
}

function write(list) {
  try {
    Deno.mkdirSync(APP_DIR, { recursive: true });
    Deno.writeTextFileSync(FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error("保存最近列表失败:", e.message);
  }
}

function isFile(p) {
  try {
    return Deno.statSync(p).isFile;
  } catch {
    return false;
  }
}

/** Recent paths, most-recent first, filtered to files that still exist. */
export function list() {
  return read().filter(isFile);
}

/** Record a freshly opened file at the front of the list. */
export function add(path) {
  const next = [path, ...read().filter((p) => p !== path)].slice(0, MAX);
  write(next);
  return list();
}

export function clear() {
  write([]);
  return [];
}
