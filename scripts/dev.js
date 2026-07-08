// Development launcher: runs the headless API server in-process and the Vite
// dev server (with HMR) as a child. Open http://localhost:5173 — Vite proxies
// `/api/*` to the API server (see vite.config.js).
import { startServer } from "../server/serve.js";

const { port } = await startServer(8787);
console.log(`API server (dev) → http://localhost:${port}`);
console.log("启动 Vite 开发服务器 (HMR)…  打开 http://localhost:5173");

const vite = new Deno.Command("npm", {
  args: ["run", "dev"],
  cwd: new URL("../web/", import.meta.url),
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

await vite.status;
