// Phase 12-1: 홈 화면 "최근 서류" 위젯 실제 데이터 연동(v0.1.6 수정3) E2E.
import { test, expect } from '@playwright/test';

async function seedDocs(page, docs) {
  await page.goto('/');
  await page.evaluate((docsArg) => {
    localStorage.clear();
    localStorage.setItem('docstamp_v2', JSON.stringify({
      screen: 'capture',
      pages: [{ docMode: 'sample', docImage: null, placed: [] }],
      currentPage: 0, docName: '재직증명서', docs: docsArg, recent: [], favId: null, settings: {},
    }));
  }, docs);
  await page.reload();
}

test.describe('Phase 12-1: 홈 화면 최근 서류 위젯', () => {
  test('저장된 서류가 없으면 "최근 서류" 섹션 자체가 표시되지 않는다', async ({ page }) => {
    await seedDocs(page, []);
    await expect(page.getByText('최근 서류')).toHaveCount(0);
  });

  test('저장된 서류가 있으면 최신순 최대 3개까지 실제 이름·도장 개수로 표시된다', async ({ page }) => {
    const docs = [
      { id: 'd3', name: '세번째문서', date: '2026-08-18T03:00:00.000Z', stampCount: 2, thumbnail: null, docMode: 'sample', docImage: null, placed: [] },
      { id: 'd2', name: '두번째문서', date: '2026-08-17T03:00:00.000Z', stampCount: 0, thumbnail: null, docMode: 'sample', docImage: null, placed: [] },
      { id: 'd1', name: '첫번째문서', date: '2026-08-16T03:00:00.000Z', stampCount: 1, thumbnail: null, docMode: 'sample', docImage: null, placed: [] },
      { id: 'd0', name: '네번째문서(안보임)', date: '2026-08-15T03:00:00.000Z', stampCount: 0, thumbnail: null, docMode: 'sample', docImage: null, placed: [] },
    ];
    await seedDocs(page, docs);
    await expect(page.getByText('최근 서류')).toBeVisible();

    const rows = page.locator('.recent-row');
    await expect(rows).toHaveCount(3); // docs 배열 순서대로 최대 3개(최신순은 저장 시점에 이미 맨 앞에 추가됨)
    await expect(rows.nth(0)).toContainText('세번째문서');
    await expect(rows.nth(0)).toContainText('도장 2개');
    await expect(rows.nth(1)).toContainText('두번째문서');
    await expect(rows.nth(1)).toContainText('도장 미적용');
    await expect(rows.nth(2)).toContainText('첫번째문서');
    await expect(page.getByText('네번째문서(안보임)')).toHaveCount(0);
  });

  test('최근 서류 항목을 클릭하면 해당 서류가 에디터에서 열린다', async ({ page }) => {
    const docs = [
      { id: 'd1', name: '불러올문서', date: '2026-08-18T03:00:00.000Z', stampCount: 3, thumbnail: null, docMode: 'sample', docImage: null, placed: [] },
    ];
    await seedDocs(page, docs);
    await page.locator('.recent-row').first().click();
    await expect(page.locator('.apptitle')).toHaveText('불러올문서');
  });
});
