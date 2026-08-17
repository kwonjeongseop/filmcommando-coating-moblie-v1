import { chromium } from 'playwright';
import fs from 'node:fs';

const results = {};
const shotDir = 'C:/claude/filmcommando-coating-moblie-v1/test-results/screenshots';

const browser = await chromium.launch({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, permissions: ['camera'] });
const logs = [];
page.on('pageerror', (e) => logs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') logs.push('[console.error] ' + m.text()); });

// getUserMedia를 어두운 배경 위 밝은 사각형(모의 문서)을 그리는 canvas.captureStream()으로 교체
// — 실제 카메라 없이도 엣지 감지 알고리즘을 의미 있는 입력으로 검증하기 위함(테스트 전용, 앱 코드 무관)
await page.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 480;
    const ctx = c.getContext('2d');
    const draw = () => {
      ctx.fillStyle = '#202020';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#f5f5f0';
      ctx.fillRect(120, 90, 400, 300); // 밝은 "문서" 사각형
      requestAnimationFrame(draw);
    };
    draw();
    return c.captureStream(30);
  };
});

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// open camera
await page.getByText('카메라로 촬영').click();
await page.locator('video').waitFor({ state: 'visible' });
await page.waitForTimeout(1500); // let a few detection ticks run (fake device needs a moment to produce frames)

results.videoDims = await page.evaluate(() => {
  const v = document.querySelector('video');
  return { videoWidth: v.videoWidth, videoHeight: v.videoHeight, clientWidth: v.clientWidth, clientHeight: v.clientHeight };
});

// re-run the same detection algorithm against the live frame to report actual corner coordinates
results.detectedBox = await page.evaluate(() => {
  const video = document.querySelector('video');
  const AW = 96, AH = 128;
  const c = document.createElement('canvas');
  c.width = AW; c.height = AH;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, AW, AH);
  const { data } = ctx.getImageData(0, 0, AW, AH);
  const n = AW * AH;
  const lum = new Float32Array(n);
  let sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lum[p] = l; sum += l;
  }
  const threshold = sum / n + 12;
  let minX = AW, minY = AH, maxX = 0, maxY = 0, count = 0;
  for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) {
    if (lum[y * AW + x] >= threshold) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      count++;
    }
  }
  if (count < n * 0.05 || minX >= maxX || minY >= maxY) return null;
  const vw = video.videoWidth, vh = video.videoHeight;
  return {
    fractions: { x0: minX / AW, y0: minY / AH, x1: maxX / AW, y1: maxY / AH },
    pixelsInFullFrame: {
      tl: [Math.round((minX / AW) * vw), Math.round((minY / AH) * vh)],
      tr: [Math.round((maxX / AW) * vw), Math.round((minY / AH) * vh)],
      br: [Math.round((maxX / AW) * vw), Math.round((maxY / AH) * vh)],
      bl: [Math.round((minX / AW) * vw), Math.round((maxY / AH) * vh)],
    },
  };
});

await page.screenshot({ path: `${shotDir}/phase4-4-preview.png` });

// check overlay canvas actually drew something (non-empty pixel data beyond fully transparent)
results.overlayHasDrawing = await page.evaluate(() => {
  const canvases = document.querySelectorAll('canvas');
  const overlay = canvases[canvases.length - 1];
  if (!overlay || !overlay.width) return false;
  const ctx = overlay.getContext('2d');
  const data = ctx.getImageData(0, 0, overlay.width, overlay.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
  return false;
});

// capture photo
await page.getByText('촬영', { exact: true }).click();
await page.waitForTimeout(500);

const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')));
const docImage = ls.pages[0].docImage;
results.docImagePresent = !!docImage;
results.docImageBytesBase64 = docImage ? docImage.length : 0;

results.correctedImageDims = await page.evaluate((src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
  img.onerror = () => resolve(null);
  img.src = src;
}), docImage);

// 보정된 이미지 자체를 단독으로 캡처 (앱 레이아웃과 분리해서 결과물만 확인)
const capturedPage = await browser.newPage({ viewport: { width: 420, height: 500 } });
await capturedPage.setContent(`<body style="margin:0;background:#888;display:flex;align-items:center;justify-content:center;height:100vh">
  <img src="${docImage}" style="max-width:100%;max-height:100%;box-shadow:0 4px 16px rgba(0,0,0,.4)" />
</body>`);
await capturedPage.screenshot({ path: `${shotDir}/phase4-4-captured.png` });
await capturedPage.close();

await page.locator('.appbar .apptitle').waitFor({ state: 'visible' });
await page.screenshot({ path: `${shotDir}/phase4-4-editor.png` });

results.pageErrors = logs;
fs.writeFileSync('C:/Users/kwonh/AppData/Local/Temp/claude/phase4-4-result.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

await browser.close();
