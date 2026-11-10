// The social preview (public/og.png, 1200×630): one kanji and its parts, drawn as in the graph tab.
// node scripts/og.mjs [kanji]   — the story and the parts come from the data, nothing is written here.
// W=1280 H=640 OUT=screenshots/github-social.png for the repository's preview on GitHub (uploaded by hand in its settings).
import puppeteer from 'puppeteer-core'
import { mkdirSync, readFileSync } from 'fs'
import { dirname } from 'path'

const el = process.argv[2] ?? '侵'
const { kanji } = JSON.parse(readFileSync(new URL('../src/data/kanji.json', import.meta.url)))
const k = kanji[el]
const parts = k.tree.kids.map(p => p.el)

const W = Number(process.env.W ?? 1200), H = Number(process.env.H ?? 630), DX = (W - 1200) / 2  // wider: the same picture, centred
// one margin M all around and between the picture and the text; the text spans the height of the column of parts,
// its three groups (name, kanji, words) evenly apart, G between the lines of a group
const M = 76, G = 12
const R = 46, X = M + R + DX, BIG = 118, TX = 452 + DX, TY = H / 2
const gap = (H - 2 * M - 2 * R) / Math.max(1, parts.length - 1)
const ys = parts.map((_, i) => TY + (i - (parts.length - 1) / 2) * gap)
// readings and words as on the card: each reading with its share among the words, okurigana and rare readings muted;
// in a word the kanji itself in the accent, its reading above
const readings = k.readings.map(({ r, share }) => {
  const [stem, oku] = r.replace(/^-|-$/g, '').split('.')
  return `<span class="rd${share < 0.05 ? ' rare' : ''}${r === k.alone?.reading ? ' alone' : ''}">${stem}${oku ? `<span class="oku">${oku}</span>` : ''}${share >= 0.01 ? `<span class="pct">${Math.round(share * 100)}%</span>` : ''}</span>`
}).join('')
const words = k.words.slice(0, 2).map(w =>
  `<span class="w">${w.furigana.map(([part, r]) => r ? `<ruby class="${part === el ? 'me' : ''}">${part}<rt>${r}</rt></ruby>` : part).join('')}</span><span class="wg">${w.g.split(';')[0]}${w.lit ? `<i>${w.lit}</i>` : ''}</span>`).join('')
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
  .txt { position: absolute; left: ${TX + BIG + M}px; right: ${M + DX}px; top: ${M}px; bottom: ${M}px; display: flex; flex-direction: column; justify-content: space-between; }
  p { margin: 0; }
  h1 { font-size: 92px; font-weight: 600; letter-spacing: -2px; margin: -12px 0 0 -4px; line-height: 1; }
  .tag { font-size: 38px; line-height: 1.2; margin-top: ${G}px; }
  .kw { font-size: 30px; line-height: 1.2; display: flex; align-items: baseline; } .kw b { font: 400 36px var(--jp); margin-right: 10px; }
  .readings { margin-left: 30px; display: flex; gap: 22px; align-items: baseline; font: 30px var(--jp); }
  .rd.rare, .oku { color: var(--muted); } .rd.alone, .rd.alone .oku { color: var(--accent); }
  .pct { font: 17px system-ui, sans-serif; color: var(--muted); margin-left: 5px; }
  .words { display: grid; grid-template-columns: max-content 1fr; column-gap: 22px; row-gap: ${G}px; align-items: baseline; margin-bottom: -6px; }
  .w { font: 34px/1.55 var(--jp); white-space: nowrap; } rt { font-size: 14px; color: var(--muted); } .me { color: var(--accent); }
  .wg { font-size: 24px; } .wg i { margin-left: 14px; color: var(--muted); opacity: .75; }
  .story { font-size: 28px; line-height: 1.4; color: var(--muted); margin-top: ${G}px; }
  .story b { font: 400 30px var(--jp); color: var(--ink); }
</style>
<svg width="${W}" height="${H}">
  <defs><marker id="arrow" viewBox="0 0 8 8" refX="1" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,1L7,4L0,7z" /></marker></defs>
  ${ys.map(y => `<path class="link" d="${arrow(y)}" marker-end="url(#arrow)" />`).join('')}
  ${parts.map((p, i) => `<g class="${kanji[p] ? '' : 'part'}" transform="translate(${X},${ys[i]})"><circle r="${R}" /><text font-size="${R * 1.15}" dy=".36em">${p}</text></g>`).join('')}
  <g class="whole" transform="translate(${TX},${TY})"><circle r="${BIG}" /><text font-size="${BIG * 1.15}" dy=".36em">${el}</text></g>
</svg>
<div class="txt">
  <div><h1>Kanly</h1><p class="tag">learn kanji from their parts</p></div>
  <div><p class="kw"><b>${el}</b>${k.keyword}<span class="readings">${readings}</span></p><p class="story">${story}</p></div>
  <div class="words">${words}</div>
</div>`

const out = process.env.OUT ?? new URL('../public/og.png', import.meta.url).pathname
mkdirSync(dirname(out), { recursive: true })
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  defaultViewport: { width: W, height: H },
})
const page = await browser.newPage()
await page.setContent(html)
await page.screenshot({ path: out })
await browser.close()
