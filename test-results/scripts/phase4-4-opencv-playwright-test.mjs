import { chromium } from 'playwright';
import fs from 'node:fs';

const results = {};
const shotDir = 'C:/claude/filmcommando-coating-moblie-v1/test-results/screenshots';

const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, permissions: ['camera'] });
const logs = [];
page.on('pageerror', (e) => logs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') logs.push('[console.error] ' + m.text()); });

let opencvChunkRequested = false;
page.on('request', (req) => {
  if (/opencv.*\.js/i.test(req.url())) opencvChunkRequested = true;
});

// getUserMedia를 어두운 배경 위 밝은 사각형(모의 문서)을 그리는 canvas.captureStream()으로 교체
await page.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 480;
    const ctx = c.getContext('2d');
    const draw = () => {
      ctx.fillStyle = '#202020';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#f5f5f0';
      ctx.fillRect(120, 90, 400, 300);
      requestAnimationFrame(draw);
    };
    draw();
    return c.captureStream(30);
  };
});

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

await page.getByText('카메라로 촬영').click();
await page.locator('video').waitFor({ state: 'visible' });

// OpenCV.js(13MB WASM) 로드+초기화 대기 — 넉넉히 8초
await page.waitForTimeout(8000);
results.opencvChunkRequested = opencvChunkRequested;

results.videoDims = await page.evaluate(() => {
  const v = document.querySelector('video');
  return { videoWidth: v.videoWidth, videoHeight: v.videoHeight };
});

results.detectedBox = await page.evaluate(() => {
  const canvases = document.querySelectorAll('canvas');
  const overlay = canvases[canvases.length - 1];
  const ctx = overlay.getContext('2d');
  const data = ctx.getImageData(0, 0, overlay.width, overlay.height).data;
  let minX = overlay.width, minY = overlay.height, maxX = 0, maxY = 0, found = false;
  for (let y = 0; y < overlay.height; y++) for (let x = 0; x < overlay.width; x++) {
    const a = data[(y * overlay.width + x) * 4 + 3];
    if (a > 0) { found = true; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  const v = document.querySelector('video');
  if (!found) return null;
  const scaleX = v.videoWidth / overlay.width, scaleY = v.videoHeight / overlay.height;
  return {
    overlayBoxPx: { minX, minY, maxX, maxY },
    approxFullFramePx: {
      x0: Math.round(minX * scaleX), y0: Math.round(minY * scaleY),
      x1: Math.round(maxX * scaleX), y1: Math.round(maxY * scaleY),
    },
  };
});

await page.screenshot({ path: `${shotDir}/phase4-4-opencv-preview.png` });

await page.getByText('촬영', { exact: true }).click();
await page.waitForTimeout(800);

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

const capturedPage = await browser.newPage({ viewport: { width: 420, height: 500 } });
await capturedPage.setContent(`<body style="margin:0;background:#888;display:flex;align-items:center;justify-content:center;height:100vh">
  <img src="${docImage}" style="max-width:100%;max-height:100%;box-shadow:0 4px 16px rgba(0,0,0,.4)" />
</body>`);
await capturedPage.screenshot({ path: `${shotDir}/phase4-4-opencv-captured.png` });
await capturedPage.close();

results.pageErrors = logs;
fs.writeFileSync('C:/Users/kwonh/AppData/Local/Temp/claude/phase4-4-opencv-result.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

await browser.close();
