import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds straight into ../public — the Express server (src/server.ts)
// already does `express.static("public")` and needs no changes. Dev mode
// proxies /api and /webhooks to the backend (npm run dev, port from .env,
// default 3000/3001) so the same fetch("/api/...") calls work unchanged.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/webhooks": "http://localhost:3000",
    },
  },
});
