import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    global: 'globalThis',
  },
  esbuild: {
    // Drop chatty logs from production bundles; keep warn/error for real diagnostics
    pure: ['console.log', 'console.debug', 'console.info'],
  },
  worker: {
    format: 'es'
  }
})
