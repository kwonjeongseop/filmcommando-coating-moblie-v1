// Phase 5-1: 원형 도장(seal) 텍스트가 원 밖으로 넘치지 않는지 검증 (이슈 8 수정 회귀 테스트).
// Range.getBoundingClientRect()로 실제 렌더링된 글자 픽셀 범위를 측정해, flex 셀 박스가 아닌
// 진짜 글자 외곽이 원형 div의 사각 바운딩박스 안에 들어오는지 확인한다.
import { test, expect } from '@playwright/test';

const SEALS = [
  { label: '인감 · 김민수', text: '金民洙' },   // 3자
  { label: '막도장 · 이영희', text: '이영희' }, // 3자
  { label: '법인 직인', text: '대한법인' },     // 4자
];

async function placeSeal(page, label) {
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
  await page.locator('.stamp-card', { hasText: label }).click();
  await page.getByRole('button', { name: '확인' }).click();
  const pageBox = await page.locator('.page').boundingBox();
  await page.mouse.click(pageBox.x + pageBox.width * 0.5, pageBox.y + pageBox.height * 0.5);
  await page.waitForTimeout(150);
}

test.describe('Phase 5-1: 원형 도장 텍스트 fit (이슈 8)', () => {
  for (const seal of SEALS) {
    test(`"${seal.text}"(${[...seal.text].length}자) 글자가 원 밖으로 넘치지 않는다`, async ({ page }) => {
      await placeSeal(page, seal.label);

      const result = await page.evaluate(() => {
        const placed = document.querySelector('.placed');
        const circle = placed.firstElementChild; // SealVisual 최외곽 원형 div
        const circleRect = circle.getBoundingClientRect();
        const spans = Array.from(circle.querySelectorAll('span'));
        const spanRects = spans.map((s) => {
          const range = document.createRange();
          range.selectNodeContents(s);
          const r = range.getBoundingClientRect(); // flex 셀 박스가 아닌 실제 글자 픽셀 범위
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
        });
        return {
          circle: { left: circleRect.left, top: circleRect.top, right: circleRect.right, bottom: circleRect.bottom },
          spans: spanRects,
        };
      });

      expect(result.spans.length).toBeGreaterThan(0);
      const EPS = 0.75; // 서브픽셀 반올림 오차 허용
      for (const s of result.spans) {
        expect(s.w).toBeGreaterThan(0); // 글자가 실제로 렌더링됐는지 sanity check
        expect(s.left).toBeGreaterThanOrEqual(result.circle.left - EPS);
        expect(s.top).toBeGreaterThanOrEqual(result.circle.top - EPS);
        expect(s.right).toBeLessThanOrEqual(result.circle.right + EPS);
        expect(s.bottom).toBeLessThanOrEqual(result.circle.bottom + EPS);
      }

      await page.screenshot({
        path: `../test-results/screenshots/phase5-1-seal-${[...seal.text].length}char-${seal.text}.png`,
        clip: { x: result.circle.left - 10, y: result.circle.top - 10, width: (result.circle.right - result.circle.left) + 20, height: (result.circle.bottom - result.circle.top) + 20 },
      });
    });
  }
});
