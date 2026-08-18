// Phase 8-1: 카메라 프리뷰에서 TF.js coco-ssd 모델 로드 + 실시간 물체 감지 콘솔 로그 확인.
// 모델 가중치(~14MB)를 실제 네트워크로 받아오므로 타임아웃을 넉넉히 둔다.
import { test, expect } from '@playwright/test';

const FAKE_DOC_RECT = { x: 120, y: 90, w: 400, h: 300 };

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

test.describe('Phase 8-1: TF.js coco-ssd 실시간 물체 감지', () => {
  test('카메라를 열면 coco-ssd 모델이 로드되고 감지 루프가 콘솔에 로그를 남긴다', async ({ page }) => {
    test.setTimeout(90000);
    const logs: string[] = [];
    page.on('console', (msg) => { if (msg.text().includes('[TFJS]')) logs.push(msg.text()); });

    await installFakeCamera(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.getByText('카메라로 촬영').click();
    await page.locator('video').waitFor({ state: 'visible' });

    await expect.poll(() => logs.some((l) => l.includes('모델 로드 완료')), {
      timeout: 60000, message: 'coco-ssd 모델 로드 완료 로그를 기다림(최초 1회 ~14MB 가중치 다운로드 포함)',
    }).toBe(true);

    await expect.poll(() => logs.some((l) => l.includes('감지:')), {
      timeout: 15000, message: '모델 로드 후 첫 감지 사이클(500ms 간격) 로그를 기다림',
    }).toBe(true);

    const loadLog = logs.find((l) => l.includes('모델 로드 완료'));
    expect(loadLog).toMatch(/모델 로드 완료 · \d+ms/);
  });
});
