// Screenshots for review: node scripts/shots.mjs [url] [outdir]
// MU=N starts as someone who knew N kanji before (src/levels.ts).
// SEED=N marks the first N items of the learning order as learned (half known, half learning, some due).
// STEPS='[{"click":"sel"},{"key":"Enter"},{"shot":"name"}]'
import puppeteer from 'puppeteer-core'
import { mkdirSync, readFileSync } from 'fs'

const url = process.argv[2] ?? 'http://localhost:5201/'
const out = process.argv[3] ?? 'screenshots'
mkdirSync(out, { recursive: true })
const order = JSON.parse(readFileSync(new URL('../src/data/kanji.json', import.meta.url))).order

const W = Number(process.env.W ?? 1280)
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  defaultViewport: { width: W, height: Number(process.env.VH ?? 900) },
})
const page = await browser.newPage()
// count what would be spoken instead of speaking it
await page.evaluateOnNewDocument(() => {
  window.__spoken = []
  Object.defineProperty(window, 'speechSynthesis', { value: { speak: u => window.__spoken.push(u.text), cancel() {}, getVoices: () => [], addEventListener() {} } })
})
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: process.env.SCHEME ?? 'light' }])
const ids = order.slice(0, Number(process.env.SEED ?? 0))
await page.evaluateOnNewDocument((ids, mu) => {
  if (sessionStorage.getItem('seeded')) return
  sessionStorage.setItem('seeded', '1')
  localStorage.clear()
  const now = Date.now()
  const cards = Object.fromEntries(ids.map((id, i) => {
    const known = i < ids.length * 0.6
    return [id, { id, due: i % 7 === 0 ? now - 1000 : now + 86_400_000, step: known ? 2 : 0, ivl: known ? 3 : 0, ease: 2.5, reps: 3, lapses: 0 }]
  }))
  localStorage.setItem('kanly/v1', JSON.stringify({ cards, log: [], ...(mu !== undefined && { mu }) }))
}, ids, process.env.MU === undefined ? undefined : Number(process.env.MU))
page.on('pageerror', e => console.log('PAGE ERROR', e.message))
page.on('console', m => m.type() === 'error' && console.log('CONSOLE', m.text()))
await page.goto(url)
await page.waitForSelector('main')
let n = 0
const shot = async (name, full) => {
  await new Promise(r => setTimeout(r, 250))
  await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: !!full })
}
const pause = ms => new Promise(r => setTimeout(r, ms))

for (const step of JSON.parse(process.env.STEPS ?? '[{"shot":"start","full":true}]')) {
  if (step.goto) { await page.goto(new URL(step.goto, url).href); await page.waitForSelector('main') }
  if (step.key) { await page.keyboard.press(step.key); await pause(150) }
  if (step.type !== undefined) { await page.keyboard.type(step.type); await pause(150) }
  if (step.click) { await page.click(step.click); await pause(150) }
  if (step.clickText) {
    await page.evaluate(t => [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(t))?.click(), step.clickText)
    await pause(200)
  }
  if (step.hover) await page.hover(step.hover)
  if (step.mouse) { await page.mouse.move(...step.mouse); await pause(150) }
  if (step.scroll !== undefined) { await page.evaluate(y => (document.querySelector('.peek') ?? window).scrollTo(0, y), step.scroll); await pause(100) }
  if (step.wait) await pause(step.wait)
  if (step.spoken) console.log('spoken:', await page.evaluate(() => window.__spoken.join(' | ')))
  if (step.shot) await shot(step.shot, step.full)
}
await browser.close()
