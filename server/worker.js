// Web Worker entry: runs the HTTP server on its own thread/event loop.
//
// Why a worker? The native `webview.run()` call on the main thread blocks that
// thread's event loop until the window closes. If the server lived on the main
// thread it could never answer a request. Here the WKWebView talks to the
// server over TCP, independent of the (blocked) main-thread loop.
import { startServer } from "./serve.js";
import { closeDatabase } from "./db.js";

const { port } = await startServer(0);
self.postMessage({ type: "ready", port });

// On window close the main thread asks us to shut down cleanly so the database
// is closed and any sidecar files we created are removed.
self.onmessage = (e) => {
  if (e.data?.type === "shutdown") {
    try {
      closeDatabase();
    } catch {
      // ignore
    }
    self.postMessage({ type: "closed" });
    self.close();
  }
};
