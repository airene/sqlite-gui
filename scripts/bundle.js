// Packages the compiled `sqlite-gui` binary into a proper macOS application:
//   • release/SQLite GUI.app   — double-clickable app bundle (icon + Info.plist)
//   • release/SQLite-GUI.dmg   — drag-to-Applications disk image
//
// `deno compile` only produces a bare Unix executable; this script wraps it in
// the standard `.app` structure and builds a `.dmg`. Requires macOS tools:
// qlmanage, sips, iconutil, codesign, hdiutil.
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const APP_NAME = "SQLite GUI";
const BINARY = "sqlite-gui";
const BUNDLE_ID = "me.xining.sqlite-gui";
const VERSION = "1.0.0";
const MIN_MACOS = "11.0";

const BIN = join(ROOT, BINARY);
const SVG = join(ROOT, "build", "icon.svg");
const ICNS = join(ROOT, "build", "icon.icns");
const OUT = join(ROOT, "release");
const APP = join(OUT, `${APP_NAME}.app`);
const DMG = join(OUT, "SQLite-GUI.dmg");

async function run(cmd, args, { allowFail = false } = {}) {
  const { code, stdout, stderr } = await new Deno.Command(cmd, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const dec = new TextDecoder();
  if (code !== 0 && !allowFail) {
    throw new Error(`${cmd} ${args.join(" ")} exited ${code}\n${dec.decode(stderr)}`);
  }
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
}

async function exists(p) {
  try {
    await Deno.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function rm(p) {
  await Deno.remove(p, { recursive: true }).catch(() => {});
}

// Build an .icns from the SVG via qlmanage → sips (resize) → iconutil.
async function makeIcns() {
  console.log("• 生成图标 icon.icns …");
  const tmp = await Deno.makeTempDir();
  await run("qlmanage", ["-t", "-s", "1024", "-o", tmp, SVG], { allowFail: true });
  const basePng = join(tmp, `${basename(SVG)}.png`);
  if (!(await exists(basePng))) {
    throw new Error("qlmanage 未能从 SVG 生成 PNG");
  }
  const iconset = join(tmp, "icon.iconset");
  await Deno.mkdir(iconset);
  const specs = [
    [16, "16x16"], [32, "16x16@2x"], [32, "32x32"], [64, "32x32@2x"],
    [128, "128x128"], [256, "128x128@2x"], [256, "256x256"], [512, "256x256@2x"],
    [512, "512x512"], [1024, "512x512@2x"],
  ];
  for (const [px, name] of specs) {
    await run("sips", ["-z", String(px), String(px), basePng, "--out", join(iconset, `icon_${name}.png`)]);
  }
  await run("iconutil", ["-c", "icns", iconset, "-o", ICNS]);
  await rm(tmp);
}

function infoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key>
	<string>${APP_NAME}</string>
	<key>CFBundleDisplayName</key>
	<string>${APP_NAME}</string>
	<key>CFBundleExecutable</key>
	<string>${BINARY}</string>
	<key>CFBundleIdentifier</key>
	<string>${BUNDLE_ID}</string>
	<key>CFBundleVersion</key>
	<string>${VERSION}</string>
	<key>CFBundleShortVersionString</key>
	<string>${VERSION}</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleIconFile</key>
	<string>icon</string>
	<key>LSMinimumSystemVersion</key>
	<string>${MIN_MACOS}</string>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>LSApplicationCategoryType</key>
	<string>public.app-category.developer-tools</string>
</dict>
</plist>
`;
}

async function buildApp() {
  if (!(await exists(BIN))) {
    throw new Error(`未找到 ${BIN}，请先运行 deno task compile`);
  }
  if (!(await exists(ICNS))) await makeIcns();

  console.log(`• 组装 ${APP_NAME}.app …`);
  await rm(APP);
  const macos = join(APP, "Contents", "MacOS");
  const resources = join(APP, "Contents", "Resources");
  await Deno.mkdir(macos, { recursive: true });
  await Deno.mkdir(resources, { recursive: true });

  const destBin = join(macos, BINARY);
  await Deno.copyFile(BIN, destBin);
  await Deno.chmod(destBin, 0o755);
  await Deno.copyFile(ICNS, join(resources, "icon.icns"));
  await Deno.writeTextFile(join(APP, "Contents", "Info.plist"), infoPlist());

  console.log("• 代码签名 (ad-hoc) …");
  await run("codesign", ["--force", "--deep", "--sign", "-", APP]);
}

async function buildDmg() {
  console.log("• 生成 .dmg …");
  const stage = join(OUT, "dmg-stage");
  await rm(stage);
  await Deno.mkdir(stage, { recursive: true });
  await run("cp", ["-R", APP, stage]);
  await run("ln", ["-s", "/Applications", join(stage, "Applications")]);
  await rm(DMG);
  await run("hdiutil", [
    "create", "-volname", APP_NAME, "-srcfolder", stage,
    "-ov", "-format", "UDZO", DMG,
  ]);
  await rm(stage);
}

await Deno.mkdir(OUT, { recursive: true });
await buildApp();
await buildDmg();

console.log("\n✅ 完成:");
console.log(`   ${APP}`);
console.log(`   ${DMG}`);
