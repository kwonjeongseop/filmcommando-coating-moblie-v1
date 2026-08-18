// Phase 14-1(v0.2.0 개정): 배치 직후에는 자동 선택하지 않아 실제 크기(0.10)로 보이고, 사용자가
// 탭해서 재선택하면 MIN_SEL_SCALE로 확대되어 핸들이 겹치지 않는지 검증.
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

test.describe('Phase 14-1: 배치 직후 실제 크기 + 재선택 시 확대', () => {
  test('배치 직후에는 자동 선택되지 않고 실제 크기(0.10)로 표시된다', async ({ page }) => {
    await loadEditor(page);
    await placeDefaultStamp(page);
    await expect(page.locator('.placed.sel')).toHaveCount(0);
    const width = (await page.locator('.placed').boundingBox()).width;
    expect(width).toBeCloseTo(94 * 0.10, 0);
  });

  test('배치 모드는 항상 종료되어 이후 탭이 새 도장을 계속 찍지 않는다', async ({ page }) => {
    await loadEditor(page);
    await placeDefaultStamp(page);
    const pageBox = await page.locator('.page').boundingBox();
    // 배치 직후 다른 빈 영역을 한 번 더 탭해도(예: 실수로) 새 도장이 추가로 찍히면 안 된다.
    await page.mouse.click(pageBox.x + pageBox.width * 0.1, pageBox.y + pageBox.height * 0.1);
    await page.waitForTimeout(150);
    await expect(page.locator('.placed')).toHaveCount(1);
  });

  test('도장을 탭해서 선택하면 MIN_SEL_SCALE로 확대되어 핸들 4개가 겹치지 않는다', async ({ page }) => {
    await loadEditor(page);
    await placeDefaultStamp(page);
    await page.locator('.placed').click();
    await expect(page.locator('.placed.sel')).toBeVisible();

    const selectedWidth = (await page.locator('.placed').boundingBox()).width;
    expect(selectedWidth).toBeCloseTo(94 * 0.22, 0); // MIN_SEL_SCALE=0.22 적용 확인

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

  test('선택 해제하면 저장된 scale(0.10)은 그대로이고 화면 표시만 실제 크기로 돌아간다', async ({ page }) => {
    await loadEditor(page);
    await placeDefaultStamp(page);
    await page.locator('.placed').click();
    await expect(page.locator('.placed.sel')).toBeVisible();
    const selectedWidth = (await page.locator('.placed').boundingBox()).width;

    const canvasBox = await page.locator('.canvas').boundingBox();
    await page.mouse.click(canvasBox.x + canvasBox.width * 0.1, canvasBox.y + canvasBox.height * 0.15);
    await page.waitForTimeout(150);
    await expect(page.locator('.placed.sel')).toHaveCount(0);

    const deselectedWidth = (await page.locator('.placed').boundingBox()).width;
    expect(deselectedWidth).toBeLessThan(selectedWidth);

    const placedAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')).pages[0].placed[0]);
    expect(placedAfter.scale).toBeCloseTo(0.10, 2); // 저장값은 확대 여부와 무관하게 그대로 유지
  });
});
