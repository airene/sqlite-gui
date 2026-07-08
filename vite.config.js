import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Vite 现在只负责前端；打包与窗口交给 Tauri。
export default defineConfig({
  plugins: [vue()],
  // Tauri 相关的约定：不要清屏、固定端口，方便 tauri dev 等待。
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
});
