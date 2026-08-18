// Phase 9-3: 촬영 확인 화면 꼭짓점 핸들 안전 여백(HANDLE_SAFE_MARGIN) E2E.
import { test, expect } from '@playwright/test';

async function installBlankCamera(page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas');
      c.width = 640; c.height = 480;
      const ctx = c.getContext('2d');
      const draw = () => { ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 640, 480); requestAnimationFrame(draw); };
      draw();
      return c.captureStream(30);
    };
  });
}

async function openCameraAndCapture(page) {
  await page.getByText('카메라로 촬영').click();
  await page.locator('video').waitFor({ state: 'visible' });
  await page.waitForTimeout(2500); // OpenCV.js 로드+초기화 대기(엣지감지)
  await page.getByText('촬영', { exact: true }).click();
}

// 리뷰 화면 오버레이 캔버스에서 파란색(#2B6CE6) 핸들 점들의 정규화 좌표 범위를 읽어낸다.
async function readHandlePositions(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.preview-modal canvas');
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    const { data } = ctx.getImageData(0, 0, w, h);
    let minX = 1, maxX = 0, minY = 1, maxY = 0, found = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (Math.abs(data[i] - 0x2b) < 20 && Math.abs(data[i + 1] - 0x6c) < 20 && Math.abs(data[i + 2] - 0xe6) < 20) {
          found++;
          const nx = x / w, ny = y / h;
          if (nx < minX) minX = nx; if (nx > maxX) maxX = nx;
          if (ny < minY) minY = ny; if (ny > maxY) maxY = ny;
        }
      }
    }
    return { found, minX, maxX, minY, maxY };
  });
}

test.describe('Phase 9-3: 촬영 확인 화면 핸들 안전 여백', () => {
  test.beforeEach(async ({ page }) => {
    await installBlankCamera(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('감지 실패(빈 배경) 시 리뷰 화면 기본 사각형 핸들이 화면 가장자리(0/1)에 붙지 않는다', async ({ page }) => {
    await openCameraAndCapture(page);
    await expect(page.getByText('촬영 확인 · 범위 조정')).toBeVisible();

    const pos = await readHandlePositions(page);
    expect(pos.found).toBeGreaterThan(0);
    // capturePhoto 폴백 기본값은 [0.05,0.05]~[0.95,0.95] — 5px 점 반지름을 감안해도 가장자리(0/1)에는 닿지 않아야 한다.
    expect(pos.minX).toBeGreaterThan(0.02);
    expect(pos.maxX).toBeLessThan(0.98);
    expect(pos.minY).toBeGreaterThan(0.02);
    expect(pos.maxY).toBeLessThan(0.98);
  });

  test('핸들을 화면 맨 꼭짓점으로 드래그해도 안전 여백([0.05,0.95]) 밖으로 나가지 않는다', async ({ page }) => {
    await openCameraAndCapture(page);
    await expect(page.getByText('촬영 확인 · 범위 조정')).toBeVisible();

    const canvas = page.locator('.preview-modal canvas');
    const box = await canvas.boundingBox();
    // 기본 사각형의 tl 핸들은 (5%, 5%) 근처에 있다 — 그 지점에서 드래그를 시작해 화면 맨 꼭짓점(0,0)까지 끌어본다.
    const startX = box.x + box.width * 0.05, startY = box.y + box.height * 0.05;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(box.x, box.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const pos = await readHandlePositions(page);
    expect(pos.found).toBeGreaterThan(0);
    // 드래그로 (0,0)까지 끌어도 clampToSafeMargin에 의해 5%보다 안쪽에 머물러야 한다(가장자리에 붙지 않음).
    expect(pos.minX).toBeGreaterThan(0.02);
    expect(pos.minY).toBeGreaterThan(0.02);
  });
});
