import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.PORT) || 8787;
const apiTarget = process.env.VITE_API_URL || `http://localhost:${apiPort}`;

export default defineConfig({
  root: "src",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: { outDir: "../dist", emptyOutDir: true },
});
