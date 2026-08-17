import { chromium } from 'playwright';
import fs from 'node:fs';

const results = {};
const shotDir = 'C:/claude/filmcommando-coating-moblie-v1/test-results/screenshots';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const logs = [];
page.on('console', (m) => logs.push(`[console:${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

// fresh localStorage state for this scenario
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// 1. load sample doc, place a stamp (settings.autosave defaults to true)
await page.getByText('재직증명서.jpg').click();
await page.locator('.appbar .apptitle').waitFor({ state: 'visible' });
await page.locator('button[aria-label="도장"]').click();
await page.locator('.stamp-card-label').first().click();
await page.getByRole('button', { name: '확인' }).click();
const box = await page.locator('.page').boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
results.step1_placedText = await page.locator('.appbar .appsub').innerText();

// 2. wait for the 30s autosave interval to fire and capture the toast
await page.waitForSelector('.toast', { timeout: 35000 });
results.step2_toastText = await page.locator('.toast').innerText();
await page.screenshot({ path: `${shotDir}/phase3-4-autosave-toast.png` });

const auto = await page.evaluate(() => {
  const raw = localStorage.getItem('docstamp_autosave');
  return { raw, bytes: raw ? new Blob([raw]).size : 0, parsed: raw ? JSON.parse(raw) : null };
});
results.autosaveKeyBytes = auto.bytes;
results.autosaveEntry = {
  hasDocImage: auto.parsed?.docImage !== undefined,
  placedLength: auto.parsed?.placed?.length,
  docName: auto.parsed?.docName,
  hasSavedAt: typeof auto.parsed?.savedAt === 'number',
};

// 3. reload -> restore dialog should appear
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.dialog.sm .cf-title', { hasText: '이전 작업을 복원하시겠습니까?' }).waitFor({ state: 'visible' });
results.step3_dialogVisible = true;
await page.screenshot({ path: `${shotDir}/phase3-4-autosave-dialog.png` });

// 4. confirm restore -> EditorScreen
await page.locator('.dialog.sm .btn.solid', { hasText: '복원' }).click();
await page.waitForTimeout(300);
results.step4_restoredTitle = await page.locator('.appbar .apptitle').innerText();
results.step4_restoredSub = await page.locator('.appbar .appsub').innerText();
await page.screenshot({ path: `${shotDir}/phase3-4-autosave-restored.png` });

// 5. sanity check: cancel path removes the autosave key (no screenshot required)
await page.evaluate(() => {
  localStorage.setItem('docstamp_autosave', JSON.stringify({ docImage: null, placed: [], docName: '취소테스트', savedAt: Date.now() }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.dialog.sm .cf-title', { hasText: '이전 작업을 복원하시겠습니까?' }).waitFor({ state: 'visible' });
await page.locator('.dialog.sm .btn.ghost', { hasText: '취소' }).click();
await page.waitForTimeout(200);
results.step5_afterCancelKey = await page.evaluate(() => localStorage.getItem('docstamp_autosave'));
results.step5_screenAfterCancel = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')).screen);

// 6. toggle autosave off -> key removed immediately
await page.locator('button[aria-label="도장"]').click().catch(() => {});
results.consoleLogs = logs.filter((l) => l.includes('pageerror'));

fs.writeFileSync('C:/Users/kwonh/AppData/Local/Temp/claude/phase3-4-autosave-result.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

await browser.close();
