// SQLite access layer, built on Deno's built-in `node:sqlite` (no external
// native library to bundle — it ships inside the compiled binary).
//
// The database is always opened **read-only**: this is a browsing tool and we
// must never modify the user's file. A single database is open at a time; the
// handle lives as module state (the server runs single-threaded in one worker).
import { DatabaseSync } from "node:sqlite";

let db = null;
let dbPath = null;
// Sidecar files (-wal, -shm) that did NOT exist before we opened the database,
// i.e. ones our read-only connection created. We remove the empty ones on
// close so the user's directory is left exactly as we found it. If a sidecar
// existed already (another process is using the DB in WAL mode) we never touch
// it.
let createdSidecars = [];

/** Quote an SQL identifier (table/column) safely for interpolation. */
function quoteId(name) {
  return '"' + String(name).replaceAll('"', '""') + '"';
}

function requireDb() {
  if (!db) throw new Error("尚未打开数据库");
  return db;
}

function fileExists(p) {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Open a SQLite file read-only. Throws if the file is not a valid database. */
export function openDatabase(path) {
  closeDatabase();

  const sidecars = [`${path}-wal`, `${path}-shm`];
  const preexisting = sidecars.filter(fileExists);

  const handle = new DatabaseSync(path, { readOnly: true });
  // Force validation — a non-SQLite file only errors once we touch it.
  handle.prepare("SELECT count(*) FROM sqlite_master").get();
  db = handle;
  dbPath = path;
  createdSidecars = sidecars.filter((s) => !preexisting.includes(s));
  return { path: dbPath, tables: listTables() };
}

export function closeDatabase() {
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
    db = null;
    dbPath = null;
  }
  // Best-effort: delete sidecars we created, but only an empty -wal (a
  // non-empty one could hold un-checkpointed data we must not discard).
  for (const f of createdSidecars) {
    try {
      if (f.endsWith("-wal") && Deno.statSync(f).size !== 0) continue;
      Deno.removeSync(f);
    } catch {
      // ignore — nothing we can safely do
    }
  }
  createdSidecars = [];
}

export function isOpen() {
  return db !== null;
}

export function currentPath() {
  return dbPath;
}

function safeCount(d, name) {
  try {
    return Number(d.prepare(`SELECT COUNT(*) AS c FROM ${quoteId(name)}`).get().c);
  } catch {
    return null; // e.g. a view that fails to evaluate
  }
}

/** List tables and views (excluding sqlite internal tables), with row counts. */
export function listTables() {
  const d = requireDb();
  const rows = d
    .prepare(
      "SELECT name, type FROM sqlite_master " +
        "WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' " +
        "ORDER BY type, name",
    )
    .all();
  return rows.map((r) => ({ name: r.name, type: r.type, rows: safeCount(d, r.name) }));
}

/** Confirm a table/view exists — guards against SQL injection via identifiers. */
function assertTable(table) {
  const d = requireDb();
  const exists = d
    .prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?")
    .get(table);
  if (!exists) throw new Error(`未知的表: ${table}`);
}

export function getColumns(table) {
  const d = requireDb();
  assertTable(table);
  return d
    .prepare(`PRAGMA table_info(${quoteId(table)})`)
    .all()
    .map((c) => ({ name: c.name, type: c.type || "" }));
}

/** Convert a raw SQLite value into something JSON-serialisable. */
function serializeValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Uint8Array) return `⟨BLOB ${v.length} bytes⟩`;
  return v;
}

/** Fetch one page of rows. Returns columns + rows (as arrays) + pagination info. */
export function getRows(table, page, pageSize) {
  const d = requireDb();
  assertTable(table);

  page = Math.max(1, Number.parseInt(page, 10) || 1);
  pageSize = Math.min(500, Math.max(1, Number.parseInt(pageSize, 10) || 50));

  const total = Number(d.prepare(`SELECT COUNT(*) AS c FROM ${quoteId(table)}`).get().c);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  page = Math.min(page, pageCount);
  const offset = (page - 1) * pageSize;

  const columns = getColumns(table);
  const colNames = columns.map((c) => c.name);
  const raw = d.prepare(`SELECT * FROM ${quoteId(table)} LIMIT ? OFFSET ?`).all(pageSize, offset);
  const rows = raw.map((r) => colNames.map((cn) => serializeValue(r[cn])));

  return { table, columns, rows, page, pageSize, total, pageCount };
}
