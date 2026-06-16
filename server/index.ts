import express from "express";
import { resolveServerConfig } from "./config";
import { createRoutes } from "./routes";
import { createJsonStorage } from "./storage";

const app = express();
const { adminPassword, host, port, storagePath } = resolveServerConfig();

if (!adminPassword) {
  throw new Error("管理员密码未配置，请设置 SCHEDULE_ADMIN_PASSWORD 或 config/server.local.json");
}

app.use(express.json());
app.use("/api", createRoutes(createJsonStorage(storagePath), { adminPassword }));

app.listen(port, host, () => {
  console.log(`Schedule API listening at http://${host}:${port}`);
});
