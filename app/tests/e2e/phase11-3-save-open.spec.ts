// Phase 11-3: 저장 완료 토스트 "파일 열기" 액션(v0.1.5 수정4) E2E.
// saveNativeFile(및 그 안의 onOpen 콜백)은 Capacitor.isNativePlatform()이 true인 네이티브 빌드에서만
// 실행되는 경로라 Playwright(웹 브라우저 컨텍스트, isNativePlatform=false)로는 직접 진입할 수 없다.
// 실제 "파일 열기" 클릭 → Share.share() 동작은 test-results/logs/v0.1.5-fix.log·verify.dat에 기록된
// 실기기(CDP) 검증으로 대체되어 있으므로, 여기서는 웹 저장 경로가 onOpen 없는 기존 방식 그대로
// 유지되는지(=네이티브 전용 분기가 웹 경로로 새지 않는지)를 회귀 가드로 검증한다.
import { test, expect } from '@playwright/test';

async function seedImageDoc(page) {
  await page.goto('/');
  const original = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 300;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 200, 300);
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

test.describe('Phase 11-3: 저장 완료 토스트 파일 열기(웹 경로 회귀 가드)', () => {
  test('웹 환경(Capacitor 비-네이티브)에서는 저장 토스트에 "파일 열기" 버튼이 없다', async ({ page }) => {
    await seedImageDoc(page);
    await page.getByRole('button', { name: '저장' }).click();
    await page.getByText('PDF', { exact: true }).click();
    await page.locator('.dialog.sm').getByText('저장', { exact: true }).click();

    await expect(page.locator('.toast')).toBeVisible();
    await expect(page.locator('.toast')).toHaveText(/저장했습니다/);
    // 웹 경로(onShareAction의 URL.createObjectURL+<a download> 분기)는 showToast를 인자 1개로만
    // 호출하므로 onOpen이 없다 — "파일 열기" 버튼이 렌더링되지 않아야 한다.
    await expect(page.locator('.toast button')).toHaveCount(0);
  });

  test('일반 토스트(도장 삭제 등)는 여전히 2.2초 내외로 자동 사라진다(5초 토스트와 구분됨)', async ({ page }) => {
    // seedImageDoc처럼 library를 빈 배열로 세팅하면 도장 보관함이 비어 stamp-card가 하나도 없으므로,
    // 여기서는 loadSample()이 기본 보관함(SAMPLE_LIBRARY)을 채워주는 정상 진입 경로를 사용한다.
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByText('재직증명서.jpg').click();
    await page.locator('button[aria-label="도장"]').click();
    await page.locator('.stamp-card-label').first().click();
    await page.getByRole('button', { name: '확인' }).click();
    const pageBox = await page.locator('.page').boundingBox();
    await page.mouse.click(pageBox.x + pageBox.width * 0.5, pageBox.y + pageBox.height * 0.5);
    await page.waitForTimeout(150);

    await page.locator('button[aria-label="더보기"]').click();
    await page.getByText('찍은 도장 모두 지우기').click();
    await page.getByRole('button', { name: '모두 지우기' }).click();
    await expect(page.locator('.toast')).toHaveText(/도장을 모두 지웠습니다/);
    await page.waitForTimeout(2400);
    await expect(page.locator('.toast')).toHaveCount(0);
  });
});
