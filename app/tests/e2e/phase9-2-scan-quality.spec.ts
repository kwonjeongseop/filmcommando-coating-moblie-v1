// Phase 9-2: 에디터 "스캔(PDF)으로 저장" — 그레이스케일 레벨 보정(v0.2.0) 스캔 파이프라인 E2E.
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
  test('스캔(PDF) 저장 시 캡처된 캔버스가 그레이스케일 레벨 보정으로 처리된다(완전 이진화 아님)', async ({ page }) => {
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

    const stats = await page.evaluate((src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        // 좌상단 사분면(진한 빨강 #c23b2a) 픽셀 하나와 우하단(흰 배경) 픽셀 하나를 각각 확인한다.
        const redIdx = (Math.floor(c.height * 0.25) * c.width + Math.floor(c.width * 0.25)) * 4;
        const whiteIdx = (Math.floor(c.height * 0.75) * c.width + Math.floor(c.width * 0.75)) * 4;
        return resolve({ red: data[redIdx], white: data[whiteIdx] });
      };
      img.src = src;
    }), scanPng);
    // 흰 배경(그레이 255)은 LEVEL_HIGH(200) 이상이라 그대로 흰색(255)으로 유지된다.
    expect(stats.white).toBe(255);
    // 진한 빨강(#c23b2a)의 그레이스케일값(≈97.4)은 LEVEL_LOW(80)~LEVEL_HIGH(200) 사이라 선형 보간되어
    // 약 37(±5)의 중간 회색값이 된다 — 완전 이진화(0 또는 255)라면 나올 수 없는 값이므로, 레벨 보정이
    // 실제로 회색조를 유지함을 확인한다.
    expect(stats.red).toBeGreaterThan(0);
    expect(stats.red).toBeLessThan(255);
    expect(stats.red).toBeGreaterThan(25);
    expect(stats.red).toBeLessThan(50);
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
