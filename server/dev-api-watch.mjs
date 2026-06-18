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

function exitForShutdownSignal(signal, exitProcess = process.exit) {
  if (signal && signalNumbers[signal]) {
    exitProcess(128 + signalNumbers[signal]);
    return;
  }
  exitProcess(0);
}

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

async function refreshWatchers(onChange) {
  const watchDirs = await collectWatchDirs(serverDir);
  closeWatchers();

  for (const watchDir of watchDirs) {
    const watcher = watch(watchDir, () => {
      onChange();
    });
    watcher.on("error", (error) => {
      if (!runtime.getState().shuttingDown) {
        console.error(`[dev:api] watcher error in ${watchDir}`);
        console.error(error);
        onChange();
      }
    });
    watchers.push(watcher);
  }

  return watchDirs;
}

function createWatcherRuntime({
  spawnChildProcess,
  refreshWatchersFn,
  closeWatchersFn,
  exitProcess = (code) => {
    process.exit(code);
  },
  logError = (...args) => {
    console.error(...args);
  },
  scheduleTimer = setTimeout,
  clearScheduledTimer = clearTimeout,
  restartDebounceMs = debounceMs
}) {
  /** @type {import("node:child_process").ChildProcess | null} */
  let child = null;
  /** @type {NodeJS.Timeout | null} */
  let restartTimer = null;
  let shuttingDown = false;
  let currentShutdownSignal = null;
  let pendingRestart = false;
  /** @type {Promise<void> | null} */
  let restartLoopPromise = null;
  /** @type {import("node:child_process").ChildProcess | null} */
  let restartingChild = null;
  /** @type {(() => void) | null} */
  let restartCompletionResolver = null;
  /** @type {WeakSet<object>} */
  const ignoredRestartExitChildren = new WeakSet();

  function getState() {
    return {
      child,
      shuttingDown,
      currentShutdownSignal,
      pendingRestart,
      restartInProgress: restartLoopPromise !== null
    };
  }

  function finishRestart(exitingChild) {
    if (restartingChild !== exitingChild) {
      return false;
    }

    restartingChild = null;
    const resolveRestart = restartCompletionResolver;
    restartCompletionResolver = null;
    startChild();
    resolveRestart?.();
    return true;
  }

  function startChild() {
    const startedChild = spawnChildProcess();
    child = startedChild;

    startedChild.on("error", (error) => {
      if (!shuttingDown) {
        logError("[dev:api] failed to start API child process");
        logError(error);
        exitProcess(1);
      }
    });

    startedChild.on("exit", (code, signal) => {
      if (child === startedChild) {
        child = null;
      }

      if (shuttingDown) {
        exitForShutdownSignal(currentShutdownSignal ?? signal, exitProcess);
        return;
      }

      if (ignoredRestartExitChildren.has(startedChild)) {
        ignoredRestartExitChildren.delete(startedChild);
        return;
      }

      if (finishRestart(startedChild)) {
        return;
      }

      if (signal) {
        exitProcess(128 + (signalNumbers[signal] ?? 0));
        return;
      }

      exitProcess(code ?? 0);
    });

    return startedChild;
  }

  async function restartOnce() {
    try {
      await refreshWatchersFn();
    } catch (error) {
      logError("[dev:api] failed to refresh watcher directories");
      logError(error);
    }

    if (shuttingDown) {
      return;
    }

    if (!child) {
      startChild();
      return;
    }

    const childToRestart = child;
    await new Promise((resolve) => {
      restartingChild = childToRestart;
      restartCompletionResolver = resolve;

      if (childToRestart.kill("SIGTERM")) {
        return;
      }

      ignoredRestartExitChildren.add(childToRestart);
      if (child === childToRestart) {
        child = null;
      }
      finishRestart(childToRestart);
    });
  }

  async function restartChild() {
    if (shuttingDown) {
      return;
    }

    pendingRestart = true;

    if (restartLoopPromise) {
      await restartLoopPromise;
      return;
    }

    restartLoopPromise = (async () => {
      while (pendingRestart && !shuttingDown) {
        pendingRestart = false;
        await restartOnce();
      }
    })().finally(() => {
      restartLoopPromise = null;
    });

    await restartLoopPromise;
  }

  function scheduleRestart() {
    if (shuttingDown) {
      return;
    }

    if (restartTimer) {
      clearScheduledTimer(restartTimer);
    }

    restartTimer = scheduleTimer(() => {
      restartTimer = null;
      void restartChild();
    }, restartDebounceMs);
  }

  function shutdown(signal) {
    shuttingDown = true;
    currentShutdownSignal = signal;

    if (restartTimer) {
      clearScheduledTimer(restartTimer);
      restartTimer = null;
    }

    closeWatchersFn();

    if (!child) {
      exitForShutdownSignal(signal, exitProcess);
      return;
    }

    child.kill(signal);
  }

  return {
    getState,
    restartChild,
    scheduleRestart,
    shutdown,
    startChild
  };
}

let runtime = null;

function spawnDevApiChildProcess() {
  return spawn(childCommand, childArgs, {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit"
  });
}

runtime = createWatcherRuntime({
  spawnChildProcess: spawnDevApiChildProcess,
  refreshWatchersFn: () => refreshWatchers(() => {
    runtime.scheduleRestart();
  }),
  closeWatchersFn: closeWatchers
});

function createMockChild(id, events) {
  const listeners = {
    error: [],
    exit: []
  };

  return {
    id,
    on(event, listener) {
      listeners[event].push(listener);
      return this;
    },
    kill(signal) {
      events.push({ type: "kill", id, signal });
      queueMicrotask(() => {
        for (const listener of listeners.exit) {
          listener(null, signal);
        }
      });
      return true;
    }
  };
}

async function runRestartSelfTest() {
  /** @type {number | null} */
  let activeChildId = null;
  /** @type {{ type: string; id?: number; signal?: NodeJS.Signals }[]} */
  const events = [];
  /** @type {number[]} */
  const exitCalls = [];
  let nextChildId = 0;
  let refreshCount = 0;

  const selfTestRuntime = createWatcherRuntime({
    spawnChildProcess: () => {
      const childId = nextChildId + 1;
      nextChildId = childId;
      activeChildId = childId;
      events.push({ type: "start", id: childId });
      return createMockChild(childId, events);
    },
    refreshWatchersFn: async () => {
      refreshCount += 1;
      events.push({ type: "refresh", id: refreshCount });
    },
    closeWatchersFn: () => {
      events.push({ type: "close-watchers" });
    },
    exitProcess: (code) => {
      exitCalls.push(code);
    },
    logError: () => {}
  });

  selfTestRuntime.startChild();
  const firstRestart = selfTestRuntime.restartChild();
  const secondRestart = selfTestRuntime.restartChild();
  await Promise.all([firstRestart, secondRestart]);

  const startIds = events.filter((event) => event.type === "start").map((event) => event.id);
  const killIds = events.filter((event) => event.type === "kill").map((event) => event.id);

  return {
    ok:
      exitCalls.length === 0 &&
      refreshCount === 2 &&
      startIds.length === 3 &&
      killIds.length === 2 &&
      activeChildId === 3,
    scenario: "restart",
    startCount: startIds.length,
    killCount: killIds.length,
    refreshCount,
    startIds,
    killIds,
    exitCalls,
    activeChildId
  };
}

async function runSelfTest() {
  const scenario = process.env.DEV_API_WATCH_SELF_TEST;
  if (scenario !== "restart") {
    throw new Error(`Unknown DEV_API_WATCH_SELF_TEST scenario: ${scenario}`);
  }

  process.stdout.write(`${JSON.stringify(await runRestartSelfTest(), null, 2)}\n`);
}

async function main() {
  if (process.env.DEV_API_WATCH_SELF_TEST) {
    await runSelfTest();
    return;
  }

  const watchDirs = await refreshWatchers(() => {
    runtime.scheduleRestart();
  });

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
    runtime.shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    runtime.shutdown("SIGTERM");
  });

  runtime.startChild();
}

main().catch((error) => {
  console.error("[dev:api] watcher bootstrap failed");
  console.error(error);
  process.exit(1);
});
