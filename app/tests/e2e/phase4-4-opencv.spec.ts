// Phase 4-4 보완: OpenCV.js Canny+findContours 엣지 감지 및 getPerspectiveTransform 원근 보정 E2E.
// getUserMedia를 어두운 배경 위 밝은 문서 사각형을 그리는 canvas.captureStream()으로 대체해
// 실제 카메라 하드웨어 없이도 감지 정확도를 수치로 검증한다 (테스트 전용, 앱 코드 무관).
import { test, expect } from '@playwright/test';

const FAKE_DOC_RECT = { x: 120, y: 90, w: 400, h: 300 }; // 640x480 프레임 기준

async function installFakeCamera(page) {
  await page.addInitScript((rect) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas');
      c.width = 640; c.height = 480;
      const ctx = c.getContext('2d');
      const draw = () => {
        ctx.fillStyle = '#202020';
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = '#f5f5f0';
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        requestAnimationFrame(draw);
      };
      draw();
      return c.captureStream(30);
    };
  }, FAKE_DOC_RECT);
}

test.describe('Phase 4-4 보완: OpenCV.js 엣지 감지 · 원근 보정', () => {
  test.beforeEach(async ({ page }) => {
    await installFakeCamera(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('Canny+findContours가 합성 문서 사각형을 정확히 감지한다', async ({ page }) => {
    await page.getByText('카메라로 촬영').click();
    await page.locator('video').waitFor({ state: 'visible' });
    await page.waitForTimeout(6000); // OpenCV.js(WASM) 로드+초기화 대기

    const video = page.locator('video');
    await expect(video).toBeVisible();

    const overlayDrawn = await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas');
      const overlay = canvases[canvases.length - 1];
      const data = overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
      return false;
    });
    expect(overlayDrawn).toBe(true);

    const detected = await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas');
      const overlay = canvases[canvases.length - 1];
      const ctx = overlay.getContext('2d');
      const data = ctx.getImageData(0, 0, overlay.width, overlay.height).data;
      let minX = overlay.width, minY = overlay.height, maxX = 0, maxY = 0;
      for (let y = 0; y < overlay.height; y++) for (let x = 0; x < overlay.width; x++) {
        if (data[(y * overlay.width + x) * 4 + 3] > 0) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
      const v = document.querySelector('video');
      const sx = v.videoWidth / overlay.width, sy = v.videoHeight / overlay.height;
      return { x0: minX * sx, y0: minY * sy, x1: maxX * sx, y1: maxY * sy };
    });

    // 실제 그린 사각형 (120,90)-(520,390) 대비 다운샘플 해상도(96x128) 오차를 감안해 ±20px 허용
    expect(detected.x0).toBeGreaterThan(FAKE_DOC_RECT.x - 20);
    expect(detected.x0).toBeLessThan(FAKE_DOC_RECT.x + 20);
    expect(detected.x1).toBeGreaterThan(FAKE_DOC_RECT.x + FAKE_DOC_RECT.w - 20);
    expect(detected.y1).toBeGreaterThan(FAKE_DOC_RECT.y + FAKE_DOC_RECT.h - 20);
  });

  test('원근 보정 결과 이미지가 감지 영역 크기로 캡처된다', async ({ page }) => {
    await page.getByText('카메라로 촬영').click();
    await page.locator('video').waitFor({ state: 'visible' });
    await page.waitForTimeout(6000);

    await page.getByText('촬영', { exact: true }).click(); // v0.0.9: 편집 화면 제거 — 촬영 즉시 EditorScreen 진입
    await page.waitForTimeout(500);

    const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2') || '{}'));
    const docImage = ls.pages?.[0]?.docImage;
    expect(docImage).toBeTruthy();

    const dims = await page.evaluate((src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.src = src;
    }), docImage);

    // 원본 640x480 전체가 아니라 문서 영역만 크롭되어야 하므로 원본보다 작아야 한다
    expect(dims.width).toBeLessThan(640);
    expect(dims.height).toBeLessThan(480);
    expect(dims.width).toBeGreaterThan(300);
    expect(dims.height).toBeGreaterThan(200);

    await expect(page.locator('.apptitle')).toHaveText('촬영 서류');
  });

  test('OpenCV.js 로드 실패 시 Canvas API 폴백으로 정상 동작한다', async ({ page }) => {
    await page.route(/opencv.*\.js/i, (route) => route.abort('failed'));
    await page.getByText('카메라로 촬영').click();
    await page.locator('video').waitFor({ state: 'visible' });
    await page.waitForTimeout(2000);

    const overlayDrawn = await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas');
      const overlay = canvases[canvases.length - 1];
      const data = overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
      return false;
    });
    expect(overlayDrawn).toBe(true); // Canvas API 폴백도 오버레이를 그림

    await page.getByText('촬영', { exact: true }).click(); // v0.0.9: 편집 화면 제거 — 촬영 즉시 EditorScreen 진입
    await page.waitForTimeout(500);
    const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2') || '{}'));
    expect(ls.pages?.[0]?.docImage).toBeTruthy();
  });
});
