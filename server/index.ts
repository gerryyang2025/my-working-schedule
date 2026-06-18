import express from "express";
import { resolveServerConfig } from "./config";
import { createRoutes } from "./routes";
import { createConfiguredStorage } from "./storage";

const app = express();
const config = resolveServerConfig();
const { adminPassword, host, port } = config;

if (!adminPassword) {
  throw new Error("管理员密码未配置，请设置 SCHEDULE_ADMIN_PASSWORD 或 config/server.local.json");
}

app.use(express.json());
app.use("/api", createRoutes(createConfiguredStorage(config), { adminPassword }));

app.listen(port, host, () => {
  console.log(`Schedule API listening at http://${host}:${port}`);
});
