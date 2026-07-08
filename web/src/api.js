// Thin fetch wrapper around the backend JSON API. All paths are relative, so
// this works both in the packaged app (served from the same origin) and in dev
// (Vite proxies /api to the local API server).
async function request(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || `请求失败 (HTTP ${res.status})`);
  }
  return data;
}

export const api = {
  /** Current open path + table list (empty if nothing open). */
  state: () => request("/api/state"),

  /** Pop the native file picker and open the chosen database. */
  open: () =>
    request("/api/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),

  /** Open a specific database by path (used by the "Open Recent" menu). */
  openPath: (path) =>
    request("/api/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    }),

  /** Clear the recent-files history. */
  clearRecent: () => request("/api/recent/clear", { method: "POST" }),

  /** One page of rows for a table. */
  rows: (table, page, pageSize) =>
    request(
      `/api/rows?table=${encodeURIComponent(table)}&page=${page}&pageSize=${pageSize}`,
    ),
};
