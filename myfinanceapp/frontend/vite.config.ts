import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { existsSync } from 'node:fs'

const fastEqualsEsm = fileURLToPath(
  new URL('./node_modules/fast-equals/dist/esm/index.mjs', import.meta.url)
)
const fastEqualsEs = fileURLToPath(
  new URL('./node_modules/fast-equals/dist/es/index.mjs', import.meta.url)
)
const fastEqualsEntry = existsSync(fastEqualsEsm) ? fastEqualsEsm : fastEqualsEs

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Work around inconsistent fast-equals package layouts.
    // Some installs ship `dist/es/*` while others ship `dist/esm/*`.
    alias: {
      'fast-equals': fastEqualsEntry,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-recharts': ['recharts'],
          'vendor-nivo': ['@nivo/core', '@nivo/pie', '@nivo/sunburst', '@nivo/sankey'],
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-select',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-toast',
            '@radix-ui/react-label',
            '@radix-ui/react-portal',
          ],
          'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
