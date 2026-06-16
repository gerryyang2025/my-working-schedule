import vue from "@vitejs/plugin-vue";
import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  server: {
    proxy: {
      "/api": apiProxyTarget
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    exclude: [...configDefaults.exclude, "tests/e2e/**"]
  }
});
