import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { loadEnv } from "vite";
import process from "node:process";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target =
    process.env.API_PROXY_TARGET ||
    env.API_PROXY_TARGET ||
    "http://127.0.0.1:8080";
  return {
    base: "/",
    plugins: [vue()],
    test: { include: ["tests/**/*.test.ts"], environment: "node" },
    server: {
      host: "127.0.0.1",
      port: 5188,
      strictPort: true,
      proxy: { "/api/admin/v1": { target, changeOrigin: false } },
      watch: { ignored: ["**/.work/**", "**/output/**", "**/node_modules/**"] },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vue: ["vue", "vue-router", "pinia"],
            ui: ["element-plus"],
          },
        },
      },
    },
  };
});
