import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, watch } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const buildIdPath = join(projectRoot, ".next", "BUILD_ID");
const nextBin = join(projectRoot, "node_modules", "next", "dist", "bin", "next");

let child = null;
let restarting = false;

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

function readBuildId() {
  if (!existsSync(buildIdPath)) {
    return "";
  }

  return readFileSync(buildIdPath, "utf8").trim();
}

let currentBuildId = readBuildId();

function startServer() {
  cleanupLegacyChunkAliases();

  child = spawn(process.execPath, [nextBin, "start", ...process.argv.slice(2)], {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (restarting) {
      restarting = false;
      startServer();
      return;
    }

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

function restartServer() {
  if (!child) {
    startServer();
    return;
  }

  restarting = true;
  child.kill("SIGTERM");
}

startServer();

watch(join(projectRoot, ".next"), { persistent: true }, () => {
  const nextBuildId = readBuildId();
  if (!nextBuildId || nextBuildId === currentBuildId) {
    return;
  }

  currentBuildId = nextBuildId;
  restartServer();
});

process.on("SIGINT", () => child?.kill("SIGINT"));
process.on("SIGTERM", () => child?.kill("SIGTERM"));
