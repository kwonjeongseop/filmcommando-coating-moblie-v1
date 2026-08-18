// Phase 11-1: 카메라 문서 영역 자동 감지 안정성 게이팅(v0.1.5 수정2) E2E.
// 핸들 안전 여백([0.05,0.95] clamp, v0.1.5 수정1)은 phase9-3-handle-margin.spec.ts에서 이미 검증
// 중이므로 여기서는 중복 작성하지 않고, 그쪽에서 다루지 않은 "감지 안정성 게이팅"만 다룬다.
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

async function openCameraAndCapture(page) {
  await page.getByText('카메라로 촬영').click();
  await page.locator('video').waitFor({ state: 'visible' });
  await page.waitForTimeout(3000); // OpenCV.js 로드+초기화 + 여러 분석 tick 누적 대기
  await page.getByText('촬영', { exact: true }).click();
}

async function readHandlePositions(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.preview-modal canvas');
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    const { data } = ctx.getImageData(0, 0, w, h);
    let minX = 1, maxX = 0, minY = 1, maxY = 0, found = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (Math.abs(data[i] - 0x2b) < 20 && Math.abs(data[i + 1] - 0x6c) < 20 && Math.abs(data[i + 2] - 0xe6) < 20) {
          found++;
          const nx = x / w, ny = y / h;
          if (nx < minX) minX = nx; if (nx > maxX) maxX = nx;
          if (ny < minY) minY = ny; if (ny > maxY) maxY = ny;
        }
      }
    }
    return { found, minX, maxX, minY, maxY };
  });
}

test.describe('Phase 11-1: 문서 영역 자동 감지 안정성 게이팅', () => {
  test.beforeEach(async ({ page }) => {
    await installEdgeClippedDocCamera(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('문서 영역이 화면 경계에 걸쳐 잘려 있으면 촬영 시 기본(폴백) 사각형이 사용된다', async ({ page }) => {
    await openCameraAndCapture(page);
    await expect(page.getByText('촬영 확인 · 범위 조정')).toBeVisible();

    // capturePhoto의 감지 실패 폴백은 [0.05,0.05]~[0.95,0.95](x폭 0.9)로 화면 전체에 가깝게 퍼진다.
    // 반대로 실시간 감지값이 반영됐다면 화면 밖으로 걸친 문서의 좌변(x≈0)이 그대로 좌측 핸들에
    // 반영되어야 하므로, 좌측 핸들이 안전 여백(0.05) 안쪽에 머문다는 사실 자체가 "경계 클리핑으로
    // 판단되어 boxRef가 갱신되지 않고 폴백이 쓰였다"는 증거가 된다.
    const pos = await readHandlePositions(page);
    expect(pos.found).toBeGreaterThan(0);
    expect(pos.maxX - pos.minX).toBeGreaterThan(0.7);
    expect(pos.minX).toBeGreaterThan(0.02);
    expect(pos.maxX).toBeLessThan(0.98);
  });
});
