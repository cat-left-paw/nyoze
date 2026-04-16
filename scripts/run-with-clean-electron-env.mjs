import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const [, , command, ...args] = process.argv;

if (!command) {
  console.error("Usage: node scripts/run-with-clean-electron-env.mjs <command> [args...]");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const executable =
  command === "vite"
    ? process.execPath
    : command === "electron-builder"
      ? process.execPath
      : command;

const finalArgs =
  command === "vite"
    ? [path.join(rootDir, "node_modules", "vite", "bin", "vite.js"), ...args]
    : command === "electron-builder"
      ? [path.join(rootDir, "node_modules", "electron-builder", "cli.js"), ...args]
      : args;

const child = spawn(executable, finalArgs, {
  cwd: rootDir,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

