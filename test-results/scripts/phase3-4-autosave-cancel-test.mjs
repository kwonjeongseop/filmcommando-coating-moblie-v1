import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('docstamp_autosave', JSON.stringify({ docImage: null, placed: [{ id: 'x' }], docName: '취소전용', savedAt: Date.now() }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.dialog.sm .cf-title', { hasText: '이전 작업을 복원하시겠습니까?' }).waitFor({ state: 'visible' });
await page.locator('.dialog.sm .btn.ghost', { hasText: '취소' }).click();
await page.waitForTimeout(200);

const result = {
  autosaveKeyAfterCancel: await page.evaluate(() => localStorage.getItem('docstamp_autosave')),
  screenStateAfterCancel: await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2') || '{}').screen),
  captureScreenVisible: await page.locator('.capture').isVisible(),
  dialogGone: !(await page.locator('.dialog.sm').isVisible().catch(() => false)),
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
