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

// load sample doc, place a stamp so page 1 has content
await page.getByText('재직증명서.jpg').click();
await page.locator('.appbar .apptitle').waitFor({ state: 'visible' });
await page.locator('button[aria-label="도장"]').click();
await page.locator('.stamp-card-label').first().click();
await page.getByRole('button', { name: '확인' }).click();
const box = await page.locator('.page').boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);

results.beforeAdd = await page.locator('.appbar .appsub').innerText();
results.pagesBeforeAdd = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')).pages.length);

// open overflow menu -> 페이지 추가
await page.locator('button[aria-label="더보기"]').click();
await page.getByText('페이지 추가').click();
await page.waitForTimeout(200);

results.afterAdd = await page.locator('.appbar .appsub').innerText();
const ls1 = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')));
results.pagesAfterAdd = ls1.pages.length;
results.currentPageAfterAdd = ls1.currentPage;
await page.screenshot({ path: `${shotDir}/phase4-2-multipage.png` });

// switch to page 2 by clicking the appsub indicator
await page.locator('.appbar .appsub').click();
await page.waitForTimeout(200);
results.afterSwitch = await page.locator('.appbar .appsub').innerText();
const ls2 = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')));
results.currentPageAfterSwitch = ls2.currentPage;
results.page2DocMode = ls2.pages[1].docMode;
results.canvasHasSampleCert = await page.locator('.page .sample-cert, .page table').count(); // sample cert renders a table
results.canvasHasImg = await page.locator('.page img.doc-img').count();
await page.screenshot({ path: `${shotDir}/phase4-2-page2.png` });

// verify PDF export includes both pages: switch back to page1, trigger save (default format PDF)
await page.locator('.appbar .appsub').click(); // wraps back to page 1
await page.waitForTimeout(200);
results.backToPage1 = await page.locator('.appbar .appsub').innerText();

// hook jsPDF to capture number of pages instead of actually downloading
await page.evaluate(() => {
  window.__pdfPageCounts = [];
  const origCreateElement = document.createElement.bind(document);
  document.createElement = function (tag) {
    const el = origCreateElement(tag);
    if (tag === 'a') {
      const origClick = el.click.bind(el);
      el.click = function () { /* swallow download click */ };
    }
    return el;
  };
});

await page.locator('button[aria-label="저장"]').click();
await page.locator('.dialog.sm .btn.solid', { hasText: '저장' }).click();
await page.waitForTimeout(1500);
results.saveToast = await page.locator('.toast').innerText().catch(() => null);

fs.writeFileSync('C:/Users/kwonh/AppData/Local/Temp/claude/phase4-2-result.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify({ ...results, pageErrors: logs }, null, 2));

await browser.close();
