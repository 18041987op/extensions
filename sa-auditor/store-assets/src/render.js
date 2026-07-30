const { chromium } = require('playwright-core');
const path = require('path');

const DIR = __dirname;
const OUT = path.join(DIR, 'out');
require('fs').mkdirSync(OUT, { recursive: true });

const jobs = [
  { file: 'icon.html',    w: 128,  h: 800, clip: { x: 0, y: 0, width: 128, height: 128 }, out: 'store-icon-128.png', png: true, transparent: true },
  { file: 'shot1.html',   w: 1280, h: 800, out: 'screenshot-1-sa-view.jpeg' },
  { file: 'shot2.html',   w: 1280, h: 800, out: 'screenshot-2-admin-view.jpeg' },
  { file: 'tile.html',    w: 440,  h: 280, out: 'small-promo-tile-440x280.jpeg' },
  { file: 'marquee.html', w: 1400, h: 560, out: 'marquee-1400x560.jpeg' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  for (const j of jobs) {
    const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
    await page.goto('file://' + path.join(DIR, j.file));
    await page.waitForTimeout(400);
    const opts = { path: path.join(OUT, j.out) };
    if (j.clip) opts.clip = j.clip;
    if (j.png) { opts.type = 'png'; if (j.transparent) opts.omitBackground = true; }
    else { opts.type = 'jpeg'; opts.quality = 95; }
    await page.screenshot(opts);
    console.log('OK', j.out);
    await page.close();
  }
  await browser.close();
})();
