import { chromium } from 'playwright';
import fs from 'node:fs';

const label = process.argv[2]; // 'before' | 'after'
const shotDir = 'C:/claude/filmcommando-coating-moblie-v1/test-results/screenshots';
const stampPath = 'C:/claude/filmcommando-coating-moblie-v1/test-results/scripts/phase4-1-test-stamp.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const logs = [];
page.on('pageerror', (e) => logs.push(e.message));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// load sample doc, open add-stamp sheet, upload tab
await page.getByText('재직증명서.jpg').click();
await page.locator('button[aria-label="도장"]').click();
await page.locator('.stamp-card.add').click();
await page.getByText('촬영 · 업로드').click();
await page.setInputFiles('input[type="file"]', stampPath);
await page.waitForTimeout(500); // allow FileReader + Image decode + canvas processing

// read the newly added library entry's src and analyze transparency
const analysis = await page.evaluate(async () => {
  const s = JSON.parse(localStorage.getItem('docstamp_v2'));
  const entry = s.library.find((x) => x.kind === 'image');
  if (!entry) return { found: false };
  const img = new Image();
  await new Promise((resolve) => { img.onload = resolve; img.src = entry.src; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let transparent = 0, total = 0;
  for (let i = 0; i < data.length; i += 4) { total++; if (data[i + 3] === 0) transparent++; }
  return { found: true, width: img.width, height: img.height, total, transparent, srcBytes: entry.src.length };
});

// place the stamp on the document and screenshot (AddStampSheet auto-closes after upload; reopen popup)
await page.locator('button[aria-label="도장"]').click();
await page.locator('.stamp-card-label', { hasText: '업로드' }).click();
await page.getByRole('button', { name: '확인' }).click();
const box = await page.locator('.page').boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
await page.waitForTimeout(200);
await page.screenshot({ path: `${shotDir}/phase4-1-${label}.png` });

const result = { label, analysis, pageErrors: logs };
fs.writeFileSync(`C:/Users/kwonh/AppData/Local/Temp/claude/phase4-1-${label}-result.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

await browser.close();
