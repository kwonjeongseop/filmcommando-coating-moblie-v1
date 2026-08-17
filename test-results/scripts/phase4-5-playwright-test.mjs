import { chromium } from 'playwright';
import fs from 'node:fs';

const results = {};
const shotDir = 'C:/claude/filmcommando-coating-moblie-v1/test-results/screenshots';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const logs = [];
page.on('pageerror', (e) => logs.push(e.message));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// load sample doc -> open stamp popup -> new stamp -> draw tab
await page.getByText('재직증명서.jpg').click();
await page.locator('button[aria-label="도장"]').click();
await page.locator('.stamp-card.add').click();
await page.getByText('수기로 그리기').click();
await page.locator('canvas').first().waitFor({ state: 'visible' });

results.canvasSize = await page.evaluate(() => {
  const c = document.querySelectorAll('canvas')[0];
  return { width: c.width, height: c.height };
});

// draw a stroke across the drawing canvas (first canvas = draw layer per DOM order)
const canvasBox = await page.locator('canvas').first().boundingBox();
const cx = canvasBox.x + canvasBox.width / 2, cy = canvasBox.y + canvasBox.height / 2;
await page.mouse.move(cx - 60, cy - 40);
await page.mouse.down();
await page.mouse.move(cx, cy, { steps: 10 });
await page.mouse.move(cx + 60, cy + 40, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(150);

results.hasDrawingAfterStroke = await page.evaluate(() => {
  // detect non-white, non-fully-white pixel presence as a proxy for "something drawn"
  const c = document.querySelectorAll('canvas')[0];
  const ctx = c.getContext('2d');
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  for (let i = 0; i < data.length; i += 4) {
    if (!(data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250)) return true;
  }
  return false;
});

await page.screenshot({ path: `${shotDir}/phase4-5-drawing.png` });

// switch to square guide
await page.getByText('사각형').click();
await page.waitForTimeout(150);
await page.screenshot({ path: `${shotDir}/phase4-5-square.png` });

// register
await page.getByText('보관함에 등록').click();
await page.waitForTimeout(300);

const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')));
const entry = ls.library.find((s) => s.label === '수기 도장');
results.registeredEntry = entry ? { kind: entry.kind, label: entry.label, hasSrc: !!entry.src } : null;
results.dataUrlBytes = entry?.src ? entry.src.length : 0;
results.libraryLength = ls.library.length;

results.registeredImageDims = entry?.src ? await page.evaluate((src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
  img.onerror = () => resolve(null);
  img.src = src;
}), entry.src) : null;

// transparency check (background removed)
results.transparentPixelCheck = entry?.src ? await page.evaluate((src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let transparent = 0, total = 0;
    for (let i = 0; i < data.length; i += 4) { total++; if (data[i + 3] === 0) transparent++; }
    resolve({ total, transparent });
  };
  img.src = src;
}), entry.src) : null;

// reopen stamp popup to see it in the grid
await page.locator('button[aria-label="도장"]').click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${shotDir}/phase4-5-registered.png` });

results.pageErrors = logs;
fs.writeFileSync('C:/Users/kwonh/AppData/Local/Temp/claude/phase4-5-result.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

await browser.close();
