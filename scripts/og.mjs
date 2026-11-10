// The social preview (public/og.png, 1200×630): one kanji and its parts, drawn as in the graph tab.
// node scripts/og.mjs [kanji]   — the story and the parts come from the data, nothing is written here.
import puppeteer from 'puppeteer-core'
import { mkdirSync, readFileSync } from 'fs'

const el = process.argv[2] ?? '侵'
const { kanji } = JSON.parse(readFileSync(new URL('../src/data/kanji.json', import.meta.url)))
const k = kanji[el]
const parts = k.tree.kids.map(p => p.el)

const W = 1200, H = 630
const R = 46, X = 120, BIG = 118, TX = 452, TY = H / 2
const gap = Math.min(128, (H - 110) / parts.length)
const ys = parts.map((_, i) => TY + (i - (parts.length - 1) / 2) * gap)
// an arrow leaves a part level and arrives at the whole along its radius
const arrow = y => {
  const a = Math.atan2(y - TY, X - TX), ex = TX + Math.cos(a) * (BIG + 16), ey = TY + Math.sin(a) * (BIG + 16)
  const sx = X + R + 4
  return `M${sx},${y}C${sx + 110},${y} ${ex + Math.cos(a) * 90},${ey + Math.sin(a) * 90} ${ex},${ey}`
}
// the glyphs of the story stand out from its words
const story = k.story.replace(/[⺀-鿿]/g, c => `<b>${c}</b>`)

const html = `<!doctype html><meta charset="utf-8"><style>
  :root { --paper: #faf8f4; --card: #fff; --ink: #1d1c1a; --muted: #8f8a80; --faint: #e3ded4; --accent: #c8402f;
    --jp: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', system-ui, sans-serif; }
  body { margin: 0; width: ${W}px; height: ${H}px; background: var(--paper); color: var(--ink); font-family: system-ui, sans-serif; position: relative; overflow: hidden; }
  svg { position: absolute; inset: 0; }
  circle { fill: var(--card); stroke: var(--muted); stroke-width: 2.5; }
  .part circle { stroke-dasharray: 3 6; stroke-linecap: round; }
  .whole circle { fill: var(--ink); stroke: var(--ink); }
  text { font-family: var(--jp); fill: var(--ink); text-anchor: middle; }
  .whole text { fill: var(--paper); }
  .link { fill: none; stroke: var(--muted); stroke-width: 2.5; }
  marker path { fill: var(--muted); }
  .txt { position: absolute; left: 640px; right: 64px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; }
  h1 { font-size: 92px; font-weight: 600; letter-spacing: -2px; margin: 0; line-height: 1; }
  .tag { font-size: 38px; margin: 14px 0 0; color: var(--ink); }
  .rule { width: 64px; height: 4px; background: var(--accent); margin: 40px 0 28px; }
  .kw { font-size: 30px; margin: 0 0 10px; } .kw b { font: 400 36px var(--jp); margin-right: 10px; }
  .story { font-size: 28px; line-height: 1.45; color: var(--muted); margin: 0; }
  .story b { font: 400 30px var(--jp); color: var(--ink); }
</style>
<svg width="${W}" height="${H}">
  <defs><marker id="arrow" viewBox="0 0 8 8" refX="1" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,1L7,4L0,7z" /></marker></defs>
  ${ys.map(y => `<path class="link" d="${arrow(y)}" marker-end="url(#arrow)" />`).join('')}
  ${parts.map((p, i) => `<g class="${kanji[p] ? '' : 'part'}" transform="translate(${X},${ys[i]})"><circle r="${R}" /><text font-size="${R * 1.15}" dy=".36em">${p}</text></g>`).join('')}
  <g class="whole" transform="translate(${TX},${TY})"><circle r="${BIG}" /><text font-size="${BIG * 1.15}" dy=".36em">${el}</text></g>
</svg>
<div class="txt">
  <h1>Kanly</h1>
  <p class="tag">learn kanji from their parts</p>
  <div class="rule"></div>
  <p class="kw"><b>${el}</b>${k.keyword}</p>
  <p class="story">${story}</p>
</div>`

mkdirSync(new URL('../public/', import.meta.url), { recursive: true })
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  defaultViewport: { width: W, height: H },
})
const page = await browser.newPage()
await page.setContent(html)
await page.screenshot({ path: new URL('../public/og.png', import.meta.url).pathname })
await browser.close()
