// Application entry point — this is what `deno compile` turns into the
// executable, and what `deno task start` runs.
//
//   • Windowed (default): opens a native webview window backed by macOS
//     WebKit, with the HTTP server running in a worker.
//   • Headless (SQLITE_GUI_HEADLESS=1): just runs the server and opens the
//     default browser. Used for development and for testing the bundle
//     without a GUI.

const HEADLESS = Deno.env.get("SQLITE_GUI_HEADLESS") === "1";

// Optional: open a database passed on the command line (`sqlite-gui foo.db`).
// Stored in the env so the server — which runs in a worker — picks it up too.
if (Deno.args[0]) {
  try {
    Deno.env.set("SQLITE_GUI_DB", await Deno.realPath(Deno.args[0]));
  } catch (e) {
    console.error("无法解析数据库路径:", e.message);
  }
}

function waitForPort(worker, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("服务启动超时")), timeoutMs);
    worker.onmessage = (e) => {
      if (e.data?.type === "ready") {
        clearTimeout(timer);
        resolve(e.data.port);
      }
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      reject(e.error ?? new Error(e.message));
    };
  });
}

async function runHeadless() {
  const { startServer } = await import("./serve.js");
  const { closeDatabase } = await import("./db.js");
  const { port } = await startServer(0);
  const url = `http://localhost:${port}/`;
  console.log("SQLite GUI (headless) →", url);

  const cleanup = () => {
    try {
      closeDatabase();
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

  try {
    new Deno.Command("open", { args: [url] }).spawn();
  } catch {
    // no `open` (non-macOS / sandbox) — just leave the URL printed
  }
  await new Promise(() => {}); // keep alive until a signal arrives
}

async function runWindowed() {
  const { Webview, SizeHint } = await import("jsr:@webview/webview");
  const menu = await import("./menu.js");

  const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  const port = await waitForPort(worker);

  const webview = new Webview(false, { width: 1180, height: 760, hint: SizeHint.NONE });
  webview.title = "SQLite GUI";
  // Tell the web UI a native menu exists, so it hides its in-page Open button.
  webview.init("window.__NATIVE_MENU__ = true;");
  // JS → native: the page pushes its recent-files list into the native menu.
  webview.bind("syncRecentMenu", (list) => menu.setRecent(list));
  menu.installMenu(webview);
  webview.navigate(`http://localhost:${port}/`);
  webview.run(); // blocks until the window is closed

  // Ask the worker to close the DB and clean up sidecar files before exiting.
  try {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 500);
      worker.onmessage = (e) => {
        if (e.data?.type === "closed") {
          clearTimeout(timer);
          resolve();
        }
      };
      worker.postMessage({ type: "shutdown" });
    });
  } catch {
    // ignore
  }
  worker.terminate();
  Deno.exit(0);
}

if (HEADLESS) {
  await runHeadless();
} else {
  await runWindowed();
}
