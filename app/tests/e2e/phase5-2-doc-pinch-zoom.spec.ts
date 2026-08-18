// Phase 5-2: 문서 배경 핀치줌 · 더블탭 리셋 · 줌바 범위 확장(0.5x~3.0x) E2E.
// 터치 좌표는 항상 .canvas(스크롤 컨테이너, 뷰포트 기준 고정) 중심을 기준으로 삼는다 —
// .page는 확대되면 뷰포트 밖으로 스크롤되어 나갈 수 있어 좌표 기준으로 부적절하다.
import { test, expect } from '@playwright/test';

async function openEditor(page) {
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
}

function makeDispatcher(cdp) {
  return (type, points) => cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p) => ({ x: p.x, y: p.y })),
  });
}

test.describe('Phase 5-2: 문서 배경 핀치줌', () => {
  test('두 손가락으로 벌리면 문서가 확대되고, 모으면 축소된다', async ({ page, context }) => {
    await openEditor(page);
    const before = await page.locator('.page').boundingBox();
    const canvasBox = await page.locator('.canvas').boundingBox();
    const c = { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height / 2 };
    const dispatch = makeDispatcher(await context.newCDPSession(page));

    // 확대: 20px 간격 → 140px 간격
    await dispatch('touchStart', [{ x: c.x - 10, y: c.y }, { x: c.x + 10, y: c.y }]);
    await page.waitForTimeout(50);
    await dispatch('touchMove', [{ x: c.x - 70, y: c.y }, { x: c.x + 70, y: c.y }]);
    await page.waitForTimeout(100);
    await dispatch('touchEnd', []);
    await page.waitForTimeout(150);

    const zoomedIn = await page.locator('.page').boundingBox();
    expect(zoomedIn.width).toBeGreaterThan(before.width * 2); // 7배 간격 확대 → 최대 3.0x 근접

    // 축소: 같은 캔버스 중심에서 다시 좁혀서 최소 배율(0.5x) 근처까지
    await dispatch('touchStart', [{ x: c.x - 70, y: c.y }, { x: c.x + 70, y: c.y }]);
    await page.waitForTimeout(50);
    await dispatch('touchMove', [{ x: c.x - 5, y: c.y }, { x: c.x + 5, y: c.y }]);
    await page.waitForTimeout(100);
    await dispatch('touchEnd', []);
    await page.waitForTimeout(150);

    const zoomedOut = await page.locator('.page').boundingBox();
    expect(zoomedOut.width).toBeLessThan(zoomedIn.width / 2);
  });

  test('배경을 더블탭하면 원본 크기(100%)로 리셋된다', async ({ page, context }) => {
    await openEditor(page);
    const before = await page.locator('.page').boundingBox();
    const canvasBox = await page.locator('.canvas').boundingBox();
    const c = { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height / 2 };
    const dispatch = makeDispatcher(await context.newCDPSession(page));

    // 핀치로 확대
    await dispatch('touchStart', [{ x: c.x - 10, y: c.y }, { x: c.x + 10, y: c.y }]);
    await dispatch('touchMove', [{ x: c.x - 80, y: c.y }, { x: c.x + 80, y: c.y }]);
    await page.waitForTimeout(80);
    await dispatch('touchEnd', []);
    await page.waitForTimeout(150);
    const zoomed = await page.locator('.page').boundingBox();
    expect(zoomed.width).toBeGreaterThan(before.width * 1.2);

    // 캔버스 중심(항상 화면 안)을 300ms 이내 두 번 탭
    await dispatch('touchStart', [c]);
    await dispatch('touchEnd', []);
    await page.waitForTimeout(100);
    await dispatch('touchStart', [c]);
    await dispatch('touchEnd', []);
    await page.waitForTimeout(150);

    const reset = await page.locator('.page').boundingBox();
    expect(reset.width).toBeCloseTo(before.width, 0);
  });

  test('줌바 슬라이더 범위가 0.5x~3.0x로 확장되어 핀치 결과와 어긋나지 않는다', async ({ page }) => {
    await openEditor(page);
    await page.locator('button[aria-label="돋보기"]').click();
    const slider = page.locator('.zoombar input[type="range"]');
    await expect(slider).toHaveAttribute('min', '0.5');
    await expect(slider).toHaveAttribute('max', '3');
  });
});
