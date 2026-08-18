/* app.jsx — root: routing, shared state, settings, tweaks, mount */
import { useState as useS, useEffect as useE, useRef as useR } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Icon, SealVisual, SAMPLE_LIBRARY, makeId } from './visuals.jsx';
import { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakRadio, TweakToggle } from './tweaks-panel.jsx';
import { AndroidDevice } from './android-frame.jsx';
import { Drawer, SettingsScreen, StampManagerScreen, DocsScreen, ConfirmDialog } from './menus.jsx';
import { EditorScreen, AddStampSheet } from './editor.jsx';
import { DOC_CLASSES, loadCocoSsdModel } from './tf-detect.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const THEMES = {
  navy:   { primary: '#2B6CE6', primaryDark: '#1E4FB0', navy: '#14233F', surface: '#F4F6FB', card: '#FFFFFF', line: '#E2E7F0', muted: '#5A6B86' },
  indigo: { primary: '#5046E5', primaryDark: '#3A32B5', navy: '#1B1740', surface: '#F5F4FC', card: '#FFFFFF', line: '#E6E4F4', muted: '#615C82' },
  teal:   { primary: '#0E8C86', primaryDark: '#0A6B66', navy: '#0C2E2C', surface: '#F1F8F6', card: '#FFFFFF', line: '#DCEAE6', muted: '#4E726C' },
};
const SEAL_INKS = { '주홍': '#D7402B', '진홍': '#C0182B', '남색': '#1A357A' };

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "navy",
  "popupStyle": "sheet",
  "toolLabels": true
}/*EDITMODE-END*/;

const DEFAULT_SETTINGS = {
  ink: '주홍', size: 0.35, opacity: 1, autoSelect: true,
  format: 'PDF', hq: false, autosave: true, pw: false, localOnly: true,
};

const LS_KEY = 'docstamp_v2';
const loadState = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } };
const saveState = (s) => { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {} };

const AUTOSAVE_KEY = 'docstamp_autosave';
const loadAutosave = () => { try { return JSON.parse(localStorage.getItem(AUTOSAVE_KEY)); } catch (e) { return null; } };

/* 밝기 임계값 기반 문서 윤곽(바운딩 박스) 추정 — 다운샘플된 프레임의 그레이스케일 평균보다
   밝은 픽셀들의 최소·최대 좌표로 문서 사각형을 근사한다. OpenCV.js 미로드/실패 시 폴백으로 쓰인다. */
function estimateDocEdges(data, w, h) {
  const n = w * h;
  const lum = new Float32Array(n);
  let sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lum[p] = l;
    sum += l;
  }
  const threshold = sum / n + 12;
  let minX = w, minY = h, maxX = 0, maxY = 0, count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (lum[y * w + x] >= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }
  if (count < n * 0.05 || minX >= maxX || minY >= maxY) return null;
  const x0 = minX / w, y0 = minY / h, x1 = maxX / w, y1 = maxY / h;
  return { tl: { x: x0, y: y0 }, tr: { x: x1, y: y0 }, br: { x: x1, y: y1 }, bl: { x: x0, y: y1 } };
}

/* OpenCV.js(@techstark/opencv-js)를 지연 로드하고 런타임 초기화까지 기다린 뒤 cv 모듈을 반환한다.
   13MB급 WASM 번들이라 카메라를 실제로 열 때만 동적 import로 불러온다. 로드 실패는 호출부에서
   catch해 기존 Canvas API 폴백으로 넘어간다. */
let cvLoadPromise = null;
function loadOpenCv() {
  if (!cvLoadPromise) {
    cvLoadPromise = import('@techstark/opencv-js').then((mod) => new Promise((resolve, reject) => {
      const cvModule = mod.default;
      if (cvModule && cvModule.Mat) { resolve(cvModule); return; }
      if (cvModule instanceof Promise) { cvModule.then(resolve, reject); return; }
      const timer = setTimeout(() => reject(new Error('OpenCV.js 초기화 타임아웃')), 15000);
      cvModule.onRuntimeInitialized = () => { clearTimeout(timer); resolve(cvModule); };
    }));
  }
  return cvLoadPromise;
}

/* sum(x+y) 최소/최대, diff(x-y) 최소/최대로 4점을 TL·TR·BR·BL 순서로 정렬한다
   (findContours의 approxPolyDP 결과는 순서가 보장되지 않으므로 필요). */
function orderQuadPoints(pts) {
  const sums = pts.map((p) => p.x + p.y);
  const diffs = pts.map((p) => p.x - p.y);
  return {
    tl: pts[sums.indexOf(Math.min(...sums))],
    br: pts[sums.indexOf(Math.max(...sums))],
    tr: pts[diffs.indexOf(Math.max(...diffs))],
    bl: pts[diffs.indexOf(Math.min(...diffs))],
  };
}

/* OpenCV.js Canny 엣지 감지 + findContours로 가장 큰 사각형(4점 근사) 윤곽을 찾는다.
   threshold1=50, threshold2=150. 반환은 다운샘플 캔버스 기준 0..1 비율 좌표의 4점 사각형. */
function estimateDocEdgesCV(cv, canvas) {
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let bestApprox = null;
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 50, 150);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    const minArea = canvas.width * canvas.height * 0.05;
    let bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      if (approx.rows === 4) {
        const area = Math.abs(cv.contourArea(approx));
        if (area > bestArea && area > minArea) {
          bestArea = area;
          if (bestApprox) bestApprox.delete();
          bestApprox = approx.clone();
        }
      }
      approx.delete();
      cnt.delete();
    }
    if (!bestApprox) return null;
    const pts = [];
    for (let i = 0; i < 4; i++) pts.push({ x: bestApprox.data32S[i * 2], y: bestApprox.data32S[i * 2 + 1] });
    const q = orderQuadPoints(pts);
    const w = canvas.width, h = canvas.height;
    return {
      tl: { x: q.tl.x / w, y: q.tl.y / h }, tr: { x: q.tr.x / w, y: q.tr.y / h },
      br: { x: q.br.x / w, y: q.br.y / h }, bl: { x: q.bl.x / w, y: q.bl.y / h },
    };
  } finally {
    if (bestApprox) bestApprox.delete();
    src.delete(); gray.delete(); blurred.delete(); edges.delete(); contours.delete(); hierarchy.delete();
  }
}

/* OpenCV.js getPerspectiveTransform + warpPerspective로 사각형 4점을 직사각형으로 원근 보정한다.
   quadPx는 원본(전체 해상도) 픽셀 좌표의 {tl,tr,br,bl}. */
function warpQuadToRectCV(cv, srcCanvas, quadPx) {
  const { tl, tr, br, bl } = quadPx;
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const outW = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
  const outH = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
  if (!outW || !outH || outW < 20 || outH < 20) return null;
  const src = cv.imread(srcCanvas);
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();
  try {
    cv.warpPerspective(src, dst, M, new cv.Size(outW, outH), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW; outCanvas.height = outH;
    cv.imshow(outCanvas, dst);
    return outCanvas;
  } finally {
    src.delete(); srcTri.delete(); dstTri.delete(); M.delete(); dst.delete();
  }
}

/* 사각형(quad) 4점을 직사각형으로 매핑하는 원근 보정 근사 — 두 개의 삼각형으로 분할해
   각각을 캔버스 2D affine transform(clip + transform + drawImage)으로 워프한다. */
function warpQuadToRect(srcCanvas, corners) {
  const [tl, tr, br, bl] = corners;
  const outW = Math.round(Math.max(Math.hypot(tr.x - tl.x, tr.y - tl.y), Math.hypot(br.x - bl.x, br.y - bl.y)));
  const outH = Math.round(Math.max(Math.hypot(bl.x - tl.x, bl.y - tl.y), Math.hypot(br.x - tr.x, br.y - tr.y)));
  if (!outW || !outH || outW < 20 || outH < 20) return null;
  const out = document.createElement('canvas');
  out.width = outW; out.height = outH;
  const ctx = out.getContext('2d');

  const drawTriangle = ([s0, s1, s2], [d0, d1, d2]) => {
    const dx1 = s1.x - s0.x, dy1 = s1.y - s0.y;
    const dx2 = s2.x - s0.x, dy2 = s2.y - s0.y;
    const denom = dx1 * dy2 - dy1 * dx2;
    if (!denom) return;
    const D1x = d1.x - d0.x, D2x = d2.x - d0.x;
    const D1y = d1.y - d0.y, D2y = d2.y - d0.y;
    const axx = (D1x * dy2 - D2x * dy1) / denom;
    const axy = (dx1 * D2x - dx2 * D1x) / denom;
    const ayx = (D1y * dy2 - D2y * dy1) / denom;
    const ayy = (dx1 * D2y - dx2 * D1y) / denom;
    const tx = d0.x - axx * s0.x - axy * s0.y;
    const ty = d0.y - ayx * s0.x - ayy * s0.y;
    // 클립 폴리곤을 자신의 무게중심 기준으로 살짝 부풀려 인접 삼각형과 겹치게 해
    // 공유 대각선에서 생기는 서브픽셀 이음선(seam)을 없앤다.
    const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
    const INFLATE = 1.01;
    const inflate = (p) => ({ x: cx + (p.x - cx) * INFLATE, y: cy + (p.y - cy) * INFLATE });
    const [c0, c1, c2] = [d0, d1, d2].map(inflate);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y);
    ctx.closePath(); ctx.clip();
    ctx.transform(axx, ayx, axy, ayy, tx, ty);
    ctx.drawImage(srcCanvas, 0, 0);
    ctx.restore();
  };

  const dTL = { x: 0, y: 0 }, dTR = { x: outW, y: 0 }, dBR = { x: outW, y: outH }, dBL = { x: 0, y: outH };
  drawTriangle([tl, tr, bl], [dTL, dTR, dBL]);
  drawTriangle([tr, br, bl], [dTR, dBR, dBL]);
  return out;
}

/* 밝기·대비 슬라이더 값을 캔버스 픽셀에 반영한다 — 리뷰 화면 "원본으로 편집기 이동"·"스캔으로 편집기 이동" 공통 전처리. */
function applyBrightnessContrast(canvas, brightness, contrast) {
  if (!brightness && !contrast) return;
  const ctx = canvas.getContext('2d');
  const factor = 1 + contrast / 50;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp((d[i] - 128) * factor + 128 + brightness, 0, 255);
    d[i + 1] = clamp((d[i + 1] - 128) * factor + 128 + brightness, 0, 255);
    d[i + 2] = clamp((d[i + 2] - 128) * factor + 128 + brightness, 0, 255);
  }
  ctx.putImageData(imgData, 0, 0);
}

/* 그레이스케일 변환 + 적응형 임계값(블록 평균 대비 C만큼 어두우면 검정)으로 흑백 고대비 스캔 이미지를
   만든다 — editor.jsx의 toScanCanvas와 동일한 알고리즘. */
function applyScanEffect(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) gray[p] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
  const BLOCK = 15, C = 8, half = BLOCK >> 1;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  const sumRect = (x0, y0, x1, y1) => integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(w, x + half + 1);
      const mean = sumRect(x0, y0, x1, y1) / ((x1 - x0) * (y1 - y0));
      const v = gray[y * w + x] < mean - C ? 0 : 255;
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// PDF 각 페이지를 canvas에 렌더링해 PNG dataURL 배열로 변환한다 (scale 2.0 고해상도)
async function pdfToImages(file) {
  const pdfjsLib = await import('pdfjs-dist');
  const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const images = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    images.push(canvas.toDataURL('image/png'));
  }
  return images;
}

function CaptureScreen({ onLoadSample, onLoadImage, openDrawer, theme }) {
  const fileRef = useR(null);
  const videoRef = useR(null);
  const streamRef = useR(null);
  const overlayRef = useR(null);
  const boxRef = useR(null);
  const cvRef = useR(null);
  const cvFailedRef = useR(false);
  const tfModelRef = useR(null);
  const tfFailedRef = useR(false);
  const tfDetectionsRef = useR([]); // [{x,y,w,h,class,score,isDoc}] — 정규화(0~1) 좌표, video 기준
  const manualRef = useR(false); // true면 사용자가 꼭짓점을 직접 조정 중 — 자동 감지가 boxRef를 덮어쓰지 않는다
  const dragCornerRef = useR(null); // 'tl' | 'tr' | 'br' | 'bl' | null
  const [cameraOpen, setCameraOpen] = useS(false);
  const [manualMode, setManualMode] = useS(false);
  const [captured, setCaptured] = useS(null); // { dataUrl, w, h } — 촬영 직후 자르기 리뷰용 원본 프레임
  const [reviewQuad, setReviewQuad] = useS(null); // {tl,tr,br,bl} 정규화 좌표 — captured 기준 사각형
  const [reviewBrightness, setReviewBrightness] = useS(0); // 리뷰 화면 밝기 슬라이더(-50~50, 기본 0)
  const [reviewContrast, setReviewContrast] = useS(0); // 리뷰 화면 대비 슬라이더(-50~50, 기본 0)
  const reviewImgRef = useR(null);
  const reviewOverlayRef = useR(null);
  const reviewDragCornerRef = useR(null);
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const name = f.name.replace(/\.[^.]+$/, '').slice(0, 20) || '업로드 서류';
    if (f.type === 'application/pdf') {
      const images = await pdfToImages(f);
      onLoadImage(images, name);
      return;
    }
    const r = new FileReader();
    r.onload = () => onLoadImage(r.result, name);
    r.readAsDataURL(f);
  };

  const closeCamera = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    manualRef.current = false; setManualMode(false);
    setCameraOpen(false);
  };
  // 플랫폼 무관 자체 카메라(getUserMedia) 우선 시도 — 실시간 문서 엣지감지 오버레이·촬영 후 자르기까지
  // 앱 안에서 처리할 수 있다. WebView가 getUserMedia를 지원하지 않거나 권한이 거부되면(네이티브에서는
  // Capacitor의 BridgeWebChromeClient가 카메라 권한 요청을 자동 처리하므로 대개 여기까지 오지 않음)
  // 네이티브는 OS 카메라 앱(Camera.getPhoto)으로, 웹은 갤러리 선택으로 폴백한다.
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCameraOpen(true);
      return;
    } catch (e) {} // getUserMedia 미지원/거부 — 아래 폴백으로 진행
    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await Camera.getPhoto({ resultType: CameraResultType.DataUrl, source: CameraSource.Camera, quality: 90 });
        onLoadImage(photo.dataUrl, '촬영 서류');
      } catch (e) {} // 사용자가 네이티브 카메라 촬영을 취소한 경우
      return;
    }
    fileRef.current && fileRef.current.click(); // 웹에서 getUserMedia도 실패 시 갤러리 선택으로 폴백
  };
  useE(() => {
    if (cameraOpen && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [cameraOpen]);

  const drawOverlay = () => {
    const canvas = overlayRef.current, video = videoRef.current;
    if (!canvas || !video) return;
    const w = video.clientWidth, h = video.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const b = boxRef.current;
    if (b) {
      const pts = [b.tl, b.tr, b.br, b.bl].map((p) => ({ x: p.x * w, y: p.y * h }));
      ctx.strokeStyle = '#2B6CE6';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#2B6CE6';
      pts.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); });
    }

    // TF.js coco-ssd 물체 감지 박스 — 문서류(DOC_CLASSES)는 초록 실선+라벨/신뢰도, 그 외는 회색 점선+라벨만.
    ctx.font = '12px sans-serif';
    ctx.textBaseline = 'top';
    tfDetectionsRef.current.forEach((d) => {
      const bx = d.x * w, by = d.y * h, bw = d.w * w, bh = d.h * h;
      ctx.setLineDash(d.isDoc ? [] : [6, 4]);
      ctx.strokeStyle = d.isDoc ? '#2ecc71' : '#9aa0a6';
      ctx.lineWidth = d.isDoc ? 2.5 : 1.5;
      ctx.strokeRect(bx, by, bw, bh);
      const label = d.isDoc ? `${d.class} ${Math.round(d.score * 100)}%` : d.class;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = d.isDoc ? '#2ecc71' : 'rgba(154,160,166,0.9)';
      ctx.fillRect(bx, Math.max(0, by - 16), tw + 8, 16);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, bx + 4, Math.max(0, by - 15));
    });
    ctx.setLineDash([]);
  };

  // 카메라가 열려 있는 동안 실시간으로 프레임을 다운샘플해 문서 윤곽을 추정하고 오버레이에 그린다.
  // OpenCV.js가 로드·초기화되면 Canny+findContours로, 아니면(로드 중·실패) Canvas API 폴백으로 감지한다.
  useE(() => {
    if (!cameraOpen) { boxRef.current = null; return; }
    if (!cvRef.current && !cvFailedRef.current) {
      loadOpenCv().then((cv) => { cvRef.current = cv; }).catch(() => { cvFailedRef.current = true; });
    }
    const AW = 96, AH = 128;
    const analysisCanvas = document.createElement('canvas');
    analysisCanvas.width = AW; analysisCanvas.height = AH;
    const actx = analysisCanvas.getContext('2d', { willReadFrequently: true });
    let raf, lastRun = 0;
    const tick = (ts) => {
      const video = videoRef.current;
      if (video && video.videoWidth) {
        if (ts - lastRun > 120 && !manualRef.current) {
          lastRun = ts;
          // TF.js가 문서류(책·노트북·휴대폰·리모컨)를 감지했으면 그 영역만 잘라 분석해 정확도를 높인다(ROI 힌트).
          const hint = tfDetectionsRef.current.find((d) => d.isDoc);
          const PAD = 0.06;
          const roi = hint
            ? { x: clamp(hint.x - PAD, 0, 1), y: clamp(hint.y - PAD, 0, 1), w: clamp(hint.w + PAD * 2, 0.05, 1), h: clamp(hint.h + PAD * 2, 0.05, 1) }
            : { x: 0, y: 0, w: 1, h: 1 };
          roi.w = Math.min(roi.w, 1 - roi.x); roi.h = Math.min(roi.h, 1 - roi.y);
          const mapToFrame = (p) => ({ x: roi.x + p.x * roi.w, y: roi.y + p.y * roi.h });
          const remap = (q) => (q ? { tl: mapToFrame(q.tl), tr: mapToFrame(q.tr), br: mapToFrame(q.br), bl: mapToFrame(q.bl) } : null);
          try {
            actx.drawImage(video, roi.x * video.videoWidth, roi.y * video.videoHeight, roi.w * video.videoWidth, roi.h * video.videoHeight, 0, 0, AW, AH);
            if (cvRef.current) {
              boxRef.current = remap(estimateDocEdgesCV(cvRef.current, analysisCanvas));
            } else {
              const { data } = actx.getImageData(0, 0, AW, AH);
              boxRef.current = remap(estimateDocEdges(data, AW, AH));
            }
          } catch (e) {
            cvFailedRef.current = true; // OpenCV 런타임 오류 시 이후 프레임부터 Canvas 폴백으로 전환
            try {
              const { data } = actx.getImageData(0, 0, AW, AH);
              boxRef.current = remap(estimateDocEdges(data, AW, AH));
            } catch (e2) { /* 프레임 미준비 등 일시적 오류는 다음 tick에서 재시도 */ }
          }
        }
        drawOverlay();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cameraOpen]);

  // 카메라가 열려 있는 동안 TF.js coco-ssd로 실시간 물체를 감지한다. OpenCV 엣지감지와는 독립된 루프이며
  // (500ms 간격, OpenCV의 120ms보다 훨씬 느긋하게), 서로의 성공·실패에 영향을 주지 않는다 — 모델 로드
  // 실패(오프라인 등) 시에도 위 OpenCv 문서 엣지감지는 그대로 계속 동작한다.
  useE(() => {
    if (!cameraOpen) { tfDetectionsRef.current = []; return; }
    let stopped = false;
    if (!tfModelRef.current && !tfFailedRef.current) {
      loadCocoSsdModel().then((model) => { if (!stopped) tfModelRef.current = model; else model.dispose(); })
        .catch((e) => { tfFailedRef.current = true; console.warn('[TFJS] coco-ssd 로드 실패 — OpenCV 문서 감지만으로 계속 동작', e); });
    }
    let raf, lastRun = 0, detecting = false;
    const tick = (ts) => {
      const video = videoRef.current;
      if (video && video.videoWidth && tfModelRef.current && !detecting && ts - lastRun > 500) {
        lastRun = ts;
        detecting = true;
        tfModelRef.current.detect(video).then((preds) => {
          tfDetectionsRef.current = preds.map((p) => {
            const [x, y, w, h] = p.bbox; // 픽셀 좌표(video 원본 해상도 기준)
            return {
              x: x / video.videoWidth, y: y / video.videoHeight,
              w: w / video.videoWidth, h: h / video.videoHeight,
              class: p.class, score: p.score, isDoc: DOC_CLASSES.has(p.class),
            };
          });
          console.log('[TFJS] 감지:', preds.map((p) => `${p.class} ${Math.round(p.score * 100)}%`).join(', ') || '(없음)');
          drawOverlay();
        }).catch(() => {}).finally(() => { detecting = false; });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (tfModelRef.current) { tfModelRef.current.dispose(); tfModelRef.current = null; } // 카메라 종료 시 모델 메모리 해제
    };
  }, [cameraOpen]);

  // 오버레이 꼭짓점 핸들 드래그 — 자동 감지 사각형을 사용자가 손가락으로 직접 보정할 수 있게 한다.
  const HANDLE_HIT_PX = 22;
  const overlayPointerDown = (e) => {
    const canvas = overlayRef.current, b = boxRef.current;
    if (!canvas || !b) return;
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    let best = null, bestDist = HANDLE_HIT_PX;
    for (const k of ['tl', 'tr', 'br', 'bl']) {
      const hx = b[k].x * r.width, hy = b[k].y * r.height;
      const d = Math.hypot(px - hx, py - hy);
      if (d < bestDist) { bestDist = d; best = k; }
    }
    if (!best) return;
    e.preventDefault();
    dragCornerRef.current = best;
    manualRef.current = true;
    setManualMode(true);
    window.addEventListener('pointermove', overlayPointerMove);
    window.addEventListener('pointerup', overlayPointerUp);
  };
  const overlayPointerMove = (e) => {
    const canvas = overlayRef.current, k = dragCornerRef.current;
    if (!canvas || !k) return;
    const r = canvas.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0, 1);
    const y = clamp((e.clientY - r.top) / r.height, 0, 1);
    boxRef.current = { ...boxRef.current, [k]: { x, y } };
    drawOverlay();
  };
  const overlayPointerUp = () => {
    dragCornerRef.current = null;
    window.removeEventListener('pointermove', overlayPointerMove);
    window.removeEventListener('pointerup', overlayPointerUp);
  };
  const resetAutoDetect = () => { manualRef.current = false; setManualMode(false); };

  // 원근 보정만 수행해 캔버스를 반환한다 — 리뷰 화면 "원본으로 편집기 이동"·"스캔으로 편집기 이동" 양쪽에서 공통으로
  // 재사용한 뒤, 이어서 밝기·대비·스캔 처리를 각자 다르게 적용한다.
  const warpToDocument = (rawCanvas, quad) => {
    let outCanvas = rawCanvas;
    try {
      if (quad) {
        const w = rawCanvas.width, h = rawCanvas.height;
        const quadPx = {
          tl: { x: quad.tl.x * w, y: quad.tl.y * h }, tr: { x: quad.tr.x * w, y: quad.tr.y * h },
          br: { x: quad.br.x * w, y: quad.br.y * h }, bl: { x: quad.bl.x * w, y: quad.bl.y * h },
        };
        let warped = null;
        if (cvRef.current) {
          try { warped = warpQuadToRectCV(cvRef.current, rawCanvas, quadPx); }
          catch (e) { warped = null; } // OpenCV 워프 실패 시 Canvas 어파인 폴백으로 재시도
        }
        if (!warped) warped = warpQuadToRect(rawCanvas, [quadPx.tl, quadPx.tr, quadPx.br, quadPx.bl]);
        if (warped) outCanvas = warped;
      }
    } catch (e) {
      outCanvas = rawCanvas; // 원근 보정 실패 시 원본 프레임 그대로 사용
    }
    return outCanvas;
  };

  // 촬영 버튼 — 원본 프레임과 자동 감지된 사각형을 그대로 리뷰 화면으로 넘긴다(즉시 확정하지 않음).
  const capturePhoto = () => {
    const video = videoRef.current; if (!video) return;
    const vw = video.videoWidth || 720, vh = video.videoHeight || 1280;
    const raw = document.createElement('canvas');
    raw.width = vw; raw.height = vh;
    raw.getContext('2d').drawImage(video, 0, 0, vw, vh);
    const quad = boxRef.current || { tl: { x: 0.06, y: 0.06 }, tr: { x: 0.94, y: 0.06 }, br: { x: 0.94, y: 0.94 }, bl: { x: 0.06, y: 0.94 } };
    setCaptured({ dataUrl: raw.toDataURL('image/png'), w: vw, h: vh });
    setReviewQuad(quad);
    setReviewBrightness(0); setReviewContrast(0);
    closeCamera();
  };

  // 리뷰 화면 사각형 오버레이 — 라이브 카메라의 drawOverlay와 동일한 방식으로 그리되, 정적 이미지
  // (reviewImgRef) 기준으로 그린다.
  const drawReviewOverlay = () => {
    const canvas = reviewOverlayRef.current, img = reviewImgRef.current;
    if (!canvas || !img) return;
    const w = img.clientWidth, h = img.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const b = reviewQuad;
    if (!b) return;
    const pts = [b.tl, b.tr, b.br, b.bl].map((p) => ({ x: p.x * w, y: p.y * h }));
    ctx.strokeStyle = '#2B6CE6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#2B6CE6';
    pts.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); });
  };
  useE(() => { drawReviewOverlay(); }, [reviewQuad, captured]);

  // 리뷰 화면 꼭짓점 핸들 드래그 — 라이브 카메라의 overlayPointerDown/Move/Up과 동일한 방식.
  const reviewPointerDown = (e) => {
    const canvas = reviewOverlayRef.current, b = reviewQuad;
    if (!canvas || !b) return;
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    let best = null, bestDist = HANDLE_HIT_PX;
    for (const k of ['tl', 'tr', 'br', 'bl']) {
      const hx = b[k].x * r.width, hy = b[k].y * r.height;
      const d = Math.hypot(px - hx, py - hy);
      if (d < bestDist) { bestDist = d; best = k; }
    }
    if (!best) return;
    e.preventDefault();
    reviewDragCornerRef.current = best;
    window.addEventListener('pointermove', reviewPointerMove);
    window.addEventListener('pointerup', reviewPointerUp);
  };
  const reviewPointerMove = (e) => {
    const canvas = reviewOverlayRef.current, k = reviewDragCornerRef.current;
    if (!canvas || !k) return;
    const r = canvas.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0, 1);
    const y = clamp((e.clientY - r.top) / r.height, 0, 1);
    setReviewQuad((q) => ({ ...q, [k]: { x, y } }));
  };
  const reviewPointerUp = () => {
    reviewDragCornerRef.current = null;
    window.removeEventListener('pointermove', reviewPointerMove);
    window.removeEventListener('pointerup', reviewPointerUp);
  };

  const retakePhoto = () => { setCaptured(null); setReviewQuad(null); setReviewBrightness(0); setReviewContrast(0); openCamera(); };

  // "원본으로 편집기 이동"·"스캔으로 편집기 이동" 공통 전처리 — 원근 보정 후 밝기·대비 슬라이더 값을 캔버스에 반영한다.
  const buildReviewCanvas = () => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const raw = document.createElement('canvas');
      raw.width = captured.w; raw.height = captured.h;
      raw.getContext('2d').drawImage(img, 0, 0);
      const warped = warpToDocument(raw, reviewQuad);
      applyBrightnessContrast(warped, reviewBrightness, reviewContrast);
      resolve(warped);
    };
    img.src = captured.dataUrl;
  });
  const finishReview = (canvas) => {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCaptured(null); setReviewQuad(null); setReviewBrightness(0); setReviewContrast(0);
    onLoadImage(dataUrl, '촬영 서류');
  };
  const applyReviewColor = async () => { // 원본으로 편집기 이동 — 컬러 그대로, 밝기·대비만 반영
    if (!captured) return;
    finishReview(await buildReviewCanvas());
  };
  const applyReviewScan = async () => { // 스캔으로 편집기 이동 — 흑백 고대비 적응형 임계값 적용
    if (!captured) return;
    const canvas = await buildReviewCanvas();
    applyScanEffect(canvas);
    finishReview(canvas);
  };

  return (
    <div className="capture">
      <div className="cap-top">
        <div className="cap-brand">
          <span className="cap-logo"><Icon name="stamp" size={24} color="#fff" /></span>
          <div>
            <div className="cap-app">도장 한 번</div>
            <div className="cap-tag">서류에 도장 찍어 바로 공유</div>
          </div>
        </div>
        <button className="iconbtn" onClick={openDrawer} aria-label="전체 메뉴"><Icon name="menu" size={22} /></button>
      </div>

      <div className="cap-hero">
        <div className="cap-hero-doc">
          <span className="chd-line w70" /><span className="chd-line w90" /><span className="chd-line w50" />
          <span className="chd-line w80" /><span className="chd-line w40" />
          <span className="chd-seal"><SealVisual text="확인" color="#D7402B" size={62} /></span>
        </div>
      </div>

      <div className="cap-headline">서류를 불러와 시작하세요</div>
      <p className="cap-desc">촬영하거나 갤러리에서 가져온 서류 위에<br />도장·서명을 찍어 인증서류를 만듭니다.</p>

      <div className="cap-actions">
        <button className="cap-btn primary" onClick={openCamera}>
          <Icon name="camera" size={24} color="#fff" /><span>카메라로 촬영</span>
        </button>
        <button className="cap-btn" onClick={() => fileRef.current && fileRef.current.click()}>
          <Icon name="upload" size={24} /><span>갤러리에서 업로드</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={onFile} />
      </div>

      <div className="cap-recent">
        <div className="cap-recent-h">최근 서류</div>
        <button className="recent-row" onClick={() => onLoadSample()}>
          <span className="recent-thumb"><Icon name="file" size={20} color={theme.primary} /></span>
          <span className="recent-meta"><b>재직증명서.jpg</b><i>오늘 · 도장 미적용</i></span>
          <Icon name="back" size={18} color={theme.muted} style={{ transform: 'scaleX(-1)' }} />
        </button>
      </div>

      {cameraOpen && (
        <div className="preview-modal">
          <div className="preview-top">
            <span className="preview-name"><Icon name="camera" size={18} /> 카메라 촬영</span>
            <button className="iconbtn" onClick={closeCamera} aria-label="닫기"><Icon name="close" size={22} /></button>
          </div>
          <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
            <video ref={videoRef} autoPlay playsInline muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
            <canvas ref={overlayRef} onPointerDown={overlayPointerDown}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
          </div>
          <div className="preview-bar">
            {manualMode && <button className="btn ghost" onClick={resetAutoDetect}>자동</button>}
            <button className="btn solid wide" onClick={capturePhoto}>촬영</button>
          </div>
        </div>
      )}
      {captured && (
        <div className="preview-modal">
          <div className="preview-top">
            <span className="preview-name"><Icon name="camera" size={18} /> 촬영 확인 · 범위 조정</span>
            <button className="iconbtn" onClick={retakePhoto} aria-label="닫기"><Icon name="close" size={22} /></button>
          </div>
          <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
            <img ref={reviewImgRef} src={captured.dataUrl} alt="" onLoad={drawReviewOverlay}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: `brightness(${1 + reviewBrightness / 100}) contrast(${1 + reviewContrast / 50})` }} />
            <canvas ref={reviewOverlayRef} onPointerDown={reviewPointerDown}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
          </div>
          <div style={{ padding: '10px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', fontSize: 13 }}>
              <span style={{ width: 36 }}>밝기</span>
              <input type="range" min="-50" max="50" step="1" value={reviewBrightness}
                onChange={(e) => setReviewBrightness(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ width: 28, textAlign: 'right' }}>{reviewBrightness}</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', fontSize: 13 }}>
              <span style={{ width: 36 }}>대비</span>
              <input type="range" min="-50" max="50" step="1" value={reviewContrast}
                onChange={(e) => setReviewContrast(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ width: 28, textAlign: 'right' }}>{reviewContrast}</span>
            </label>
          </div>
          <div className="preview-bar">
            <button className="btn ghost" onClick={retakePhoto}>다시 촬영</button>
            <button className="btn solid" style={{ flex: 1 }} onClick={applyReviewColor}>원본으로 편집기 이동</button>
            <button className="btn solid" style={{ flex: 1 }} onClick={applyReviewScan}>스캔으로 편집기 이동</button>
          </div>
        </div>
      )}
    </div>
  );
}

function HelpScreen({ onBack }) {
  const steps = [
    { ic: 'camera', t: '서류 불러오기', d: '카메라로 촬영하거나 갤러리에서 업로드합니다.' },
    { ic: 'stamp', t: '도장 선택', d: '상단 도장 버튼을 누르면 보관함이 팝업으로 열립니다.' },
    { ic: 'pen', t: '위치 지정', d: '확인을 누른 뒤 서류에서 원하는 지점을 탭하면 날인됩니다.' },
    { ic: 'share', t: '저장 · 공유', d: 'PDF·이미지로 저장하거나 카톡·문자·메일로 보냅니다.' },
  ];
  return (
    <div className="sub-screen">
      <div className="appbar">
        <button className="iconbtn" onClick={onBack} aria-label="뒤로"><Icon name="back" size={22} /></button>
        <div className="appbar-title"><span className="apptitle">이용 안내</span></div>
      </div>
      <div className="st-scroll">
        <div className="help-list">
          {steps.map((s, i) => (
            <div className="help-row" key={s.t}>
              <span className="help-n">{i + 1}</span>
              <div className="help-t"><b>{s.t}</b><i>{s.d}</i></div>
              <Icon name={s.ic} size={20} color="var(--primary)" />
            </div>
          ))}
        </div>
        <p className="help-note">도장·서명 이미지는 기기에만 저장되며 서버로 전송되지 않습니다.</p>
      </div>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const theme = THEMES[t.theme] || THEMES.navy;

  const init = loadState();
  const [screen, setScreen] = useS(init.screen || 'capture');
  const initialPages = init.pages && init.pages.length
    ? init.pages
    : [{ docMode: init.docMode || 'sample', docImage: init.docImage || null, placed: init.placed || [] }];
  const [pages, setPages] = useS(initialPages);
  const [currentPage, setCurrentPage] = useS(init.currentPage || 0);
  const curPage = pages[currentPage] || pages[0];
  const docMode = curPage.docMode;
  const docImage = curPage.docImage;
  const placed = curPage.placed;
  const setPlaced = (v) => setPages((ps) => ps.map((p, i) => i === currentPage ? { ...p, placed: typeof v === 'function' ? v(p.placed) : v } : p));
  const addPage = () => setPages((ps) => [...ps, { docMode: 'blank', docImage: null, placed: [] }]);
  const [docName, setDocName] = useS(init.docName || '재직증명서');
  const [docs, setDocs] = useS(init.docs || []);
  const [library, setLibrary] = useS(init.library || SAMPLE_LIBRARY);
  const [recent, setRecent] = useS(init.recent || []);
  const [favId, setFavId] = useS(init.favId || null);
  const [settings, setSettings] = useS({ ...DEFAULT_SETTINGS, ...(init.settings || {}) });
  const [drawer, setDrawer] = useS(false);
  const [addFromMenu, setAddFromMenu] = useS(false);
  const [past, setPast] = useS([]);
  const [future, setFuture] = useS([]);
  const [toast, setToast] = useS(null);
  const toastT = useR(null);
  const [restorePrompt, setRestorePrompt] = useS(() => loadAutosave());
  const restoreConfirmedRef = useR(false);

  const sealInk = SEAL_INKS[settings.ink] || SEAL_INKS['주홍'];

  useE(() => { saveState({ screen, pages, currentPage, docName, docs, library, recent, favId, settings }); },
    [screen, pages, currentPage, docName, docs, library, recent, favId, settings]);

  const showToast = (msg) => {
    setToast(msg); clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 2200);
  };

  const autosaveDataRef = useR({ docImage, placed, docName });
  useE(() => { autosaveDataRef.current = { docImage, placed, docName }; });
  useE(() => {
    if (!settings.autosave) { try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) {} return; }
    const id = setInterval(() => {
      const snap = autosaveDataRef.current;
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ...snap, savedAt: Date.now() }));
      } catch (e) {}
    }, 30000);
    return () => clearInterval(id);
  }, [settings.autosave]);
  const setSetting = (k, v) => setSettings((s) => ({ ...s, [k]: v }));
  const pushHistory = () => { setPast((p) => [...p, placed]); setFuture([]); };
  const undo = () => { if (!past.length) return; const prev = past[past.length - 1]; setPast((p) => p.slice(0, -1)); setFuture((f) => [placed, ...f]); setPlaced(prev); };
  const redo = () => { if (!future.length) return; const nxt = future[0]; setFuture((f) => f.slice(1)); setPast((p) => [...p, placed]); setPlaced(nxt); };

  const loadSample = () => { setPages([{ docMode: 'sample', docImage: null, placed: [] }]); setCurrentPage(0); setDocName('재직증명서'); setScreen('editor'); };
  const loadImage = (src, name) => {
    const imgs = Array.isArray(src) ? src : [src];
    setPages(imgs.map((s) => ({ docMode: 'image', docImage: s, placed: [] })));
    setCurrentPage(0); setDocName(name); setScreen('editor');
  };
  const saveDoc = (thumbnail) => {
    setDocs((d) => {
      const idx = d.findIndex((x) => x.name === docName);
      const entry = { id: idx >= 0 ? d[idx].id : makeId(), name: docName, date: new Date().toISOString(), stampCount: placed.length, thumbnail, docMode, docImage, placed };
      if (idx >= 0) { const copy = [...d]; copy[idx] = entry; return copy; }
      return [entry, ...d];
    });
  };

  const setDocImage = (img) => setPages((ps) => ps.map((p, i) => i === currentPage ? { ...p, docImage: img } : p));

  const store = {
    docMode, docImage, docName, setDocName, setDocImage,
    pages, currentPage, setCurrentPage, addPage,
    library, addStamp: (s) => setLibrary((l) => [...l, s]),
    recent, pushRecent: (id) => setRecent((r) => [id, ...r.filter((x) => x !== id)].slice(0, 6)),
    placed, setPlacedLive: setPlaced, pushHistory, undo, redo,
    canUndo: past.length > 0, canRedo: future.length > 0,
    goBack: () => setScreen('capture'),
    openDrawer: () => setDrawer(true),
    nav: (k) => setScreen(k),
    showToast, settings, t: { ...t, sealInk }, saveDoc,
  };

  const vars = {
    '--primary': theme.primary, '--primary-dark': theme.primaryDark, '--navy': theme.navy,
    '--surface': theme.surface, '--card': theme.card, '--line': theme.line, '--muted': theme.muted,
    '--seal-ink': sealInk,
  };

  const body = () => {
    if (screen === 'capture') return <CaptureScreen onLoadSample={loadSample} onLoadImage={loadImage} openDrawer={() => setDrawer(true)} theme={theme} />;
    if (screen === 'settings') return <SettingsScreen settings={settings} setSetting={setSetting} onBack={() => setScreen('editor')} />;
    if (screen === 'manager') return (
      <StampManagerScreen library={library} favId={favId} onBack={() => setScreen('editor')}
        onAdd={() => setAddFromMenu(true)}
        onRemove={(id) => { setLibrary((l) => l.filter((s) => s.id !== id)); showToast('도장을 삭제했습니다.'); }}
        onRename={(id, label) => { setLibrary((l) => l.map((s) => s.id === id ? { ...s, label } : s)); showToast('이름을 변경했습니다.'); }}
        onFav={(id) => { setFavId(id); showToast('기본 도장으로 지정했습니다.'); }} />
    );
    if (screen === 'docs') return (
      <DocsScreen docs={docs} onBack={() => setScreen('capture')}
        onOpen={(doc) => {
          setPages([{ docMode: doc.docMode, docImage: doc.docImage, placed: doc.placed || [] }]);
          setCurrentPage(0);
          setDocName(doc.name);
          setScreen('editor');
        }} />
    );
    if (screen === 'help') return <HelpScreen onBack={() => setScreen('capture')} />;
    return <EditorScreen store={store} />;
  };

  return (
    <div className="stage">
      <div className="app-root" style={vars}>
        <AndroidDevice>
          <div className="device-fill">
            {body()}
            <Drawer open={drawer} onClose={() => setDrawer(false)} docName={docName}
              stampCount={library.length} placedCount={placed.length}
              onNav={(k) => setScreen(k)} />
            <AddStampSheet open={addFromMenu} onClose={() => setAddFromMenu(false)} sealInk={sealInk}
              onAdd={(s) => { setLibrary((l) => [...l, s]); showToast('도장이 보관함에 저장되었습니다.'); }} />
            <ConfirmDialog open={!!restorePrompt} title="이전 작업을 복원하시겠습니까?"
              body="자동 저장된 작업 내용이 있습니다." confirmLabel="복원"
              onConfirm={() => {
                restoreConfirmedRef.current = true;
                setPages([{ docMode: restorePrompt.docImage ? 'image' : 'sample', docImage: restorePrompt.docImage || null, placed: restorePrompt.placed || [] }]);
                setCurrentPage(0);
                setDocName(restorePrompt.docName || docName);
                setScreen('editor');
              }}
              onClose={() => {
                if (!restoreConfirmedRef.current) { try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) {} }
                restoreConfirmedRef.current = false;
                setRestorePrompt(null);
              }} />
            {toast && <div className="toast"><Icon name="check" size={16} sw={2.6} color="#fff" />{toast}</div>}
          </div>
        </AndroidDevice>
      </div>

      <TweaksPanel>
        <TweakSection label="색상 테마" />
        <TweakColor label="UI 톤" value={theme.primary}
          options={[THEMES.navy.primary, THEMES.indigo.primary, THEMES.teal.primary]}
          onChange={(v) => setTweak('theme', v === THEMES.indigo.primary ? 'indigo' : v === THEMES.teal.primary ? 'teal' : 'navy')} />
        <TweakSection label="레이아웃" />
        <TweakRadio label="도장 팝업" value={t.popupStyle} options={['sheet', 'dialog']}
          onChange={(v) => setTweak('popupStyle', v)} />
        <TweakToggle label="툴바 라벨 표시" value={t.toolLabels} onChange={(v) => setTweak('toolLabels', v)} />
      </TweaksPanel>
    </div>
  );
}

export default App;
