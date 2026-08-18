// Phase 14-1: 도장 선택 시 자동 확대(v0.1.9)로 핸들 겹침이 방지되는지 + 해제 후 저장 scale 보존 검증.
import { test, expect } from '@playwright/test';

async function loadEditor(page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('docstamp_v2', JSON.stringify({
      screen: 'editor',
      pages: [{ docMode: 'sample', docImage: null, placed: [] }],
      currentPage: 0, docName: '재직증명서', docs: [], recent: [], favId: null, settings: {},
    }));
  });
  await page.reload();
}

async function placeDefaultStamp(page) {
  await page.locator('button[aria-label="도장"]').click();
  await page.locator('.stamp-card-label').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  const pageBox = await page.locator('.page').boundingBox();
  await page.mouse.click(pageBox.x + pageBox.width * 0.5, pageBox.y + pageBox.height * 0.5);
  await page.waitForTimeout(150);
}

function rectsOverlap(a, b) {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

test.describe('Phase 14-1: 도장 선택 시 자동 확대', () => {
  test('기본 크기(0.10)로 배치해 선택한 도장의 핸들 4개가 서로 겹치지 않는다', async ({ page }) => {
    await loadEditor(page);
    await placeDefaultStamp(page);
    // 배치 직후 곧바로 선택된 상태이므로 별도 클릭 없이 핸들이 노출된다.
    const selectors = ['.h-del', '.h-lock', '.h-res', '.h-mn'];
    const boxes = {};
    for (const sel of selectors) boxes[sel] = await page.locator(sel).boundingBox();
    for (let i = 0; i < selectors.length; i++) {
      for (let j = i + 1; j < selectors.length; j++) {
        const a = boxes[selectors[i]], b = boxes[selectors[j]];
        expect(rectsOverlap(a, b), `${selectors[i]}(${JSON.stringify(a)}) vs ${selectors[j]}(${JSON.stringify(b)})`).toBe(false);
      }
    }
  });

  test('선택 해제하면 저장된 scale(0.10)은 그대로이고 화면 표시만 원래 크기로 돌아간다', async ({ page }) => {
    await loadEditor(page);
    await placeDefaultStamp(page);

    const placed = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')).pages[0].placed[0]);
    expect(placed.scale).toBeCloseTo(0.10, 2);

    const selectedWidth = (await page.locator('.placed').boundingBox()).width;

    // 빈 캔버스 영역을 클릭해 선택 해제.
    const canvasBox = await page.locator('.canvas').boundingBox();
    await page.mouse.click(canvasBox.x + canvasBox.width * 0.1, canvasBox.y + canvasBox.height * 0.1);
    await page.waitForTimeout(150);
    await expect(page.locator('.placed.sel')).toHaveCount(0);

    const deselectedWidth = (await page.locator('.placed').boundingBox()).width;
    expect(deselectedWidth).toBeLessThan(selectedWidth);

    const placedAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')).pages[0].placed[0]);
    expect(placedAfter.scale).toBeCloseTo(0.10, 2); // 저장값은 확대 여부와 무관하게 그대로 유지
  });
});
