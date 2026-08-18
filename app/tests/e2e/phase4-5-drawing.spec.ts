// Phase 4-5: 수기 도장 드로잉 · 등록 E2E — 가이드 전환, 배경 제거, library 등록을 검증한다.
import { test, expect } from '@playwright/test';

async function openDrawTab(page) {
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
  await page.locator('.stamp-card.add').click();
  await page.getByText('수기로 그리기').click();
  await page.locator('canvas').first().waitFor({ state: 'visible' });
}

async function strokeAcrossCanvas(page) {
  const box = await page.locator('canvas').first().boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx - 60, cy - 40);
  await page.mouse.down();
  await page.mouse.move(cx, cy, { steps: 8 });
  await page.mouse.move(cx + 60, cy + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);
}

test.describe('Phase 4-5: 수기 도장 제작', () => {
  test('기본 가이드는 원형이고, 그리면 흰색이 아닌 픽셀이 생긴다', async ({ page }) => {
    await openDrawTab(page);
    await expect(page.getByText('원형')).toHaveClass(/on/);
    await strokeAcrossCanvas(page);

    const hasInk = await page.evaluate(() => {
      const c = document.querySelectorAll('canvas')[0];
      const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < data.length; i += 4) {
        if (!(data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250)) return true;
      }
      return false;
    });
    expect(hasInk).toBe(true);
  });

  test('사각형 가이드로 전환해도 이미 그린 내용은 유지된다', async ({ page }) => {
    await openDrawTab(page);
    await strokeAcrossCanvas(page);
    const before = await page.evaluate(() => {
      const c = document.querySelectorAll('canvas')[0];
      return c.getContext('2d').getImageData(0, 0, c.width, c.height).data.length;
    });

    await page.getByText('사각형').click();
    await expect(page.getByText('사각형')).toHaveClass(/on/);

    const inkStillThere = await page.evaluate(() => {
      const c = document.querySelectorAll('canvas')[0];
      const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < data.length; i += 4) {
        if (!(data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250)) return true;
      }
      return false;
    });
    expect(before).toBeGreaterThan(0);
    expect(inkStillThere).toBe(true);
  });

  test('등록 버튼은 그리기 전까지 비활성화되고, 등록 시 배경이 제거된 PNG가 library에 추가된다', async ({ page }) => {
    await openDrawTab(page);
    const registerBtn = page.getByText('보관함에 등록');
    await expect(registerBtn).toBeDisabled();

    await strokeAcrossCanvas(page);
    await expect(registerBtn).toBeEnabled();
    await registerBtn.click();
    await page.waitForTimeout(300);

    const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2') || '{}'));
    const entry = ls.library.find((s) => s.label === '수기 도장');
    expect(entry).toBeTruthy();
    expect(entry.kind).toBe('image');

    const transparency = await page.evaluate((src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        let total = 0, transparent = 0;
        for (let i = 0; i < data.length; i += 4) { total++; if (data[i + 3] === 0) transparent++; }
        resolve({ total, transparent });
      };
      img.src = src;
    }), entry.src);

    // 흰 배경 대부분이 투명 처리되어야 한다 (전체의 절반 이상)
    expect(transparency.transparent / transparency.total).toBeGreaterThan(0.5);

    await expect(page.locator('.toast')).toHaveText(/보관함에 저장되었습니다/);
  });
});
