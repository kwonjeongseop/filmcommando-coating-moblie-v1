// Phase 13-2: 도장 초기 크기 축소 + image kind 기준폭 통일(v0.1.7 수정3) E2E.
import { test, expect } from '@playwright/test';

async function loadEditor(page) {
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
}

async function placeFirstLibraryStamp(page) {
  await page.locator('button[aria-label="도장"]').click();
  await page.locator('.stamp-card-label').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  const pageBox = await page.locator('.page').boundingBox();
  await page.mouse.click(pageBox.x + pageBox.width * 0.5, pageBox.y + pageBox.height * 0.5);
  await page.waitForTimeout(150);
}

test.describe('Phase 13-2: 도장 초기 크기', () => {
  test('설정을 건드리지 않고 새 도장을 배치하면 기본 scale이 0.10이다(DEFAULT_SETTINGS.size 축소)', async ({ page }) => {
    await loadEditor(page);
    await placeFirstLibraryStamp(page);
    const placed = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')).pages[0].placed[0]);
    expect(placed.scale).toBeCloseTo(0.10, 2);
  });

  test('수기 도장(image kind)과 인감(seal kind)이 같은 scale에서 같은 폭으로 렌더링된다(기준폭 94 통일)', async ({ page }) => {
    await loadEditor(page);
    // 수기 도장을 만들어 library에 등록한다.
    await page.locator('button[aria-label="도장"]').click();
    await page.locator('.stamp-card.add').click();
    await page.getByText('수기로 그리기').click();
    const box = await page.locator('canvas').first().boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx - 10, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 10, cy, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    await page.getByText('보관함에 등록').click();
    await page.waitForTimeout(300);

    // 수기 도장을 배치한다(가장 최근 등록 항목이 보관함 목록에 노출된다고 가정하지 않고, label로 식별).
    await page.locator('button[aria-label="도장"]').click();
    await page.locator('.stamp-card', { hasText: '수기 도장' }).click();
    await page.getByRole('button', { name: '확인' }).click();
    const pageBox = await page.locator('.page').boundingBox();
    await page.mouse.click(pageBox.x + pageBox.width * 0.5, pageBox.y + pageBox.height * 0.5);
    await page.waitForTimeout(150);

    const imgWidth = await page.locator('.placed img').first().evaluate((el) => el.getBoundingClientRect().width);
    const placed = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')).pages[0].placed[0]);
    // visuals.jsx: width = (stamp.w || 94) * scale, editor.jsx가 이제 w:94로 저장하므로 seal의
    // 94*scale 기준과 동일해야 한다. v0.2.0: 배치 직후에는 자동 선택되지 않아(autoSelect=false)
    // MIN_SEL_SCALE 클램프가 적용되지 않은 실제 저장 scale 그대로 렌더링된다 — 허용 오차: 렌더
    // 반올림 대비 ±1px.
    expect(imgWidth).toBeGreaterThan(94 * placed.scale - 1);
    expect(imgWidth).toBeLessThan(94 * placed.scale + 1);
  });
});
