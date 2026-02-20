import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the app works at any ingress prefix (Issue #5 fix)
  base: './',
})
