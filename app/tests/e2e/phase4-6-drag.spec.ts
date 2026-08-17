// Phase 4-6: 도장 본체 드래그 · 스냅 가이드 · 핀치줌/회전 E2E.
import { test, expect } from '@playwright/test';

async function placeStamp(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByText('재직증명서.jpg').click();
  await page.locator('button[aria-label="도장"]').click();
  await page.locator('.stamp-card-label').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  const pageBox = await page.locator('.page').boundingBox();
  await page.mouse.click(pageBox.x + pageBox.width * 0.2, pageBox.y + pageBox.height * 0.2);
  await page.waitForTimeout(150);
  return pageBox;
}

async function readPlaced(page) {
  const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2') || '{}'));
  return ls.pages[ls.currentPage].placed[0];
}

test.describe('Phase 4-6: 도장 드래그 · 핀치줌 · 회전', () => {
  test('핸들 없이 본체를 눌러 바로 드래그 이동할 수 있다', async ({ page }) => {
    const pageBox = await placeStamp(page);
    const before = await readPlaced(page);

    const placedBox = await page.locator('.placed').boundingBox();
    const from = { x: placedBox.x + placedBox.width / 2, y: placedBox.y + placedBox.height / 2 };
    const to = { x: pageBox.x + pageBox.width * 0.75, y: pageBox.y + pageBox.height * 0.30 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const after = await readPlaced(page);
    expect(after.x).not.toBeCloseTo(before.x, 0);
    expect(after.y).not.toBeCloseTo(before.y, 0);
    await expect(page.locator('.placed.sel')).toBeVisible();
  });

  test('캔버스 중앙 근접 시 스냅 가이드라인이 표시되고 정확히 50%로 스냅된다', async ({ page }) => {
    const pageBox = await placeStamp(page);
    const placedBox = await page.locator('.placed').boundingBox();
    const from = { x: placedBox.x + placedBox.width / 2, y: placedBox.y + placedBox.height / 2 };
    const center = { x: pageBox.x + pageBox.width * 0.5, y: pageBox.y + pageBox.height * 0.5 };

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + center.x) / 2, (from.y + center.y) / 2, { steps: 6 });
    await page.mouse.move(center.x + 2, center.y + 2, { steps: 6 });
    await expect(page.locator('.snap-guide-v')).toBeVisible();
    await page.mouse.up();
    await page.waitForTimeout(150);

    const after = await readPlaced(page);
    expect(after.x).toBeCloseTo(50, 0);
  });

  test('두 손가락 핀치 제스처로 scale이 변하고 rot은 0으로 고정된다', async ({ page, context }) => {
    await placeStamp(page);
    const placedBox = await page.locator('.placed').boundingBox();
    const c = { x: placedBox.x + placedBox.width / 2, y: placedBox.y + placedBox.height / 2 };
    const before = await readPlaced(page);

    const cdp = await context.newCDPSession(page);
    const dispatch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y })),
    });

    await dispatch('touchStart', [{ x: c.x - 10, y: c.y }, { x: c.x + 10, y: c.y }]);
    await page.waitForTimeout(50);
    const rad = (30 * Math.PI) / 180, half = 30;
    await dispatch('touchMove', [
      { x: c.x - half * Math.cos(rad), y: c.y - half * Math.sin(rad) },
      { x: c.x + half * Math.cos(rad), y: c.y + half * Math.sin(rad) },
    ]);
    await page.waitForTimeout(100);
    await dispatch('touchEnd', []);
    await page.waitForTimeout(150);

    const after = await readPlaced(page);
    expect(after.scale).toBeGreaterThan(before.scale * 2.5); // 20px→60px, 3배 확대 기대
    expect(after.rot).toBe(0); // 회전 기능 제거 — 항상 0 고정
  });

  test('제스처 이후 되돌리기(undo)로 직전 상태가 복원된다', async ({ page, context }) => {
    await placeStamp(page);
    const placedBox = await page.locator('.placed').boundingBox();
    const c = { x: placedBox.x + placedBox.width / 2, y: placedBox.y + placedBox.height / 2 };

    const cdp = await context.newCDPSession(page);
    const dispatch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y })),
    });
    await dispatch('touchStart', [{ x: c.x - 10, y: c.y }, { x: c.x + 10, y: c.y }]);
    await dispatch('touchMove', [{ x: c.x - 30, y: c.y }, { x: c.x + 30, y: c.y }]);
    await page.waitForTimeout(100);
    await dispatch('touchEnd', []);
    await page.waitForTimeout(150);
    const beforeUndo = await readPlaced(page);

    await page.locator('button[aria-label="전단계"]').click();
    await page.waitForTimeout(100);
    const afterUndo = await readPlaced(page);

    expect(afterUndo.scale).not.toBeCloseTo(beforeUndo.scale, 2);
    expect(afterUndo.scale).toBeCloseTo(0.6, 2); // 도장 초기 크기 축소(DEFAULT_SETTINGS.size=0.6) 반영
  });
});
