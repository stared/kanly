import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Fixed port: progress lives in localStorage, which is per origin (port included).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/kanly/' : '/',
  plugins: [react()],
  server: { port: 5201, strictPort: true },
  // whole-data tests (every kanji quizzed, placements simulated) take seconds, more on CI runners
  test: { testTimeout: 60_000 },
}))
