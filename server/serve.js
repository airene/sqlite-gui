// Starts the local HTTP server. Bound to 127.0.0.1 only — this is a local
// desktop app, nothing should be exposed to the network.
import { handleRequest } from "./handlers.js";
import * as db from "./db.js";
import * as recent from "./recent.js";

// If SQLITE_GUI_DB is set (e.g. a path passed on the command line), open it at
// startup so the app launches straight into that database.
function maybeAutoOpen() {
  const path = Deno.env.get("SQLITE_GUI_DB");
  if (path && !db.isOpen()) {
    try {
      db.openDatabase(path);
      recent.add(path);
    } catch (e) {
      console.error("自动打开数据库失败:", e.message);
    }
  }
}

/** Start the server. `port` 0 picks a free port. Resolves once listening. */
export function startServer(port = 0) {
  maybeAutoOpen();
  let resolveReady;
  const ready = new Promise((resolve) => (resolveReady = resolve));
  // `onListen` fires synchronously inside `Deno.serve`, so it must not touch
  // `server` (still in the temporal dead zone) — attach it after `ready`.
  const server = Deno.serve(
    {
      port,
      hostname: "127.0.0.1",
      onListen: ({ hostname, port }) => resolveReady({ hostname, port }),
    },
    handleRequest,
  );
  return ready.then((info) => ({ ...info, server }));
}

// Run directly (`deno run server/serve.js [db-path]`) → headless API server on
// a fixed port, used by the Vite dev proxy and by the preview harness.
if (import.meta.main) {
  if (Deno.args[0]) Deno.env.set("SQLITE_GUI_DB", await Deno.realPath(Deno.args[0]));
  const port = Number.parseInt(Deno.env.get("PORT") ?? "8787", 10);
  const { hostname, port: p } = await startServer(port);
  console.log(`SQLite GUI API (headless) → http://${hostname}:${p}`);

  const cleanup = () => {
    try {
      db.closeDatabase();
    } catch {
      // ignore
    }
    Deno.exit(0);
  };
  for (const sig of ["SIGINT", "SIGTERM"]) {
    try {
      Deno.addSignalListener(sig, cleanup);
    } catch {
      // signal not supported on this platform
    }
  }
}
