/** Light, dark, or as the system says; kept in this browser. */
export type Theme = 'system' | 'light' | 'dark'
const KEY = 'kanly/theme'

export function loadTheme(): Theme {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'system' } catch { return 'system' }
}

export function applyTheme(t: Theme) {
  const root = document.documentElement
  if (t === 'system') root.removeAttribute('data-theme')
  else root.dataset.theme = t
  try { t === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, t) } catch {}
  // the browser's own bar (and the installed app's) follows the page
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#171614' : '#faf8f4')
}
