// Phase 7-2: 문서 배경 zoom 변경 시 도장 화면 크기가 비례해 따라가는지 E2E (잠금 여부 무관).
import { test, expect } from '@playwright/test';

async function placeStamp(page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    // v0.1.6: 홈 화면 "최근 서류"가 실제 저장 문서만 표시하도록 바뀌어(app.jsx CaptureScreen)
    // 예전처럼 "재직증명서.jpg" 항목을 클릭할 수 없다 — 동일한 샘플 문서 상태를 직접 시드한다.
    localStorage.setItem('docstamp_v2', JSON.stringify({
      screen: 'editor',
      pages: [{ docMode: 'sample', docImage: null, placed: [] }],
      currentPage: 0, docName: '재직증명서', docs: [], recent: [], favId: null, settings: {},
    }));
  });
  await page.reload();
  await page.locator('button[aria-label="도장"]').click();
  await page.locator('.stamp-card-label').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  const pageBox = await page.locator('.page').boundingBox();
  await page.mouse.click(pageBox.x + pageBox.width * 0.5, pageBox.y + pageBox.height * 0.5);
  await page.waitForTimeout(150);
}

async function setZoom200(page) {
  await page.locator('button[aria-label="돋보기"]').click();
  for (let i = 0; i < 5; i++) await page.locator('.zoombar .rbtn').nth(1).click(); // + 버튼 5회 = 100%→200%
  await expect(page.locator('.zoom-val')).toHaveText('200%');
}

test.describe('Phase 7-2: 도장 크기와 문서 zoom 연동', () => {
  test('배경을 확대하면 도장도 같은 비율로 커진다', async ({ page }) => {
    await placeStamp(page);
    const before = await page.locator('.placed').boundingBox();
    await setZoom200(page);
    const after = await page.locator('.placed').boundingBox();
    expect(after.width).toBeCloseTo(before.width * 2, 0);
    expect(after.height).toBeCloseTo(before.height * 2, 0);
  });

  test('잠긴 도장도 배경 확대·축소에 비례해 화면 크기가 따라간다', async ({ page }) => {
    await placeStamp(page);
    await page.locator('.h-lock').click(); // 잠금 — 리사이즈만 막힐 뿐 zoom 연동 렌더링은 그대로여야 함
    await expect(page.locator('.h-lock')).toHaveText('🔒');
    const before = await page.locator('.placed').boundingBox();

    await setZoom200(page);
    const zoomedIn = await page.locator('.placed').boundingBox();
    expect(zoomedIn.width).toBeCloseTo(before.width * 2, 0);

    await page.locator('.zoombar .btn.ghost.sm').click(); // 맞춤(100%) 버튼으로 복귀
    await expect(page.locator('.zoom-val')).toHaveText('100%');
    const backTo1x = await page.locator('.placed').boundingBox();
    expect(backTo1x.width).toBeCloseTo(before.width, 0);
  });

  test('zoom 2배 상태에서 리사이즈 후 zoom 1배로 복귀해도 화면 크기가 저장된 scale과 일관된다', async ({ page }) => {
    await placeStamp(page);
    await setZoom200(page);
    const handle = page.locator('.h-res');
    const placedBox = await page.locator('.placed').boundingBox();
    const handleBox = await handle.boundingBox();
    const center = { x: placedBox.x + placedBox.width / 2, y: placedBox.y + placedBox.height / 2 };
    const from = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };
    const to = { x: center.x + (from.x - center.x) * 1.5, y: center.y + (from.y - center.y) * 1.5 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const atZoom2 = await page.locator('.placed').boundingBox();
    const scaleAfterResize = (await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')).pages[0].placed[0])).scale;

    await page.locator('.zoombar .btn.ghost.sm').click(); // 100%로 복귀
    await expect(page.locator('.zoom-val')).toHaveText('100%');
    const atZoom1 = await page.locator('.placed').boundingBox();

    // zoom이 2배에서 1배로 절반이 됐으므로, 렌더 크기(scale*zoom)도 정확히 절반이 되어야 한다.
    expect(atZoom1.width).toBeCloseTo(atZoom2.width / 2, 0);
    // 저장된 scale 자체는 zoom과 무관한 순수 문서 좌표계 값이므로 0.4~3.2 클램프 범위 안의 값이어야 한다.
    expect(scaleAfterResize).toBeGreaterThanOrEqual(0.4);
    expect(scaleAfterResize).toBeLessThanOrEqual(3.2);
  });
});
