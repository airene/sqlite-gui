import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteSingleFile } from "vite-plugin-singlefile";

// This config lives inside `web/`, so the Vite root is this directory (the
// default). `viteSingleFile` inlines all JS/CSS into a single
// `dist/index.html`, which we then embed into the Deno executable.
export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  server: {
    port: 5173,
    // Dev only: forward API calls to the local Deno server (see scripts/dev.js).
    proxy: { "/api": "http://localhost:8787" },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
