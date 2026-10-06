import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { realpathSync } from "node:fs";
import path from "node:path";

// With a symlinked node_modules (e.g. a git worktree) fonts live outside the project root and Vite's
// dev server would answer 403 — allow the real location. In a normal checkout this equals the root.
const nodeModulesParent = (() => {
  try {
    return path.dirname(realpathSync(path.resolve(__dirname, "node_modules")));
  } catch {
    return __dirname;
  }
})();

// https://vitejs.dev/config/
export default defineConfig({
  // Set VITE_CACHE_DIR to keep the dep-optimiser cache out of node_modules (CI, shared/symlinked trees).
  cacheDir: process.env.VITE_CACHE_DIR || undefined,
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { host: true, port: 8080, strictPort: false, fs: { allow: [__dirname, nodeModulesParent] } },
  preview: { host: true, port: 4173 },
  build: {
    target: "es2020",
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          motion: ["framer-motion"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
