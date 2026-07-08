// 从 build/icon.svg 生成应用图标（仅保留 macOS 需要的文件）。
// 步骤：SVG →【透明】PNG（resvg 渲染）→ tauri icon 生成整套 → 删掉非 macOS 的。
// 用法：npm run make-icon
import { Resvg } from "@resvg/resvg-js";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const svgPath = join(root, "build", "icon.svg");
const pngPath = join(root, "build", "icon-1024.png");
const iconsDir = join(root, "src-tauri", "icons");
const tauriBin = join(root, "node_modules", ".bin", "tauri");

// 1) SVG → 1024×1024 透明 PNG（不设 background 即透明；别用 qlmanage，它会糊成白底）
const png = new Resvg(readFileSync(svgPath), { fitTo: { mode: "width", value: 1024 } })
  .render()
  .asPng();
writeFileSync(pngPath, png);
console.log(`已渲染透明图标 build/icon-1024.png (${png.length} bytes)`);

// 2) 交给 tauri 生成整套图标（会一并生成 Windows/iOS/Android 的）
execFileSync(tauriBin, ["icon", pngPath], { cwd: root, stdio: "inherit" });

// 3) 只保留 macOS 需要的，其余（.ico / Square*Logo / ios / android 等）删掉
const keep = new Set(["icon.icns", "32x32.png", "128x128.png", "128x128@2x.png"]);
let removed = 0;
for (const entry of readdirSync(iconsDir)) {
  if (!keep.has(entry)) {
    rmSync(join(iconsDir, entry), { recursive: true, force: true });
    removed++;
  }
}
console.log(`已精简 src-tauri/icons/：保留 ${keep.size} 个，删除 ${removed} 个（仅留 macOS）`);
