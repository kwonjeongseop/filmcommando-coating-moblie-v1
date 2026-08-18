// Phase 9-2: 에디터 "스캔(PDF)으로 저장" — Otsu 전역 이진화 스캔 파이프라인 E2E.
import { test, expect } from '@playwright/test';

async function seedImageDoc(page) {
  await page.goto('/');
  const original = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 300;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 200, 300); // 전체 흰색
    ctx.fillStyle = '#c23b2a'; ctx.fillRect(0, 0, 100, 150); // 좌상단 사분면만 진한 빨강(복잡한 배경 대신)
    return c.toDataURL('image/png');
  });
  await page.evaluate((img) => {
    const state = {
      screen: 'editor',
      pages: [{ docMode: 'image', docImage: img, placed: [] }],
      currentPage: 0, docName: '테스트문서', docs: [], library: [], recent: [], favId: null, settings: {},
    };
    localStorage.setItem('docstamp_v2', JSON.stringify(state));
  }, original);
  await page.reload();
  return original;
}

test.describe('Phase 9-2: 스캔(PDF) 저장 — Otsu 이진화 화질', () => {
  test('스캔(PDF) 저장 시 캡처된 캔버스가 순수 흑(0)/백(255) 픽셀로 이진화된다', async ({ page }) => {
    await page.addInitScript(() => {
      window.__pngCalls = [];
      const orig = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const url = orig.apply(this, args);
        if (args[0] === 'image/png') window.__pngCalls.push(url);
        return url;
      };
    });
    await seedImageDoc(page);
    await page.evaluate(() => { window.__pngCalls = []; }); // seedImageDoc 자체의 png 호출 제외

    await page.getByRole('button', { name: '저장' }).click();
    await page.getByText('스캔(PDF)').click();
    await page.locator('.dialog.sm').getByText('저장', { exact: true }).click();
    await expect(page.locator('.toast')).toHaveText(/스캔\(PDF\)으로 저장했습니다/);

    const scanPng = await page.evaluate(() => window.__pngCalls[window.__pngCalls.length - 1]);
    expect(scanPng).toBeTruthy();

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
          if ((data[i] === 0 || data[i] === 255) && data[i] === data[i + 1] && data[i + 1] === data[i + 2]) quantized++;
        }
        resolve(quantized / total);
      };
      img.src = src;
    }), scanPng);
    // Otsu 이진화는 모든 픽셀을 정확히 0 또는 255로 양자화하므로(중간값 없음) 거의 100%여야 한다.
    expect(quantizedRatio).toBeGreaterThan(0.99);
  });

  test('html2canvas 캡처 시 scale=2가 명시적으로 지정되어 고해상도로 캡처된다', async ({ page }) => {
    await page.addInitScript(() => {
      window.__pngCalls = [];
      const orig = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const url = orig.apply(this, args);
        if (args[0] === 'image/png') window.__pngCalls.push(url);
        return url;
      };
    });
    await seedImageDoc(page);
    await page.evaluate(() => { window.__pngCalls = []; }); // seedImageDoc 자체의 png 호출 제외
    // capturePageCanvas(bgColor, scale) 호출 자체를 가로챌 수는 없으므로(비-export 내부 함수),
    // 대신 스캔 결과 캔버스 해상도가 원본 .page 엘리먼트의 CSS 크기보다 충분히 크다는 것으로 간접 확인한다.
    const pageBox = await page.locator('.page').boundingBox();

    await page.getByRole('button', { name: '저장' }).click();
    await page.getByText('스캔(PDF)').click();
    await page.locator('.dialog.sm').getByText('저장', { exact: true }).click();
    await expect(page.locator('.toast')).toHaveText(/스캔\(PDF\)으로 저장했습니다/);

    const scanPng = await page.evaluate(() => window.__pngCalls[window.__pngCalls.length - 1]);
    const dims = await page.evaluate((src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.src = src;
    }), scanPng);
    // scale=2이므로 캡처된 캔버스 너비가 .page 엘리먼트의 CSS 너비보다 뚜렷이 커야 한다(대략 2배 근접).
    expect(dims.width).toBeGreaterThan(pageBox.width * 1.5);
  });
});
