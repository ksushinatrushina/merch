import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const nextBin = join(projectRoot, "node_modules", "next", "dist", "bin", "next");

function removeIfExists(relativePath) {
  const targetPath = join(projectRoot, relativePath);
  if (existsSync(targetPath)) {
    rmSync(targetPath, { force: true });
  }
}

function cleanupLegacyChunkAliases() {
  const legacyFiles = [
    ".next/static/chunks/webpack.js",
    ".next/static/chunks/main-app.js",
    ".next/static/chunks/polyfills.js",
    ".next/static/chunks/app-pages-internals.js",
    ".next/static/chunks/app/page.js",
    ".next/static/chunks/app/layout.js",
    ".next/static/css/app/layout.css",
  ];

  for (const relativePath of legacyFiles) {
    removeIfExists(relativePath);
  }
}

cleanupLegacyChunkAliases();

const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  child.kill("SIGINT");
});

process.on("SIGTERM", () => {
  child.kill("SIGTERM");
});
