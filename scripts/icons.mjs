// The app's icons for the home screen (public/icon-*.png, public/apple-touch-icon.png): 漢 as in the top bar.
// node scripts/icons.mjs
import puppeteer from 'puppeteer-core'

const sizes = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 }
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const page = await browser.newPage()
for (const [name, n] of Object.entries(sizes)) {
  await page.setViewport({ width: n, height: n })
  // full bleed: iOS rounds the corners itself, Android crops a circle from the middle 80%
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; width: ${n}px; height: ${n}px; display: grid; place-items: center; background: #faf8f4; color: #1d1c1a;
      font: ${Math.round(n * 0.62)}px/1 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif; }
  </style><span>漢</span>`)
  await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname })
}
await browser.close()
