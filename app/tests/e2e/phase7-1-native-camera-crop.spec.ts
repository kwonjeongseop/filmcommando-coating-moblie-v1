// Phase 7-1: 자체 카메라(getUserMedia 우선) 촬영 후 자르기 리뷰 화면 E2E.
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

async function openCameraAndCapture(page) {
  await page.getByText('카메라로 촬영').click();
  await page.locator('video').waitFor({ state: 'visible' });
  await page.waitForTimeout(2500); // OpenCV.js 로드+초기화 대기(엣지감지)
  await page.getByText('촬영', { exact: true }).click();
}

test.describe('Phase 7-1: 자체 카메라 촬영 후 자르기 리뷰', () => {
  test.beforeEach(async ({ page }) => {
    await installFakeCamera(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('촬영 즉시 EditorScreen이 아니라 자르기 리뷰 화면이 먼저 뜬다', async ({ page }) => {
    await openCameraAndCapture(page);
    await expect(page.getByText('촬영 확인 · 범위 조정')).toBeVisible();
    await expect(page.getByRole('button', { name: '다시 촬영' })).toBeVisible();
    await expect(page.getByRole('button', { name: '편집기로 이동' })).toBeVisible();
    const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2') || '{}'));
    expect(ls.pages?.[0]?.docImage).toBeFalsy(); // 아직 EditorScreen에 반영되지 않아야 함
  });

  test('다시 촬영을 누르면 카메라 프리뷰로 돌아간다', async ({ page }) => {
    await openCameraAndCapture(page);
    await page.getByRole('button', { name: '다시 촬영' }).click();
    await page.locator('video').waitFor({ state: 'visible' });
    await expect(page.getByText('촬영 확인 · 범위 조정')).toHaveCount(0);
  });

  test('편집기로 이동을 누르면 EditorScreen으로 진입하고 문서 영역만 크롭된다', async ({ page }) => {
    await openCameraAndCapture(page);
    await page.getByRole('button', { name: '편집기로 이동' }).click();
    await page.waitForTimeout(300);
    await expect(page.locator('.apptitle')).toHaveText('촬영 서류');

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
  });
});
