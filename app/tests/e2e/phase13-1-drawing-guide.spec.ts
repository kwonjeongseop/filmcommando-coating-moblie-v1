// Phase 13-1: 수기 도장 등록 시 가이드(원형·사각형 경계선) 합성(v0.1.7 수정2) E2E.
import { test, expect } from '@playwright/test';

async function openDrawTab(page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
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

// 가이드 테두리와 겹치지 않도록 캔버스 중앙 근처에만 짧게 긋는다.
async function strokeNearCenter(page) {
  const box = await page.locator('canvas').first().boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx - 10, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 10, cy, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(120);
}

async function registerAndGetEntry(page) {
  await page.getByText('보관함에 등록').click();
  await page.waitForTimeout(300);
  const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2') || '{}'));
  return ls.library.find((s) => s.label === '수기 도장');
}

// 저장된 PNG를 디코딩해 가이드 색상(#94a3b8 근방)의 불투명 픽셀이 테두리 반지름 근처 링을 따라
// 존재하는지 확인한다 — 점선이라 한 지점만으로는 놓칠 수 있어 원주를 촘촘히 순회한다.
async function hasGuideRing(page, src) {
  return page.evaluate((srcArg) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const cx = c.width / 2, cy = c.height / 2, r = c.width / 2 - 10;
      let found = false;
      for (let a = 0; a < 360; a += 1) {
        const rad = (a * Math.PI) / 180;
        const x = Math.round(cx + r * Math.cos(rad)), y = Math.round(cy + r * Math.sin(rad));
        if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
        const i = (y * c.width + x) * 4;
        if (data[i + 3] > 0 && Math.abs(data[i] - 0x94) < 30 && Math.abs(data[i + 1] - 0xa3) < 30 && Math.abs(data[i + 2] - 0xb8) < 30) {
          found = true; break;
        }
      }
      resolve(found);
    };
    img.src = srcArg;
  }), src);
}

test.describe('Phase 13-1: 수기 도장 가이드 합성', () => {
  test('원형 가이드로 그린 도장을 등록하면 저장 이미지에 원형 경계선이 포함된다', async ({ page }) => {
    await openDrawTab(page);
    await expect(page.getByText('원형')).toHaveClass(/on/);
    await strokeNearCenter(page);
    const entry = await registerAndGetEntry(page);
    expect(entry).toBeTruthy();
    expect(await hasGuideRing(page, entry.src)).toBe(true);
  });

  test('사각형 가이드로 전환해 등록해도 여전히 배경 대부분은 투명하다(가이드 선만 추가됨)', async ({ page }) => {
    await openDrawTab(page);
    await page.getByText('사각형').click();
    await strokeNearCenter(page);
    const entry = await registerAndGetEntry(page);
    expect(entry).toBeTruthy();

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
        resolve(transparent / total);
      };
      img.src = src;
    }), entry.src);
    // 가이드 선(얇은 점선)이 추가돼도 투명 비율은 여전히 대부분(절반 이상)을 차지해야 한다.
    expect(transparency).toBeGreaterThan(0.5);
  });
});
