import { resolve } from "node:path";
import { resolveServerConfig } from "./config";
import { DEFAULT_STORAGE_PATH } from "./storage";
import {
  backupSqliteDatabase,
  checkSqliteDatabase,
  exportSqliteToJson,
  initSqliteDatabase,
  migrateJsonToSqlite
} from "./sqlite/maintenance";

const command = process.argv[2];
const config = resolveServerConfig();
const jsonPath = resolve(config.storagePath ?? DEFAULT_STORAGE_PATH);
const sqlitePath = resolve(config.sqlitePath ?? "data/schedule.db");
const backupPath = resolve(config.backupPath ?? "backups");

async function main() {
  if (command === "init") {
    console.log(await initSqliteDatabase({ sqlitePath }));
    return;
  }

  if (command === "migrate") {
    const report = await migrateJsonToSqlite({ jsonPath, sqlitePath, backupPath, overwrite: process.argv.includes("--overwrite") });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "export-json") {
    const exportPath = resolve("exports", `app-data-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}.json`);
    console.log(await exportSqliteToJson({ sqlitePath, exportPath }));
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
    console.error("Restore is not supported by this CLI yet; it is deferred to Task 6.");
    process.exitCode = 1;
    return;
  }

  console.error("Usage: tsx server/data-cli.ts <init|migrate|export-json|backup|check>");
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
