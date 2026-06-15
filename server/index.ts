import express from "express";
import { createRoutes } from "./routes";
import { createJsonStorage } from "./storage";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json());
app.use("/api", createRoutes(createJsonStorage()));

app.listen(port, "127.0.0.1", () => {
  console.log(`Schedule API listening at http://127.0.0.1:${port}`);
});
