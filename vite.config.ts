import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['.trycloudflare.com'],
  },
  resolve: {
    alias: {
      // algosdk's `browser` field maps "." which Rolldown can't resolve. Pulled in via the widget's Wormhole deps.
      algosdk: fileURLToPath(new URL('./node_modules/algosdk/dist/esm/index.js', import.meta.url)),
    },
  },
})
