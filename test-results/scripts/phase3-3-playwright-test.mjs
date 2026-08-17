import { chromium } from 'playwright';
import fs from 'node:fs';

const results = {};
const shotDir = 'C:/claude/filmcommando-coating-moblie-v1/test-results/screenshots';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const logs = [];
page.on('console', (m) => logs.push(`[console:${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

// 1. load sample doc -> editor
await page.getByText('재직증명서.jpg').click();
await page.locator('.appbar .apptitle').waitFor({ state: 'visible' });
results.step1_editorLoaded = await page.locator('.appbar .apptitle').innerText();

// 2. place a stamp
await page.locator('button[aria-label="도장"]').click();
await page.locator('.stamp-card-label', { hasText: '인감 · 김민수' }).click();
await page.getByRole('button', { name: '확인' }).click();
const pageEl = page.locator('.page');
const box = await pageEl.boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.55);
results.step2_placedCountText = await page.locator('.appbar .appsub').innerText();

// 3. save via toolbar
await page.locator('button[aria-label="저장"]').click();
await page.locator('.dialog.sm .btn.solid').click();
await page.waitForTimeout(1200); // allow captureThumb() html2canvas + toast

results.step3_toast = await page.locator('.toast').innerText().catch(() => null);

const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')));
results.docsLength = ls.docs.length;
results.docsEntry = {
  name: ls.docs[0]?.name,
  stampCount: ls.docs[0]?.stampCount,
  hasThumbnail: !!ls.docs[0]?.thumbnail,
  thumbnailBytes: ls.docs[0]?.thumbnail ? Math.round(ls.docs[0].thumbnail.length * 3 / 4) : 0,
  hasDocImage: ls.docs[0]?.docImage !== undefined,
  placedLength: ls.docs[0]?.placed?.length,
};

// 4. navigate to docs screen
await page.locator('button[aria-label="전체 메뉴"]').click();
await page.getByText('내 서류함').click();
await page.locator('.appbar .apptitle', { hasText: '내 서류함' }).waitFor({ state: 'visible' });
results.step4_docsCount = await page.locator('.appbar .appsub').innerText();
await page.screenshot({ path: `${shotDir}/phase3-3-docs.png` });

// 5. click doc entry -> restore
await page.locator('.doc-row').first().click();
await page.waitForTimeout(300);
results.step5_restoredTitle = await page.locator('.appbar .apptitle').innerText();
results.step5_restoredSub = await page.locator('.appbar .appsub').innerText();
await page.screenshot({ path: `${shotDir}/phase3-3-restore.png` });

results.consoleLogs = logs;

fs.writeFileSync('C:/Users/kwonh/AppData/Local/Temp/claude/phase3-3-result.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

await browser.close();
