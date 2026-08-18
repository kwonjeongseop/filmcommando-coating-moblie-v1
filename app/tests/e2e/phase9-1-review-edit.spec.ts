// Phase 9-1: 촬영 확인 화면 밝기·대비 편집 + 원본 유지·스캔으로 저장 분기 E2E.
import { test, expect } from '@playwright/test';

const FAKE_DOC_RECT = { x: 120, y: 90, w: 400, h: 300 }; // 640x480 프레임 기준

async function installFakeCamera(page) {
  await page.addInitScript((rect) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas');
      c.width = 640; c.height = 480;
      const ctx = c.getContext('2d');
      const draw = () => {
        ctx.fillStyle = '#606060';
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

test.describe('Phase 9-1: 촬영 확인 화면 편집 + 저장 형식 선택', () => {
  test.beforeEach(async ({ page }) => {
    await installFakeCamera(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('밝기·대비 슬라이더가 기본값 0으로 표시되고 조정 시 실시간 미리보기에 반영된다', async ({ page }) => {
    await openCameraAndCapture(page);
    const sliders = page.locator('.preview-modal input[type="range"]');
    await expect(sliders).toHaveCount(2);
    await expect(sliders.nth(0)).toHaveValue('0');
    await expect(sliders.nth(1)).toHaveValue('0');

    await sliders.nth(0).fill('30');
    const filterBefore = await page.locator('.preview-modal img').evaluate((el) => getComputedStyle(el).filter);
    expect(filterBefore).not.toBe('none');
  });

  test('다시 촬영을 누르면 슬라이더가 0으로 초기화된다', async ({ page }) => {
    await openCameraAndCapture(page);
    const sliders = page.locator('.preview-modal input[type="range"]');
    await sliders.nth(0).fill('20');
    await sliders.nth(1).fill('-15');
    await page.getByRole('button', { name: '다시 촬영' }).click();
    await page.locator('video').waitFor({ state: 'visible' });
    await page.waitForTimeout(2500);
    await page.getByText('촬영', { exact: true }).click();
    const slidersAfter = page.locator('.preview-modal input[type="range"]');
    await expect(slidersAfter.nth(0)).toHaveValue('0');
    await expect(slidersAfter.nth(1)).toHaveValue('0');
  });

  test('원본 유지는 컬러를 그대로 저장한다(흑백 변환 없음)', async ({ page }) => {
    await openCameraAndCapture(page);
    await page.getByRole('button', { name: '원본 유지' }).click();
    await page.waitForTimeout(300);
    await expect(page.locator('.apptitle')).toHaveText('촬영 서류');

    const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2') || '{}'));
    const docImage = ls.pages?.[0]?.docImage;
    expect(docImage).toBeTruthy();

    const quantizedRatio = await page.evaluate((src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        let quantized = 0, total = 0;
        for (let i = 0; i < data.length; i += 4) {
          total++;
          if ((data[i] <= 5 || data[i] >= 250) && data[i] === data[i + 1] && data[i + 1] === data[i + 2]) quantized++;
        }
        resolve(quantized / total);
      };
      img.src = src;
    }), docImage);
    // "원본 유지"는 적응형 임계값(흑백 양자화)을 거치지 않으므로 순수 흑/백(0 또는 255) 픽셀 비율이
    // 스캔 결과(아래 테스트에서 0.9 초과)보다 뚜렷이 낮아야 한다.
    expect(quantizedRatio).toBeLessThan(0.5);
  });

  test('스캔으로 저장은 흑백 고대비 이미지로 변환한다(픽셀이 0 또는 255로 양자화)', async ({ page }) => {
    await openCameraAndCapture(page);
    await page.getByRole('button', { name: '스캔으로 저장' }).click();
    await page.waitForTimeout(300);
    await expect(page.locator('.apptitle')).toHaveText('촬영 서류');

    const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2') || '{}'));
    const docImage = ls.pages?.[0]?.docImage;
    expect(docImage).toBeTruthy();

    const quantizedRatio = await page.evaluate((src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        let quantized = 0, total = 0;
        for (let i = 0; i < data.length; i += 4) {
          total++;
          if ((data[i] <= 5 || data[i] >= 250) && data[i] === data[i + 1] && data[i + 1] === data[i + 2]) quantized++;
        }
        resolve(quantized / total);
      };
      img.src = src;
    }), docImage);
    expect(quantizedRatio).toBeGreaterThan(0.9); // 적응형 임계값으로 대부분의 픽셀이 흑(0) 또는 백(255)으로 양자화됨
  });
});
