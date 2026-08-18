// Phase 6-1: 원형 도장 텍스트 배치 방향(세로 → 가로) E2E.
import { test, expect } from '@playwright/test';

test.describe('Phase 6-1: 원형 도장 텍스트 가로 배치', () => {
  test('3자 이름이 왼쪽→오른쪽, 위→아래 순서로 배치된다(세로 배치 아님)', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByText('재직증명서.jpg').click();
    await page.locator('button[aria-label="도장"]').click();
    await page.locator('.stamp-card', { hasText: '인감 · 김민수' }).click(); // text: 金民洙
    await page.getByRole('button', { name: '확인' }).click();
    const pageBox = await page.locator('.page').boundingBox();
    await page.mouse.click(pageBox.x + pageBox.width * 0.5, pageBox.y + pageBox.height * 0.5);
    await page.waitForTimeout(150);

    const cells = await page.evaluate(() => {
      const placed = document.querySelector('.placed');
      const circle = placed.firstElementChild;
      return Array.from(circle.querySelectorAll('span')).map((s) => ({
        row: s.style.gridRow, col: s.style.gridColumn, text: s.textContent,
      }));
    });

    expect(cells.length).toBe(3);
    // 입력 순서(金民洙)가 그대로 행 우선(왼쪽→오른쪽, 위→아래)으로 매핑되어야 한다.
    cells.sort((a, b) => (Number(a.row) - Number(b.row)) || (Number(a.col) - Number(b.col)));
    expect(cells.map((c) => c.text).join('')).toBe('金民洙');
    // 세로 배치였다면 첫 글자가 1행2열(오른쪽 위)에 있었을 것 — 가로 배치는 1행1열(왼쪽 위).
    const first = cells.find((c) => c.text === '金');
    expect(first.row).toBe('1');
    expect(first.col).toBe('1');
  });
});
