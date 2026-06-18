#!/usr/bin/env node

import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

const rootDir = process.cwd();
const serverDir = resolve(rootDir, "server");
const childCommand = process.execPath;
const childArgs = ["--import", "tsx", "server/index.ts"];
const debounceMs = Number.parseInt(process.env.DEV_API_WATCH_DEBOUNCE_MS ?? "150", 10);
const ignoredDirNames = new Set(["node_modules", "dist", ".git", ".turbo", "coverage"]);
const signalNumbers = {
  SIGINT: 2,
  SIGTERM: 15
};

/** @type {import("node:fs").FSWatcher[]} */
let watchers = [];
/** @type {import("node:child_process").ChildProcess | null} */
let child = null;
/** @type {NodeJS.Timeout | null} */
let restartTimer = null;
let shuttingDown = false;
let restartRequested = false;
let currentShutdownSignal = null;

async function collectWatchDirs(dir) {
  /** @type {string[]} */
  const watchDirs = [];
  const stack = [dir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    watchDirs.push(currentDir);

    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || ignoredDirNames.has(entry.name)) {
        continue;
      }
      stack.push(resolve(currentDir, entry.name));
    }
  }

  watchDirs.sort((left, right) => left.localeCompare(right));
  return watchDirs;
}

function closeWatchers() {
  for (const watcher of watchers) {
    watcher.close();
  }
  watchers = [];
}

async function refreshWatchers() {
  const watchDirs = await collectWatchDirs(serverDir);
  closeWatchers();

  for (const watchDir of watchDirs) {
    const watcher = watch(watchDir, () => {
      scheduleRestart();
    });
    watcher.on("error", (error) => {
      if (!shuttingDown) {
        console.error(`[dev:api] watcher error in ${watchDir}`);
        console.error(error);
        scheduleRestart();
      }
    });
    watchers.push(watcher);
  }

  return watchDirs;
}

function startChild() {
  child = spawn(childCommand, childArgs, {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit"
  });

  child.on("error", (error) => {
    if (!shuttingDown) {
      console.error("[dev:api] failed to start API child process");
      console.error(error);
      process.exit(1);
    }
  });

  child.on("exit", (code, signal) => {
    child = null;

    if (shuttingDown) {
      exitForShutdownSignal(currentShutdownSignal ?? signal);
      return;
    }

    if (restartRequested) {
      restartRequested = false;
      startChild();
      return;
    }

    if (signal) {
      process.exit(128 + (signalNumbers[signal] ?? 0));
      return;
    }

    process.exit(code ?? 0);
  });
}

function exitForShutdownSignal(signal) {
  if (signal && signalNumbers[signal]) {
    process.exit(128 + signalNumbers[signal]);
    return;
  }
  process.exit(0);
}

async function restartChild() {
  if (shuttingDown) {
    return;
  }

  restartRequested = true;

  try {
    await refreshWatchers();
  } catch (error) {
    console.error("[dev:api] failed to refresh watcher directories");
    console.error(error);
  }

  if (!child) {
    restartRequested = false;
    startChild();
    return;
  }

  child.kill("SIGTERM");
}

function scheduleRestart() {
  if (shuttingDown) {
    return;
  }

  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    void restartChild();
  }, debounceMs);
}

function shutdown(signal) {
  shuttingDown = true;
  currentShutdownSignal = signal;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  closeWatchers();

  if (!child) {
    exitForShutdownSignal(signal);
    return;
  }

  child.kill(signal);
}

async function main() {
  const watchDirs = await refreshWatchers();

  if (process.env.DEV_API_WATCH_DRY_RUN === "1") {
    process.stdout.write(
      `${JSON.stringify(
        {
          childCommand,
          childArgs,
          watchDirs,
          debounceMs
        },
        null,
        2
      )}\n`
    );
    closeWatchers();
    return;
  }

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });

  startChild();
}

main().catch((error) => {
  console.error("[dev:api] watcher bootstrap failed");
  console.error(error);
  process.exit(1);
});
