// Native macOS menu bar, built by calling the Objective-C runtime through Deno
// FFI (the webview library has no menu API). Runs on the main thread alongside
// the webview.
//
//   • App menu:  退出 (⌘Q)
//   • 文件:       打开… (⌘O)  ·  打开最近使用 ▸  ·  清除菜单
//
// Menu clicks route back to the web UI via `webview.eval(...)`, reusing the
// exact same open flow the page already has. The recent-files list is pushed in
// from the web side through the `syncRecentMenu` binding (see setRecent).
import { basename } from "node:path";

const P = "pointer";
const objc = Deno.dlopen("/usr/lib/libobjc.A.dylib", {
  objc_getClass: { parameters: ["buffer"], result: P },
  sel_registerName: { parameters: ["buffer"], result: P },
  objc_msgSend: { type: P },
  objc_allocateClassPair: { parameters: [P, "buffer", "usize"], result: P },
  objc_registerClassPair: { parameters: [P], result: "void" },
  class_addMethod: { parameters: [P, P, P, "buffer"], result: "bool" },
});

const enc = (s) => new TextEncoder().encode(s + "\0");
const cls = (n) => objc.symbols.objc_getClass(enc(n));
const sel = (n) => objc.symbols.sel_registerName(enc(n));
const mk = (res, params) => {
  const f = new Deno.UnsafeFnPointer(objc.symbols.objc_msgSend, { parameters: params, result: res });
  return (...a) => f.call(...a);
};
// objc_msgSend wrappers for the specific signatures we need.
const msgId = mk(P, [P, P]);
const msgId1 = mk(P, [P, P, P]);
const msgId3 = mk(P, [P, P, P, P, P]);
const msgI64 = mk("i64", [P, P]);
const msgVoid0 = mk("void", [P, P]);
const msgVoid1 = mk("void", [P, P, P]);
const msgVoidI = mk("void", [P, P, "i64"]);
const msgVoidB = mk("void", [P, P, "bool"]);

const alloc = (c) => msgId(c, sel("alloc"));
const New = (n) => msgId(alloc(cls(n)), sel("init"));
const nsstr = (s) => {
  const b = enc(s);
  return msgId1(cls("NSString"), sel("stringWithUTF8String:"), Deno.UnsafePointer.of(b));
};

const TAG_OPEN = 1;
const TAG_CLEAR = 2;
const TAG_RECENT_BASE = 1000;

let webviewRef = null;
let actionCallback = null; // must stay alive for the lifetime of the process
let handler = null; // custom NSObject subclass instance (menu target)
let selAction = null;
let recentSubmenu = null;
let recentPaths = [];

function evalJS(src) {
  try {
    webviewRef?.eval(src);
  } catch {
    // ignore
  }
}

function onAction(tag) {
  if (tag === TAG_OPEN) {
    evalJS("window.__app_open && window.__app_open()");
  } else if (tag === TAG_CLEAR) {
    evalJS("window.__app_clearRecent && window.__app_clearRecent()");
  } else if (tag >= TAG_RECENT_BASE) {
    const path = recentPaths[tag - TAG_RECENT_BASE];
    if (path) evalJS(`window.__app_openPath && window.__app_openPath(${JSON.stringify(path)})`);
  }
}

// Create an NSObject subclass whose single method forwards to onAction(tag).
function makeHandler() {
  selAction = sel("sgMenuAction:");
  actionCallback = new Deno.UnsafeCallback(
    { parameters: [P, P, P], result: "void" },
    (_self, _cmd, sender) => {
      try {
        onAction(Number(msgI64(sender, sel("tag"))));
      } catch {
        // ignore
      }
    },
  );
  const Cls = objc.symbols.objc_allocateClassPair(cls("NSObject"), enc("SGMenuHandler"), 0);
  objc.symbols.class_addMethod(Cls, selAction, actionCallback.pointer, enc("v@:@"));
  objc.symbols.objc_registerClassPair(Cls);
  handler = msgId(alloc(Cls), sel("init"));
}

function addAction(menu, title, tag, key = "") {
  const item = msgId3(menu, sel("addItemWithTitle:action:keyEquivalent:"), nsstr(title), selAction, nsstr(key));
  msgVoid1(item, sel("setTarget:"), handler);
  msgVoidI(item, sel("setTag:"), BigInt(tag));
  return item;
}

function addDisabled(menu, title) {
  const item = msgId3(menu, sel("addItemWithTitle:action:keyEquivalent:"), nsstr(title), null, nsstr(""));
  msgVoidB(item, sel("setEnabled:"), false);
  return item;
}

function addSeparator(menu) {
  msgVoid1(menu, sel("addItem:"), msgId(cls("NSMenuItem"), sel("separatorItem")));
}

/** Build and install the app's main menu. Call once, after the Webview exists. */
export function installMenu(webview) {
  webviewRef = webview;
  makeHandler();

  const NSApp = msgId(cls("NSApplication"), sel("sharedApplication"));
  const mainMenu = New("NSMenu");

  // App menu (its title is replaced by the app name automatically).
  const appItem = New("NSMenuItem");
  msgVoid1(mainMenu, sel("addItem:"), appItem);
  const appMenu = New("NSMenu");
  msgVoid1(appItem, sel("setSubmenu:"), appMenu);
  msgId3(appMenu, sel("addItemWithTitle:action:keyEquivalent:"), nsstr("退出 SQLite GUI"), sel("terminate:"), nsstr("q"));

  // 文件 menu
  const fileItem = New("NSMenuItem");
  msgVoid1(mainMenu, sel("addItem:"), fileItem);
  const fileMenu = msgId1(alloc(cls("NSMenu")), sel("initWithTitle:"), nsstr("文件"));
  msgVoid1(fileItem, sel("setSubmenu:"), fileMenu);
  addAction(fileMenu, "打开…", TAG_OPEN, "o");

  // 打开最近使用 ▸ (submenu filled by setRecent)
  const recentItem = msgId3(fileMenu, sel("addItemWithTitle:action:keyEquivalent:"), nsstr("打开最近使用"), null, nsstr(""));
  recentSubmenu = msgId1(alloc(cls("NSMenu")), sel("initWithTitle:"), nsstr("打开最近使用"));
  msgVoid1(recentItem, sel("setSubmenu:"), recentSubmenu);
  setRecent([]);

  msgVoid1(NSApp, sel("setMainMenu:"), mainMenu);
}

/** Rebuild the "打开最近使用" submenu from a list of paths (most-recent first). */
export function setRecent(list) {
  if (!recentSubmenu) return;
  recentPaths = Array.isArray(list) ? list : [];
  msgVoid0(recentSubmenu, sel("removeAllItems"));

  if (recentPaths.length === 0) {
    addDisabled(recentSubmenu, "无最近文件");
    return;
  }
  recentPaths.forEach((path, i) => {
    const item = addAction(recentSubmenu, basename(path), TAG_RECENT_BASE + i, "");
    msgVoid1(item, sel("setToolTip:"), nsstr(path));
  });
  addSeparator(recentSubmenu);
  addAction(recentSubmenu, "清除菜单", TAG_CLEAR, "");
}
