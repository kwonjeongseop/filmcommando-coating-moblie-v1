// Phase 11-1: 카메라 문서 영역 자동 감지 안정성 게이팅(v0.1.5 수정2) E2E.
// 핸들 안전 여백([0.05,0.95] clamp, v0.1.5 수정1)은 phase9-3-handle-margin.spec.ts에서 이미 검증
// 중이므로 여기서는 중복 작성하지 않고, 그쪽에서 다루지 않은 "감지 안정성 게이팅"만 다룬다.
// v0.1.6: 안정화되지 않은 상태(경계 클리핑 포함)에서는 촬영 자체가 차단되도록 바뀌어(app.jsx
// capturePhoto), "감지 실패 시에도 폴백으로 촬영이 된다"는 이전 전제는 더 이상 유효하지 않다.
import { test, expect } from '@playwright/test';

// 문서처럼 보이는 밝은 사각형을 왼쪽 화면 경계 밖으로 일부 걸치게 정적으로 배치한 가짜 카메라.
// 매 tick마다 감지된 사각형의 좌변이 프레임 경계(x=0)에 붙어 있어 EDGE_CLIP_MARGIN(0.03) 판정에
// 항상 걸리므로, 시간·타이밍에 의존하지 않고 결정론적으로 "매번 잘림으로 판단되어 boxRef가 절대
// 갱신되지 않는다"를 검증할 수 있다(정지 화면이라 프레임 간 무작위성으로 인한 flaky 위험이 없음).
async function installEdgeClippedDocCamera(page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas');
      c.width = 640; c.height = 480;
      const ctx = c.getContext('2d');
      const draw = () => {
        ctx.fillStyle = '#202020';
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = '#f5f5f0';
        ctx.fillRect(-80, 90, 300, 300); // 좌측이 화면 밖으로 나가 좌변이 항상 x=0에 붙음
        requestAnimationFrame(draw);
      };
      draw();
      return c.captureStream(30);
    };
  });
}

async function openCamera(page) {
  await page.getByText('카메라로 촬영').click();
  await page.locator('video').waitFor({ state: 'visible' });
  await page.waitForTimeout(3000); // OpenCV.js 로드+초기화 + 여러 분석 tick 누적 대기
}

test.describe('Phase 11-1: 문서 영역 자동 감지 안정성 게이팅', () => {
  test.beforeEach(async ({ page }) => {
    await installEdgeClippedDocCamera(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('문서 영역이 화면 경계에 걸쳐 잘려 있으면 촬영이 차단되고 안내 토스트가 표시된다(v0.1.6 수정2)', async ({ page }) => {
    await openCamera(page);
    await page.getByText('촬영', { exact: true }).click();

    // 경계 클리핑으로 판단되어(boxRef 미갱신) 리뷰 화면으로 넘어가지 않고 라이브 카메라 화면에
    // 남아야 하며, 사용자에게 안내 토스트가 표시되어야 한다.
    await expect(page.getByText('촬영 확인 · 범위 조정')).toHaveCount(0);
    await expect(page.locator('video')).toBeVisible();
    await expect(page.locator('.toast')).toHaveText(/문서 전체가 보이도록 카메라를 조정해 주세요/); // v0.1.7 수정1: 안내 문구 변경
  });
});
