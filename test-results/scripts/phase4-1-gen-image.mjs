import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');
const dataUrl = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 200; c.height = 200;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 200, 200);
  ctx.fillStyle = '#D7402B';
  ctx.beginPath();
  ctx.arc(100, 100, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 60px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('印', 100, 105);
  return c.toDataURL('image/png');
});
const base64 = dataUrl.split(',')[1];
fs.writeFileSync('C:/claude/filmcommando-coating-moblie-v1/test-results/scripts/phase4-1-test-stamp.png', Buffer.from(base64, 'base64'));
console.log('written');
await browser.close();
