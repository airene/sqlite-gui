// Native macOS "open file" dialog via `osascript`. Returns the chosen POSIX
// path, or null if the user cancelled. Works without any extra dependency and
// gives us the real filesystem path (unlike an in-page <input type=file>).
export async function chooseSqliteFile() {
  const script = [
    'try',
    '  set theFile to choose file with prompt "选择 SQLite 数据库文件"',
    '  POSIX path of theFile',
    'on error number -128', // user cancelled
    '  return "__CANCELLED__"',
    'end try',
  ].join("\n");

  const { code, stdout, stderr } = await new Deno.Command("osascript", {
    args: ["-e", script],
    stdout: "piped",
    stderr: "piped",
  }).output();

  if (code !== 0) {
    throw new Error(new TextDecoder().decode(stderr).trim() || "osascript 调用失败");
  }
  const out = new TextDecoder().decode(stdout).trim();
  if (out === "__CANCELLED__" || out === "") return null;
  return out;
}
