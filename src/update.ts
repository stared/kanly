/// <reference types="vite-plugin-pwa/vanillajs" />
/** New versions: the service worker (vite.config.ts) keeps the app working offline and fetches a new version in the
 * background: at each start, whenever the app comes back to the front, and hourly while it stays open.
 * The new version takes over at once, but the page reloads into it only between cards, after progress is saved,
 * never in the middle of a question. */
import { registerSW } from 'virtual:pwa-register'

let pending = false

export function startUpdates() {
  if (!('serviceWorker' in navigator)) return
  registerSW({
    immediate: true,
    onNeedReload: () => { pending = true },
    onRegisteredSW: (_url, reg) => {
      if (!reg) return
      const check = () => { if (navigator.onLine) reg.update().catch(() => {}) }
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
      setInterval(check, 60 * 60 * 1000)
    },
  })
}

/** Call where reloading loses nothing: after progress is saved, between cards, on changing tabs. */
export function applyUpdate() {
  if (pending) location.reload()
}
