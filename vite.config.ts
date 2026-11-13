import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Fixed port: progress lives in localStorage, which is per origin (port included).
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/kanly/' : '/',  // preview serves the build as the site does
  plugins: [react(), VitePWA({
    // installable on a phone, and working offline: everything, the data too, is kept by a service worker.
    // A new version is fetched in the background and applied between cards (src/update.ts), not mid-question.
    registerType: 'autoUpdate',
    injectRegister: false,
    includeAssets: ['apple-touch-icon.png'],  // the manifest's own icons are added by the plugin
    manifest: {
      name: 'Kanly: learn kanji from their parts',
      short_name: 'Kanly',
      description: 'Learn Japanese kanji from their parts, with mnemonics and spaced repetition.',
      lang: 'en',
      display: 'standalone',
      background_color: '#faf8f4',
      theme_color: '#faf8f4',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html}'],
      maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,  // the kanji data is one ~5 MB chunk
      cleanupOutdatedCaches: true,
      skipWaiting: true,  // a new version takes over at once (set by hand: the plugin does it only with its own register script)
      clientsClaim: true,
    },
  })],
  server: { port: 5201, strictPort: true },
  // whole-data tests (every kanji quizzed, placements simulated) take seconds, more on CI runners
  test: { testTimeout: 60_000 },
}))
