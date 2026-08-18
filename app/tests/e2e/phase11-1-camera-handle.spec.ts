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
  // v0.2.3: STABLE_TIMEOUT_MS(app.jsx, 5000ms)이 카메라가 열린 시점부터 흐르는데, 고정 시간을
  // 대기하는 방식은 시스템 부하로 실제 대기 시간이 요청값의 2~4배까지 늘어날 수 있어(측정 결과
  // waitForTimeout(1500)이 실제로 3~4초 이상 걸리는 사례 확인) 5000ms 컷오프를 넘겨 "차단"이 아닌
  // "경고 후 촬영 허용" 분기로 흘러 flaky하게 실패했다(EDGE_CLIP_MARGIN과 무관한 순수 타이밍 문제).
  // 이 테스트가 검증하는 차단 조건(stableRef.count < STABLE_FRAMES_REQUIRED)은 카메라를 연 직후
  // 초기값(count=0)만으로 이미 충족되므로 분석 tick을 기다릴 필요가 없다 — 대기 없이 곧바로
  // 촬영을 시도해 5000ms 컷오프 노출 자체를 최소화한다.
}

test.describe('Phase 11-1: 문서 영역 자동 감지 안정성 게이팅', () => {
  test.beforeEach(async ({ page }) => {
    await installEdgeClippedDocCamera(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('문서 영역이 화면 경계에 걸쳐 잘려 있으면 경고 토스트가 표시되고 촬영이 진행된다(v0.2.4 수정3)', async ({ page }) => {
    await openCamera(page);
    await page.getByText('촬영', { exact: true }).click();

    // v0.2.4: capturePhoto의 차단(return) 분기가 제거되어, 경계 클리핑으로 안정화되지 않은 상태여도
    // 촬영을 막지 않고 경고 토스트만 표시한 뒤 그대로 리뷰 화면으로 넘어간다. 토스트는 2.2초 후
    // 자동으로 사라지므로(app.jsx showToast) 가장 시간에 민감한 토스트 확인을 먼저 한다.
    await expect(page.locator('.toast')).toHaveText(/문서 경계를 확인해 주세요/);
    await expect(page.getByText('촬영 확인 · 범위 조정')).toBeVisible();
    await expect(page.locator('video')).toHaveCount(0);
  });
});
