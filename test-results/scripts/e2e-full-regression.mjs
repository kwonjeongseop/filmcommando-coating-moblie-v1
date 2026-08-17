// Phase 1-1 ~ 4-6 핵심 시나리오 통합 회귀 테스트 (Playwright core API, 순차 실행).
// 각 단계는 독립적으로 try/catch로 감싸 하나가 실패해도 이후 단계를 계속 진행하고,
// 최종적으로 test-results/logs/e2e-final.log 에 단계별 PASS/FAIL 요약을 기록한다.
import { chromium } from 'playwright';
import fs from 'node:fs';

const shotDir = 'C:/claude/filmcommando-coating-moblie-v1/test-results/screenshots';
const logPath = 'C:/claude/filmcommando-coating-moblie-v1/test-results/logs/e2e-final.log';
const steps = [];
let n = 0;

const record = (name, status, detail) => {
  n++;
  const id = String(n).padStart(2, '0');
  steps.push({ id, name, status, detail: detail || '' });
  return id;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, hasTouch: true });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// 저장/공유 단계에서 실제 파일 다운로드 트리거가 헤드리스 실행을 막지 않도록 무력화(테스트 전용)
await page.addInitScript(() => {
  const origCreateElement = document.createElement.bind(document);
  document.createElement = function (tag) {
    const el = origCreateElement(tag);
    if (tag === 'a') el.click = function () {};
    return el;
  };
});
// getUserMedia를 어두운 배경 위 밝은 문서 사각형을 그리는 canvas.captureStream()으로 대체 —
// 최초 goto 이전에 등록해야 이후 SPA 내 모든 화면 전환에서 실제 카메라 권한 프롬프트/파일
// 선택기 폴백 없이 항상 합성 카메라가 사용된다 (테스트 전용, 앱 코드 무관).
await page.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 480;
    const ctx = c.getContext('2d');
    const draw = () => {
      ctx.fillStyle = '#202020'; ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#f5f5f0'; ctx.fillRect(120, 90, 400, 300);
      requestAnimationFrame(draw);
    };
    draw();
    return c.captureStream(30);
  };
});

const shot = (id, label) => page.screenshot({ path: `${shotDir}/e2e-${id}-${label}.png` }).catch(() => {});

try {
  // ── Phase 1-1: 캡처 화면 진입 ──────────────────────────────────────────
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.capture').waitFor({ state: 'visible', timeout: 5000 });
  let id = record('Phase 1-1: 캡처 화면 진입', 'PASS', 'CaptureScreen 렌더링 확인');
  await shot(id, 'capture-screen');
} catch (e) { record('Phase 1-1: 캡처 화면 진입', 'FAIL', e.message); }

try {
  // ── Phase 1-1: 샘플 문서 로드 → 에디터 ────────────────────────────────
  await page.getByText('재직증명서.jpg').click();
  await page.locator('.appbar .apptitle').waitFor({ state: 'visible', timeout: 5000 });
  const title = await page.locator('.appbar .apptitle').innerText();
  const id = record('Phase 1-1: 샘플 문서 로드', title === '재직증명서' ? 'PASS' : 'FAIL', `apptitle=${title}`);
  await shot(id, 'editor-loaded');
} catch (e) { record('Phase 1-1: 샘플 문서 로드', 'FAIL', e.message); }

try {
  // ── Phase 1-2 + 1-3: 도장 생성(이름으로 만들기) 및 배치 ────────────────
  await page.locator('button[aria-label="도장"]').click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')).library.length);
  await page.locator('.stamp-card.add').click();
  await page.locator('.tf').fill('회귀');
  await page.getByText('보관함에 등록').click();
  await page.waitForTimeout(200);
  const afterAdd = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')).library.length);

  await page.locator('button[aria-label="도장"]').click();
  await page.locator('.stamp-card-label', { hasText: '회귀' }).click();
  await page.getByRole('button', { name: '확인' }).click();
  const box = await page.locator('.page').boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.4);
  await page.waitForTimeout(150);
  const placedCount = await page.evaluate(() => {
    const ls = JSON.parse(localStorage.getItem('docstamp_v2'));
    return ls.pages[ls.currentPage].placed.length;
  });
  const ok = afterAdd === before + 1 && placedCount === 1;
  const id = record('Phase 1-2/1-3: 도장 생성 및 배치', ok ? 'PASS' : 'FAIL', `library ${before}→${afterAdd}, placed=${placedCount}`);
  await shot(id, 'stamp-placed');
} catch (e) { record('Phase 1-2/1-3: 도장 생성 및 배치', 'FAIL', e.message); }

try {
  // ── Phase 1-4: 핸들로 크기·회전 조작 ───────────────────────────────────
  const placedBox = await page.locator('.placed').boundingBox();
  const before = await page.evaluate(() => {
    const ls = JSON.parse(localStorage.getItem('docstamp_v2'));
    return ls.pages[ls.currentPage].placed[0];
  });
  const resHandle = page.locator('.h-res');
  const resBox = await resHandle.boundingBox();
  await page.mouse.move(resBox.x + resBox.width / 2, resBox.y + resBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resBox.x + 40, resBox.y + 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => {
    const ls = JSON.parse(localStorage.getItem('docstamp_v2'));
    return ls.pages[ls.currentPage].placed[0];
  });
  const ok = after.scale !== before.scale;
  const id = record('Phase 1-4: 핸들 크기 조작', ok ? 'PASS' : 'FAIL', `scale ${before.scale.toFixed(2)}→${after.scale.toFixed(2)}`);
  await shot(id, 'handle-resize');
} catch (e) { record('Phase 1-4: 핸들 크기 조작', 'FAIL', e.message); }

try {
  // ── Phase 1-5/2-2: PDF 저장 ────────────────────────────────────────────
  await page.locator('button[aria-label="저장"]').click();
  await page.locator('.dialog.sm .btn.solid').click();
  await page.waitForTimeout(1200);
  const toast = await page.locator('.toast').innerText().catch(() => null);
  const ok = !!toast && toast.includes('저장');
  const id = record('Phase 1-5/2-2: PDF 저장', ok ? 'PASS' : 'FAIL', `toast="${toast}"`);
  await shot(id, 'pdf-saved');
} catch (e) { record('Phase 1-5/2-2: PDF 저장', 'FAIL', e.message); }

try {
  // ── Phase 2-1: 카메라 촬영(합성 카메라, getUserMedia는 세션 시작 시 이미 패치됨) ──────
  await page.locator('button[aria-label="뒤로"]').click();
  await page.locator('.capture').waitFor({ state: 'visible' });
  await page.getByText('카메라로 촬영').click();
  await page.locator('video').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(1000);
  await page.getByText('촬영', { exact: true }).click();
  await page.waitForTimeout(500);
  const docName = await page.locator('.appbar .apptitle').innerText().catch(() => null);
  const ok = docName === '촬영 서류';
  const id = record('Phase 2-1: 카메라 촬영', ok ? 'PASS' : 'FAIL', `docName="${docName}"`);
  await shot(id, 'camera-captured');
} catch (e) { record('Phase 2-1: 카메라 촬영', 'FAIL', e.message); }

try {
  // ── Phase 2-3: 서명·사인 폰트 도장 배치 ────────────────────────────────
  await page.locator('button[aria-label="도장"]').click();
  await page.locator('.chip', { hasText: '서명' }).click();
  await page.locator('.stamp-card-label').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  const box = await page.locator('.page').boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6);
  await page.waitForTimeout(150);
  const kind = await page.evaluate(() => {
    const ls = JSON.parse(localStorage.getItem('docstamp_v2'));
    const p = ls.pages[ls.currentPage].placed.at(-1);
    return ls.library.find((s) => s.id === p.stampId)?.kind;
  });
  const id = record('Phase 2-3: 서명 폰트 도장 배치', kind === 'signature' ? 'PASS' : 'FAIL', `kind=${kind}`);
  await shot(id, 'signature-placed');
} catch (e) { record('Phase 2-3: 서명 폰트 도장 배치', 'FAIL', e.message); }

try {
  // ── Phase 2-4/4-1: 이미지 업로드 + 배경 제거 ──────────────────────────
  await page.locator('button[aria-label="도장"]').click();
  await page.locator('.stamp-card.add').click();
  await page.getByText('촬영 · 업로드').click();
  await page.setInputFiles('input[type="file"]', 'C:/claude/filmcommando-coating-moblie-v1/test-results/scripts/phase4-1-test-stamp.png');
  await page.waitForTimeout(500);
  const entry = await page.evaluate(() => {
    const ls = JSON.parse(localStorage.getItem('docstamp_v2'));
    return ls.library.find((s) => s.kind === 'image' && s.label.startsWith('업로드'));
  });
  const transparent = entry ? await page.evaluate((src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let t = 0, total = 0;
      for (let i = 0; i < data.length; i += 4) { total++; if (data[i + 3] === 0) t++; }
      resolve(t / total);
    };
    img.src = src;
  }), entry.src) : 0;
  const ok = !!entry && transparent > 0.3;
  const id = record('Phase 2-4/4-1: 업로드+배경제거', ok ? 'PASS' : 'FAIL', `투명비율=${(transparent * 100).toFixed(1)}%`);
  await shot(id, 'upload-bgremoved');
} catch (e) { record('Phase 2-4/4-1: 업로드+배경제거', 'FAIL', e.message); }

try {
  // ── Phase 2-5: Undo/Redo ──────────────────────────────────────────────
  const before = await page.evaluate(() => {
    const ls = JSON.parse(localStorage.getItem('docstamp_v2'));
    return ls.pages[ls.currentPage].placed.length;
  });
  await page.locator('button[aria-label="전단계"]').click();
  await page.waitForTimeout(150);
  const afterUndo = await page.evaluate(() => {
    const ls = JSON.parse(localStorage.getItem('docstamp_v2'));
    return ls.pages[ls.currentPage].placed.length;
  });
  await page.locator('button[aria-label="다음단계"]').click();
  await page.waitForTimeout(150);
  const afterRedo = await page.evaluate(() => {
    const ls = JSON.parse(localStorage.getItem('docstamp_v2'));
    return ls.pages[ls.currentPage].placed.length;
  });
  const ok = afterUndo !== before && afterRedo === before;
  const id = record('Phase 2-5: Undo/Redo', ok ? 'PASS' : 'FAIL', `before=${before} undo=${afterUndo} redo=${afterRedo}`);
  await shot(id, 'undo-redo');
} catch (e) { record('Phase 2-5: Undo/Redo', 'FAIL', e.message); }

try {
  // ── Phase 3-1: 공유 시트 ───────────────────────────────────────────────
  await page.locator('button[aria-label="공유"]').click();
  await page.locator('.sheet-title', { hasText: '공유' }).waitFor({ state: 'visible' });
  await page.locator('.share-item', { hasText: '링크 복사' }).click();
  await page.waitForTimeout(200);
  const toast = await page.locator('.toast').innerText().catch(() => null);
  const id = record('Phase 3-1: 공유 시트', toast ? 'PASS' : 'FAIL', `toast="${toast}"`);
  await shot(id, 'share-sheet');
} catch (e) { record('Phase 3-1: 공유 시트', 'FAIL', e.message); }

try {
  // ── Phase 3-2: 도장 보관함 CRUD ────────────────────────────────────────
  await page.locator('button[aria-label="더보기"]').click();
  await page.getByText('도장 보관함').click();
  await page.locator('.mg-grid').first().waitFor({ state: 'visible' });
  const groupCount = await page.locator('.mg-group').count();
  const id = record('Phase 3-2: 도장 보관함 CRUD', groupCount > 0 ? 'PASS' : 'FAIL', `그룹 수=${groupCount}`);
  await shot(id, 'stamp-manager');
  await page.locator('button[aria-label="뒤로"]').click();
} catch (e) { record('Phase 3-2: 도장 보관함 CRUD', 'FAIL', e.message); }

try {
  // ── Phase 3-3: 내 서류함 ───────────────────────────────────────────────
  await page.locator('button[aria-label="전체 메뉴"]').click();
  await page.getByText('내 서류함').click();
  await page.locator('.appbar .apptitle', { hasText: '내 서류함' }).waitFor({ state: 'visible' });
  const docsCount = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')).docs.length);
  const id = record('Phase 3-3: 내 서류함', docsCount > 0 ? 'PASS' : 'FAIL', `docs.length=${docsCount}`);
  await shot(id, 'docs-screen');
  // DocsScreen.onBack은 capture 화면으로 이동하므로, 대신 서류함 항목을 클릭해 에디터로 복귀한다
  await page.locator('.doc-row').first().click();
  await page.locator('.appbar .apptitle').waitFor({ state: 'visible' });
} catch (e) { record('Phase 3-3: 내 서류함', 'FAIL', e.message); }

try {
  // ── Phase 3-4: 설정 + 자동저장 ─────────────────────────────────────────
  await page.locator('button[aria-label="더보기"]').click();
  await page.getByText('설정', { exact: true }).click();
  await page.locator('.st-glabel', { hasText: '도장 기본값' }).waitFor({ state: 'visible' });
  const beforeAutosave = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')).settings.autosave);
  await page.locator('button[aria-label="autosave"]').click();
  await page.waitForTimeout(100);
  const afterAutosave = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')).settings.autosave);
  const ok = beforeAutosave !== afterAutosave;
  const id = record('Phase 3-4: 설정+자동저장', ok ? 'PASS' : 'FAIL', `autosave ${beforeAutosave}→${afterAutosave}`);
  await shot(id, 'settings');
  await page.locator('button[aria-label="뒤로"]').click();
} catch (e) { record('Phase 3-4: 설정+자동저장', 'FAIL', e.message); }

try {
  // ── Phase 4-2: 다중 페이지 ─────────────────────────────────────────────
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')).pages.length);
  await page.locator('button[aria-label="더보기"]').click();
  await page.getByText('페이지 추가').click();
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('docstamp_v2')).pages.length);
  const ok = after === before + 1;
  const id = record('Phase 4-2: 다중 페이지', ok ? 'PASS' : 'FAIL', `pages ${before}→${after}`);
  await shot(id, 'multipage');
} catch (e) { record('Phase 4-2: 다중 페이지', 'FAIL', e.message); }

try {
  // ── Phase 4-3: 테마 시스템 ─────────────────────────────────────────────
  await page.evaluate(() => window.postMessage({ type: '__activate_edit_mode' }, '*'));
  await page.waitForTimeout(300);
  await page.locator('.twk-chip').nth(2).click(); // Teal
  await page.waitForTimeout(200);
  const primary = await page.evaluate(() => getComputedStyle(document.querySelector('.app-root')).getPropertyValue('--primary').trim());
  const ok = primary.toUpperCase() === '#0E8C86';
  const id = record('Phase 4-3: 테마 시스템', ok ? 'PASS' : 'FAIL', `--primary=${primary}`);
  await shot(id, 'theme-teal');
  await page.locator('.twk-x').click().catch(() => {});
} catch (e) { record('Phase 4-3: 테마 시스템', 'FAIL', e.message); }

try {
  // ── Phase 4-4: 카메라 스캔(OpenCV) ─────────────────────────────────────
  await page.locator('button[aria-label="뒤로"]').click();
  await page.locator('.capture').waitFor({ state: 'visible' });
  await page.getByText('카메라로 촬영').click();
  await page.locator('video').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(6000); // OpenCV.js 로드 대기
  const overlayDrawn = await page.evaluate(() => {
    const cs = document.querySelectorAll('canvas');
    const overlay = cs[cs.length - 1];
    const data = overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
    return false;
  });
  const id = record('Phase 4-4: 카메라 스캔(OpenCV)', overlayDrawn ? 'PASS' : 'FAIL', `overlayDrawn=${overlayDrawn}`);
  await shot(id, 'opencv-scan');
  await page.getByText('촬영', { exact: true }).click();
  await page.waitForTimeout(500);
} catch (e) { record('Phase 4-4: 카메라 스캔(OpenCV)', 'FAIL', e.message); }

try {
  // ── Phase 4-5: 수기 도장 ───────────────────────────────────────────────
  await page.locator('button[aria-label="도장"]').click();
  await page.locator('.stamp-card.add').click();
  await page.getByText('수기로 그리기').click();
  const cbox = await page.locator('canvas').first().boundingBox();
  await page.mouse.move(cbox.x + cbox.width * 0.3, cbox.y + cbox.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(cbox.x + cbox.width * 0.7, cbox.y + cbox.height * 0.7, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  await page.getByText('보관함에 등록').click();
  await page.waitForTimeout(200);
  const entry = await page.evaluate(() => {
    const ls = JSON.parse(localStorage.getItem('docstamp_v2'));
    return ls.library.find((s) => s.label === '수기 도장');
  });
  const id = record('Phase 4-5: 수기 도장', entry ? 'PASS' : 'FAIL', `등록=${!!entry}`);
  await shot(id, 'hand-drawn');
} catch (e) { record('Phase 4-5: 수기 도장', 'FAIL', e.message); }

try {
  // ── Phase 4-6: 드래그·핀치·스냅 ────────────────────────────────────────
  await page.locator('button[aria-label="도장"]').click();
  await page.locator('.stamp-card-label').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  const box = await page.locator('.page').boundingBox();
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.waitForTimeout(150);
  const before = await page.evaluate(() => {
    const ls = JSON.parse(localStorage.getItem('docstamp_v2'));
    return ls.pages[ls.currentPage].placed.at(-1);
  });
  const placedBoxes = await page.locator('.placed').all();
  const lastBox = await placedBoxes.at(-1).boundingBox();
  const from = { x: lastBox.x + lastBox.width / 2, y: lastBox.y + lastBox.height / 2 };
  const to = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.7 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => {
    const ls = JSON.parse(localStorage.getItem('docstamp_v2'));
    return ls.pages[ls.currentPage].placed.at(-1);
  });
  const ok = before.x !== after.x || before.y !== after.y;
  const id = record('Phase 4-6: 본체 드래그 이동', ok ? 'PASS' : 'FAIL', `(${before.x.toFixed(1)},${before.y.toFixed(1)})→(${after.x.toFixed(1)},${after.y.toFixed(1)})`);
  await shot(id, 'drag-move');
} catch (e) { record('Phase 4-6: 본체 드래그 이동', 'FAIL', e.message); }

await browser.close();

const passCount = steps.filter((s) => s.status === 'PASS').length;
const failCount = steps.filter((s) => s.status === 'FAIL').length;
const lines = [];
lines.push('E2E 통합 회귀 테스트 — Phase 1-1 ~ 4-6 핵심 시나리오 순차 실행');
lines.push('실행 일시: ' + new Date().toISOString());
lines.push('대상: http://localhost:5173/ (chromium, viewport 420x900, hasTouch)');
lines.push('');
steps.forEach((s) => {
  const mark = s.status === 'PASS' ? '✅' : '❌';
  lines.push(`${mark} [e2e-${s.id}] ${s.name}`);
  lines.push(`    결과: ${s.status} | ${s.detail}`);
});
lines.push('');
lines.push(`콘솔 pageerror 발생 건수: ${pageErrors.length}`);
pageErrors.forEach((m) => lines.push('  - ' + m));
lines.push('');
lines.push(`종합: ${steps.length}개 시나리오 중 PASS ${passCount} / FAIL ${failCount}`);

fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf-8');
console.log(lines.join('\n'));
