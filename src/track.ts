/** What happens while learning, kept in this browser for later analysis (exported with progress):
 * quiz answers with what was offered, what was picked and how long it took, and light UI events. */
export type Ev = { t: number; e: string; [k: string]: unknown }

const KEY = 'kanly/events'
const MAX = 50_000  // the oldest go first; a few MB at most

let all: Ev[] | null = null
export function events(): Ev[] {
  if (!all) try { all = JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { all = [] }
  return all!
}

/* The log is one string of up to a few MB, and writing it out takes the longer the more there is in it. An event
must not hold up what caused it (a tooltip waited for the one before it to be logged), so the log is kept in memory
and written a moment later, when the browser is idle, and when the page is left. */
let unsaved: ReturnType<typeof setTimeout> | undefined
const write = () => {
  clearTimeout(unsaved)
  unsaved = undefined
  try { localStorage.setItem(KEY, JSON.stringify(all ?? [])) } catch {}
}
const idle: (f: () => void) => void = typeof requestIdleCallback === 'function' ? f => requestIdleCallback(f, { timeout: 5000 }) : f => f()
const writeSoon = () => { unsaved ??= setTimeout(() => idle(write), 2000) }
if (typeof document !== 'undefined') {
  const now = () => { if (unsaved !== undefined) write() }
  addEventListener('pagehide', now)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') now() })
}

/** Replace the log (an import, a reset): written at once. */
export function setEvents(evs: Ev[]) {
  all = evs.slice(-MAX)
  write()
}

/** Also sent to PostHog, when the build has a key (VITE_POSTHOG_KEY: the deployed site, not forks nor local dev). */
const KEY_PH = import.meta.env.VITE_POSTHOG_KEY as string | undefined
type Capture = (e: string, data: Record<string, unknown>) => void
let send: Capture | null = null
const waiting: [string, Record<string, unknown>][] = []  // events before the library has loaded

export function startAnalytics() {
  if (!KEY_PH) return
  // loaded after the first paint, in its own chunk
  import('posthog-js').then(({ default: ph }) => {
    ph.init(KEY_PH, {
      api_host: 'https://eu.i.posthog.com',
      persistence: 'localStorage',  // no cookies
      autocapture: false,  // the app's own events say more than raw clicks
      disable_session_recording: true,
      disable_surveys: true,
      capture_pageview: true,
    })
    send = (e, data) => ph.capture(e, data)
    waiting.splice(0).forEach(([e, d]) => send!(e, d))
  }).catch(() => {})
}

export const track = (e: string, data: Record<string, unknown> = {}) => {
  const log = events()
  log.push({ t: Date.now(), e, ...data })
  if (log.length > MAX) log.splice(0, log.length - MAX)
  writeSoon()
  if (KEY_PH) send ? send(e, data) : waiting.push([e, data])
}
