const { spawn } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  path.join(root, "runtime/electron.exe"),
  [path.join(__dirname, "runtime-qa.cjs")],
  { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
const timeout = setTimeout(() => {
  console.error("Runtime QA timed out");
  child.kill();
  process.exitCode = 1;
}, 180000);
child.on("error", (error) => {
  clearTimeout(timeout);
  console.error(error);
  process.exitCode = 1;
});
child.on("close", (code) => {
  clearTimeout(timeout);
  process.exitCode = code ?? 1;
});
