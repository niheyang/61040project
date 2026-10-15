import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [vue()],
  server: {
    host: "127.0.0.1",
    port: 8080,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
