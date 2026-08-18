// Phase 6-3: 드로어 하단 버전 표시가 package.json 버전과 자동으로 일치하는지 E2E.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));

test.describe('Phase 6-3: 버전 정보 자동 연동', () => {
  test('드로어 하단에 package.json의 실제 버전이 표시된다(하드코딩 아님)', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByText('재직증명서.jpg').click();
    await page.locator('button[aria-label="전체 메뉴"]').click();
    await expect(page.locator('.dr-foot')).toHaveText(`버전 ${pkg.version}`);
    await expect(page.locator('.dr-foot')).not.toHaveText('버전 1.0.4');
  });
});
