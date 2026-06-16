import express from "express";
import { resolveServerConfig } from "./config";
import { createRoutes } from "./routes";
import { createJsonStorage } from "./storage";

const app = express();
const { host, port, storagePath } = resolveServerConfig();

app.use(express.json());
app.use("/api", createRoutes(createJsonStorage(storagePath)));

app.listen(port, host, () => {
  console.log(`Schedule API listening at http://${host}:${port}`);
});
