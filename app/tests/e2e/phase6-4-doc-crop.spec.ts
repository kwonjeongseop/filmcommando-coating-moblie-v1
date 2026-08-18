// Phase 6-4: 더보기 메뉴 "서류 이미지 편집" — 문서 이미지 인라인 자르기 E2E.
import { test, expect } from '@playwright/test';

async function seedImageDoc(page) {
  await page.goto('/');
  const original = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 300;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 200, 300); // 전체 흰색
    ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 100, 150); // 좌상단 사분면만 빨강
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

test.describe('Phase 6-4: 서류 이미지 자르기', () => {
  test('빨간 사분면을 피해 자르면 docImage가 더 작은 흰색 이미지로 교체된다', async ({ page }) => {
    await seedImageDoc(page);
    await page.locator('button[aria-label="더보기"]').click();
    await page.getByText('서류 이미지 편집').click();
    await expect(page.getByText('자를 영역을 드래그로 선택하세요')).toBeVisible();

    const pageBox = await page.locator('.page').boundingBox();
    const from = { x: pageBox.x + pageBox.width * 0.55, y: pageBox.y + pageBox.height * 0.55 };
    const to = { x: pageBox.x + pageBox.width * 0.9, y: pageBox.y + pageBox.height * 0.9 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();

    const applyBtn = page.getByRole('button', { name: '적용' });
    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();
    await expect(page.getByText('자를 영역을 드래그로 선택하세요')).toHaveCount(0);

    const result = await page.evaluate(() => new Promise((resolve) => {
      const ls = JSON.parse(localStorage.getItem('docstamp_v2'));
      const src = ls.pages[0].docImage;
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(Math.floor(img.naturalWidth / 2), Math.floor(img.naturalHeight / 2), 1, 1).data;
        resolve({ w: img.naturalWidth, h: img.naturalHeight, r: px[0], g: px[1], b: px[2] });
      };
      img.src = src;
    }));

    expect(result.w).toBeLessThan(200);
    expect(result.h).toBeLessThan(300);
    // JPEG 재인코딩 손실을 감안해 흰색에 가까운지만 확인(빨간 사분면을 피한 영역을 선택했으므로)
    expect(result.r).toBeGreaterThan(230);
    expect(result.g).toBeGreaterThan(230);
    expect(result.b).toBeGreaterThan(230);
  });

  test('취소를 누르면 docImage가 바뀌지 않는다', async ({ page }) => {
    const original = await seedImageDoc(page);
    await page.locator('button[aria-label="더보기"]').click();
    await page.getByText('서류 이미지 편집').click();
    const pageBox = await page.locator('.page').boundingBox();
    await page.mouse.move(pageBox.x + pageBox.width * 0.2, pageBox.y + pageBox.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(pageBox.x + pageBox.width * 0.6, pageBox.y + pageBox.height * 0.6, { steps: 4 });
    await page.mouse.up();
    await page.getByRole('button', { name: '취소' }).click();
    await expect(page.getByText('자를 영역을 드래그로 선택하세요')).toHaveCount(0);

    const src = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')).pages[0].docImage);
    expect(src).toBe(original);
  });
});
