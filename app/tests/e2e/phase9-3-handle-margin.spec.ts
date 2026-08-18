// Phase 9-3: 촬영 확인 화면 꼭짓점 핸들 안전 여백(HANDLE_SAFE_MARGIN) E2E.
// v0.1.6: 감지가 안정화되지 않고 사용자가 수동 조정도 하지 않았다면 촬영 자체를 막도록 바뀌어
// (app.jsx capturePhoto), "감지 실패 시에도 폴백으로 촬영이 된다"는 이전 전제가 더 이상 유효하지
// 않다 — 아래 테스트들은 v0.1.6 동작(차단 안내 / 라이브 화면에서 수동 시드 후 촬영 허용)에 맞춰
// 재작성되었다.
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

async function openCamera(page) {
  await page.getByText('카메라로 촬영').click();
  await page.locator('video').waitFor({ state: 'visible' });
  await page.waitForTimeout(2500); // OpenCV.js 로드+초기화 대기(엣지감지)
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

  test('감지 실패(빈 배경) 시 촬영이 차단되고 안내 토스트가 표시된다(v0.1.6 수정2)', async ({ page }) => {
    await openCamera(page);
    await page.getByText('촬영', { exact: true }).click();

    // 차단되었으므로 리뷰 화면으로 넘어가지 않고 라이브 카메라 화면 그대로 남아야 한다.
    await expect(page.getByText('촬영 확인 · 범위 조정')).toHaveCount(0);
    await expect(page.locator('video')).toBeVisible();
    await expect(page.locator('.toast')).toHaveText(/문서를 화면 안에 완전히 맞춰주세요/);
  });

  test('라이브 화면에서 수동으로 꼭짓점을 조정하면 감지 실패 상태에서도 촬영이 허용되고, 핸들은 안전 여백 밖으로 나가지 않는다', async ({ page }) => {
    await openCamera(page);

    // 감지 실패(boxRef 비어있음) 상태에서 오버레이를 터치하면 폴백 사각형이 시드되고(v0.1.6 companion),
    // 그 자리에서 바로 드래그해 꼭짓점을 화면 맨 꼭짓점(0,0)까지 끌어본다.
    const overlay = page.locator('.preview-modal canvas').first();
    const box = await overlay.boundingBox();
    const startX = box.x + box.width * 0.05, startY = box.y + box.height * 0.05; // 폴백 tl 핸들 위치(5%,5%)
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(box.x, box.y, { steps: 8 }); // 화면 맨 꼭짓점(0,0)까지 드래그
    await page.mouse.up();
    await page.waitForTimeout(150);

    // 수동 조정(manualRef=true)이 이루어졌으므로 이제 촬영이 차단되지 않고 리뷰 화면으로 진입해야 한다.
    await page.getByText('촬영', { exact: true }).click();
    await expect(page.getByText('촬영 확인 · 범위 조정')).toBeVisible();

    const pos = await readHandlePositions(page);
    expect(pos.found).toBeGreaterThan(0);
    // (0,0)까지 끌어도 clampToSafeMargin에 의해 5%보다 안쪽에 머물러야 한다(가장자리에 붙지 않음).
    expect(pos.minX).toBeGreaterThan(0.02);
    expect(pos.minY).toBeGreaterThan(0.02);
  });
});
