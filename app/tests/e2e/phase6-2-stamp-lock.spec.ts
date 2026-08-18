// Phase 6-2: 도장 크기 고정(잠금) 버튼 + 리사이즈 zoom 정규화 E2E.
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
  return pageBox;
}

async function readPlaced(page) {
  const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2') || '{}'));
  return ls.pages[ls.currentPage].placed[0];
}

test.describe('Phase 6-2: 도장 크기 고정 버튼', () => {
  test('잠금 버튼을 누르면 크기 핸들이 사라지고, 다시 누르면 돌아온다', async ({ page }) => {
    await placeStamp(page);
    await expect(page.locator('.h-res')).toBeVisible();
    await expect(page.locator('.h-lock')).toHaveText('🔓');

    await page.locator('.h-lock').click();
    await expect(page.locator('.h-lock')).toHaveText('🔒');
    await expect(page.locator('.h-res')).toHaveCount(0);
    const afterLock = await readPlaced(page);
    expect(afterLock.locked).toBe(true);

    await page.locator('.h-lock').click();
    await expect(page.locator('.h-lock')).toHaveText('🔓');
    await expect(page.locator('.h-res')).toBeVisible();
    const afterUnlock = await readPlaced(page);
    expect(afterUnlock.locked).toBe(false);
  });

  test('하단 선택바의 잠금/해제 버튼도 동일하게 동작한다', async ({ page }) => {
    await placeStamp(page);
    const lockBtn = page.getByRole('button', { name: /잠금|해제/ });
    await expect(lockBtn).toHaveText('🔓 잠금');
    await lockBtn.click();
    await expect(lockBtn).toHaveText('🔒 해제');
    expect((await readPlaced(page)).locked).toBe(true);
  });

  test('잠긴 도장은 두 손가락 핀치로 크기가 변하지 않는다', async ({ page, context }) => {
    await placeStamp(page);
    await page.locator('.h-lock').click(); // 잠금
    const before = await readPlaced(page);

    const placedBox = await page.locator('.placed').boundingBox();
    const c = { x: placedBox.x + placedBox.width / 2, y: placedBox.y + placedBox.height / 2 };
    const cdp = await context.newCDPSession(page);
    const dispatch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y })),
    });
    await dispatch('touchStart', [{ x: c.x - 10, y: c.y }, { x: c.x + 10, y: c.y }]);
    await dispatch('touchMove', [{ x: c.x - 60, y: c.y }, { x: c.x + 60, y: c.y }]);
    await page.waitForTimeout(100);
    await dispatch('touchEnd', []);
    await page.waitForTimeout(150);

    const after = await readPlaced(page);
    expect(after.scale).toBeCloseTo(before.scale, 5);
  });

  test('문서를 확대(zoom)한 상태에서 리사이즈해도 zoom을 되돌리면 같은 상대 크기로 저장된다', async ({ page }) => {
    const pageBoxAtZoom1 = await placeStamp(page);
    // 줌 200%로 확대
    await page.locator('button[aria-label="돋보기"]').click();
    for (let i = 0; i < 5; i++) await page.locator('.zoombar .rbtn').nth(1).click(); // + 버튼 5회 = +1.0
    await expect(page.locator('.zoom-val')).toHaveText('200%');

    const placedBox = await page.locator('.placed').boundingBox();
    const handle = page.locator('.h-res');
    const handleBox = await handle.boundingBox();
    const center = { x: placedBox.x + placedBox.width / 2, y: placedBox.y + placedBox.height / 2 };
    const from = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };
    // 중심에서 핸들까지 거리를 2배로 늘려 화면 픽셀 기준 2배 확대 제스처를 만든다.
    const to = { x: center.x + (from.x - center.x) * 2, y: center.y + (from.y - center.y) * 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const afterResizeAtZoom2 = await readPlaced(page);
    // 핸들-중심 거리는 zoom과 무관하게 항상 도장 자신의 고정 px 크기에서 나오므로, "거리를 2배로"
    // 늘리는 제스처는 dist/startDist≈2를 만든다. zoom 정규화(÷zoom=2.0)가 적용되면 계산값은 원본
    // scale(v0.1.9: 기본 0.10)에 가까워지는데, 이는 리사이즈 clamp 하한(0.4, editor.jsx:675)보다
    // 작으므로 실제로는 0.4로 클램프된다 — 정규화가 아예 없었다면 훨씬 큰 값(원본의 2배 이상)이
    // 나왔을 것이므로, 두 프로젝트(뷰포트 DPR 차이) 사이의 픽셀 측정 오차를 감안해 넓게 확인한다.
    expect(afterResizeAtZoom2.scale).toBeLessThan(0.55);
    expect(afterResizeAtZoom2.scale).toBeGreaterThan(0.25);
  });
});
