import { chromium } from 'playwright';
import fs from 'node:fs';

const results = {};
const shotDir = 'C:/claude/filmcommando-coating-moblie-v1/test-results/screenshots';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, hasTouch: true });
const logs = [];
page.on('pageerror', (e) => logs.push(e.message));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

await page.getByText('재직증명서.jpg').click();
await page.locator('button[aria-label="도장"]').click();
await page.locator('.stamp-card-label').first().click();
await page.getByRole('button', { name: '확인' }).click();
const pageBox = await page.locator('.page').boundingBox();
await page.mouse.click(pageBox.x + pageBox.width * 0.2, pageBox.y + pageBox.height * 0.2);
await page.waitForTimeout(150);

let ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')));
results.beforeDrag = { x: ls.pages[ls.currentPage].placed[0].x, y: ls.pages[ls.currentPage].placed[0].y };

// === 1. body drag-to-move — use the placed element's actual on-screen box, not recomputed percentages ===
let placedBox = await page.locator('.placed').boundingBox();
const from1 = { x: placedBox.x + placedBox.width / 2, y: placedBox.y + placedBox.height / 2 };
const to1 = { x: pageBox.x + pageBox.width * 0.75, y: pageBox.y + pageBox.height * 0.30 };
await page.mouse.move(from1.x, from1.y);
await page.mouse.down();
await page.mouse.move((from1.x + to1.x) / 2, (from1.y + to1.y) / 2, { steps: 6 });
await page.mouse.move(to1.x, to1.y, { steps: 6 });
await page.screenshot({ path: `${shotDir}/phase4-6-drag.png` });
await page.mouse.up();
await page.waitForTimeout(150);

ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')));
let inst = ls.pages[ls.currentPage].placed[0];
results.afterDrag = { x: inst.x, y: inst.y };
results.isSelectedAfterBodyDrag = await page.evaluate(() => !!document.querySelector('.placed.sel'));

// === 2. snap guide near canvas center ===
placedBox = await page.locator('.placed').boundingBox();
const from2 = { x: placedBox.x + placedBox.width / 2, y: placedBox.y + placedBox.height / 2 };
const centerPx = { x: pageBox.x + pageBox.width * 0.5, y: pageBox.y + pageBox.height * 0.5 };
await page.mouse.move(from2.x, from2.y);
await page.mouse.down();
await page.mouse.move((from2.x + centerPx.x) / 2, (from2.y + centerPx.y) / 2, { steps: 6 });
await page.mouse.move(centerPx.x + 2, centerPx.y + 2, { steps: 6 }); // 임계값(5%) 이내로 접근
await page.waitForTimeout(100);
results.snapGuideVisible = await page.evaluate(() => ({
  v: !!document.querySelector('.snap-guide-v'),
  h: !!document.querySelector('.snap-guide-h'),
}));
await page.screenshot({ path: `${shotDir}/phase4-6-snap.png` });
await page.mouse.up();
await page.waitForTimeout(150);

ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')));
inst = ls.pages[ls.currentPage].placed[0];
results.afterSnap = { x: inst.x, y: inst.y };
results.canUndoAfterDrags = await page.evaluate(() => !document.querySelector('button[aria-label="전단계"]').disabled);

// === 3. pinch-to-zoom + rotate via CDP touch dispatch ===
const cdp = await page.context().newCDPSession(page);
placedBox = await page.locator('.placed').boundingBox();
const stampCenter = { x: placedBox.x + placedBox.width / 2, y: placedBox.y + placedBox.height / 2 };
results.scaleBeforePinch = inst.scale;
results.rotBeforePinch = inst.rot;

const dispatch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
  type,
  touchPoints: points.map((p) => ({ x: p.x, y: p.y })),
});

await dispatch('touchStart', [
  { x: stampCenter.x - 10, y: stampCenter.y },
  { x: stampCenter.x + 10, y: stampCenter.y },
]);
await page.waitForTimeout(50);
const rad = (30 * Math.PI) / 180;
const half = 30;
await dispatch('touchMove', [
  { x: stampCenter.x - half * Math.cos(rad), y: stampCenter.y - half * Math.sin(rad) },
  { x: stampCenter.x + half * Math.cos(rad), y: stampCenter.y + half * Math.sin(rad) },
]);
await page.waitForTimeout(100);
await page.screenshot({ path: `${shotDir}/phase4-6-pinch.png` });
await dispatch('touchEnd', []);
await page.waitForTimeout(150);

ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')));
inst = ls.pages[ls.currentPage].placed[0];
results.scaleAfterPinch = inst.scale;
results.rotAfterPinch = inst.rot;

// undo sanity: revert once and confirm position changes back
const beforeUndo = { ...inst };
await page.locator('button[aria-label="전단계"]').click();
await page.waitForTimeout(100);
ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')));
results.afterOneUndo = { ...ls.pages[ls.currentPage].placed[0] };
results.undoChangedState = JSON.stringify(beforeUndo) !== JSON.stringify(results.afterOneUndo);

results.pageErrors = logs;
fs.writeFileSync('C:/Users/kwonh/AppData/Local/Temp/claude/phase4-6-result.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

await browser.close();
