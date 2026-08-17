import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, permissions: ['camera'] });
const logs = [];
page.on('pageerror', (e) => logs.push(e.message));

// OpenCV.js 청크 요청을 차단해 로드 실패 상황을 재현
await page.route(/opencv.*\.js/i, (route) => route.abort('failed'));

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
await page.waitForTimeout(2000); // OpenCV 로드 실패까지 기다림 (차단되어 즉시 reject)

const overlayDrawn = await page.evaluate(() => {
  const canvases = document.querySelectorAll('canvas');
  const overlay = canvases[canvases.length - 1];
  const data = overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
  return false;
});

await page.getByText('촬영', { exact: true }).click();
await page.waitForTimeout(500);
const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')));
const docImage = ls.pages[0].docImage;
const dims = await page.evaluate((src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
  img.src = src;
}), docImage);

console.log(JSON.stringify({
  overlayDrawnViaCanvasFallback: overlayDrawn,
  docImagePresent: !!docImage,
  correctedDims: dims,
  pageErrors: logs,
}, null, 2));

await browser.close();
