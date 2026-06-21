import { isAbsolute, resolve } from "node:path";
import { resolveServerConfig } from "./config";
import {
  backupSqliteDatabase,
  checkSqliteDatabase,
  initSqliteDatabase,
  resetSqliteDatabase,
  restoreSqliteBackup
} from "./sqlite/maintenance";

const command = process.argv[2];
const config = resolveServerConfig();
const sqlitePath = resolve(config.sqlitePath ?? "data/schedule.db");
const backupPath = resolve(config.backupPath ?? "backups");
const restoreGuidance = "Restore is a high-risk operation. Set CONFIRM_RESTORE=yes to continue.";
const resetGuidance = "Reset is a high-risk operation. Set CONFIRM_RESET=yes to continue.";
const invalidRestoreFilenameMessage = "restore backup filename must be a simple filename under backup path";

function resolveRestoreBackupFile(backupFile: string): string | null {
  if (backupFile === "/") {
    return null;
  }

  if (isAbsolute(backupFile)) {
    return backupFile;
  }

  if (backupFile === "." || backupFile === ".." || backupFile.includes("/") || backupFile.includes("\\")) {
    return null;
  }

  return resolve(backupPath, backupFile);
}

async function main() {
  if (command === "preflight") {
    console.log(
      JSON.stringify(
        {
          ok: true,
          command: "preflight",
          sqlitePath,
          backupPath
        },
        null,
        2
      )
    );
    return;
  }

  if (command === "init") {
    console.log(await initSqliteDatabase({ sqlitePath }));
    return;
  }

  if (command === "backup") {
    console.log(await backupSqliteDatabase({ sqlitePath, backupPath }));
    return;
  }

  if (command === "check") {
    const result = await checkSqliteDatabase({ sqlitePath });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "restore") {
    const backupFile = process.argv[3];
    if (!backupFile) {
      console.error("Usage: node --import tsx server/data-cli.ts restore <backup-file>");
      process.exitCode = 1;
      return;
    }
    if (process.env.CONFIRM_RESTORE !== "yes") {
      console.error(restoreGuidance);
      process.exitCode = 1;
      return;
    }
    const restoreBackupFile = resolveRestoreBackupFile(backupFile);
    if (!restoreBackupFile) {
      console.error(invalidRestoreFilenameMessage);
      process.exitCode = 1;
      return;
    }
    console.log(await restoreSqliteBackup({ sqlitePath, backupPath, backupFile: restoreBackupFile, confirm: true }));
    return;
  }

  if (command === "reset") {
    if (process.env.CONFIRM_RESET !== "yes") {
      console.error(resetGuidance);
      process.exitCode = 1;
      return;
    }
    const result = await resetSqliteDatabase({ sqlitePath, backupPath, confirm: true });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.error("Usage: node --import tsx server/data-cli.ts <preflight|init|backup|restore|reset|check>");
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
