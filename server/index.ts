import express from "express";
import { createRoutes } from "./routes";
import { createJsonStorage } from "./storage";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const storagePath = process.env.SCHEDULE_DATA_PATH;

app.use(express.json());
app.use("/api", createRoutes(createJsonStorage(storagePath)));

app.listen(port, "127.0.0.1", () => {
  console.log(`Schedule API listening at http://127.0.0.1:${port}`);
});
