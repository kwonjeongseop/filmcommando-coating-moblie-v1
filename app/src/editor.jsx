/* editor.jsx — document editor: toolbar, stamp placement/manipulation, popups */
import React, { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Icon, StampVisual, SealVisual, makeId, SampleCertificate } from './visuals.jsx';
import { OverflowMenu, StampContextMenu, PromptDialog, ConfirmDialog } from './menus.jsx';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const BG_THRESHOLD = 200;

function ToolBtn({ name, label, onClick, active, primary, disabled, showLabel, badge }) {
  return (
    <button className={'toolbtn' + (active ? ' active' : '') + (primary ? ' primary' : '')}
      onClick={onClick} disabled={disabled} aria-label={label}>
      <span className="tb-ic"><Icon name={name} size={primary ? 23 : 21} sw={1.85} />
        {badge ? <em className="tb-badge">{badge}</em> : null}</span>
      {showLabel && <span className="toolbtn-label">{label}</span>}
    </button>
  );
}

function Sheet({ open, onClose, title, sub, children, footer, dialog }) {
  if (!open) return null;
  return (
    <div className={'sheet-scrim' + (dialog ? ' center' : '')} onClick={onClose}>
      <div className={dialog ? 'dialog' : 'sheet'} onClick={(e) => e.stopPropagation()}>
        {!dialog && <span className="sheet-grip" />}
        <div className="sheet-head">
          <div>
            <span className="sheet-title">{title}</span>
            {sub && <span className="sheet-sub">{sub}</span>}
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="닫기"><Icon name="close" size={20} /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ───────── 도장 선택 팝업 (탭 · 검색 · 최근 · 크기/투명도) ───────── */
const KIND_TABS = [
  { k: 'all', t: '전체' }, { k: 'seal', t: '인감·도장' },
  { k: 'signature', t: '서명' }, { k: 'sign', t: '사인' }, { k: 'image', t: '업로드' },
];

function StampPopup({ open, onClose, library, recent, sealInk, defaults, onConfirm, onAddNew, popupStyle }) {
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [size, setSize] = useState(defaults.size);
  const [opacity, setOpacity] = useState(defaults.opacity);
  useEffect(() => {
    if (open) { setSel(null); setTab('all'); setQ(''); setSize(defaults.size); setOpacity(defaults.opacity); }
  }, [open]);
  if (!open) return null;

  const norm = (s) => (s || '').toLowerCase();
  const list = library.filter((s) => (tab === 'all' || s.kind === tab) && (!q || norm(s.label).includes(norm(q)) || norm(s.text).includes(norm(q))));
  const recentItems = recent.map((id) => library.find((s) => s.id === id)).filter(Boolean).slice(0, 4);
  const ink = (s) => ({ ...s, color: s.kind === 'seal' ? (s.color || sealInk) : s.color });
  const selStamp = library.find((s) => s.id === sel);

  const Card = ({ s, small }) => (
    <button className={'stamp-card' + (sel === s.id ? ' sel' : '') + (small ? ' small' : '')} onClick={() => setSel(s.id)}>
      <div className="stamp-card-art"><StampVisual stamp={ink(s)} scale={(s.kind === 'image' ? 0.85 : 0.58) * (small ? 0.8 : 1)} /></div>
      <span className="stamp-card-label">{s.label}</span>
      {sel === s.id && <span className="stamp-card-tick"><Icon name="check" size={13} sw={2.8} /></span>}
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} title="도장 · 서명 선택" sub={library.length + '개 보관 중'}
      dialog={popupStyle === 'dialog'}
      footer={
        <div className="pop-foot">
          <div className="pop-preview">
            {selStamp
              ? <span style={{ opacity }}><StampVisual stamp={ink(selStamp)} scale={0.34 * size} /></span>
              : <span className="muted">미선택</span>}
          </div>
          <div className="sheet-actions" style={{ flex: 1 }}>
            <button className="btn ghost" onClick={onClose}>취소</button>
            <button className="btn solid" disabled={!sel}
              onClick={() => { onConfirm(sel, { size, opacity }); onClose(); }}>확인</button>
          </div>
        </div>
      }>
      <div className="pop-search">
        <Icon name="zoom" size={17} color="var(--muted)" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="도장 이름 검색" />
        {q && <button className="iconbtn sm" onClick={() => setQ('')}><Icon name="close" size={15} /></button>}
      </div>

      <div className="chips">
        {KIND_TABS.map((t) => (
          <button key={t.k} className={'chip' + (tab === t.k ? ' on' : '')} onClick={() => setTab(t.k)}>{t.t}</button>
        ))}
      </div>

      {tab === 'all' && !q && recentItems.length > 0 && (
        <div className="pop-block">
          <div className="pop-block-h">최근 사용</div>
          <div className="stamp-row">{recentItems.map((s) => <Card key={'r' + s.id} s={s} small />)}</div>
        </div>
      )}

      <div className="pop-block">
        <div className="pop-block-h">{tab === 'all' ? '전체 도장' : KIND_TABS.find((t) => t.k === tab).t}<em>{list.length}</em></div>
        {list.length ? (
          <div className="stamp-grid">
            {list.map((s) => <Card key={s.id} s={s} />)}
            <button className="stamp-card add" onClick={onAddNew}>
              <div className="stamp-card-art"><Icon name="plus" size={24} sw={2} /></div>
              <span className="stamp-card-label">새 도장</span>
            </button>
          </div>
        ) : (
          <div className="empty">
            <Icon name="stamp" size={26} color="#b9c1d0" />
            <span>해당하는 도장이 없습니다</span>
            <button className="btn ghost sm" onClick={onAddNew}>새로 등록</button>
          </div>
        )}
      </div>

      <div className="pop-block">
        <div className="pop-block-h">찍기 옵션</div>
        <div className="opt-row">
          <span className="opt-l">크기</span>
          <input className="rng" type="range" min="0.6" max="1.8" step="0.1" value={size} onChange={(e) => setSize(+e.target.value)} />
          <span className="opt-v">{Math.round(size * 100)}%</span>
        </div>
        <div className="opt-row">
          <span className="opt-l">투명도</span>
          <input className="rng" type="range" min="0.4" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(+e.target.value)} />
          <span className="opt-v">{Math.round(opacity * 100)}%</span>
        </div>
      </div>
    </Sheet>
  );
}

/* ───────── 새 도장 등록 ───────── */
const DRAW_SIZE = 220;

function AddStampSheet({ open, onClose, sealInk, onAdd }) {
  const [tab, setTab] = useState('make');
  const [text, setText] = useState('');
  const fileRef = useRef(null);
  const [guideShape, setGuideShape] = useState('circle');
  const [lineWidth, setLineWidth] = useState(4);
  const [erasing, setErasing] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const drawCanvasRef = useRef(null);
  const guideCanvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPtRef = useRef(null);
  useEffect(() => { if (open) { setTab('make'); setText(''); setErasing(false); } }, [open]);

  const initDrawCanvas = () => {
    const c = drawCanvasRef.current; if (!c) return;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    setHasDrawing(false);
  };
  const drawGuide = () => {
    const c = guideCanvasRef.current; if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    const pad = 10;
    if (guideShape === 'circle') {
      ctx.beginPath();
      ctx.arc(c.width / 2, c.height / 2, c.width / 2 - pad, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(pad, pad, c.width - pad * 2, c.height - pad * 2);
    }
  };
  useEffect(() => { if (open && tab === 'draw') initDrawCanvas(); }, [open, tab]);
  useEffect(() => { if (open && tab === 'draw') drawGuide(); }, [open, tab, guideShape]);

  const canvasPoint = (e) => {
    const c = drawCanvasRef.current;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const onDrawPointerDown = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    lastPtRef.current = canvasPoint(e);
    drawCanvasRef.current.setPointerCapture(e.pointerId);
  };
  const onDrawPointerMove = (e) => {
    if (!drawingRef.current) return;
    const c = drawCanvasRef.current;
    const ctx = c.getContext('2d');
    const pt = canvasPoint(e);
    ctx.strokeStyle = erasing ? '#ffffff' : sealInk;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPtRef.current = pt;
    setHasDrawing(true);
  };
  const onDrawPointerUp = () => { drawingRef.current = false; lastPtRef.current = null; };

  const registerDrawing = () => {
    const srcCanvas = drawCanvasRef.current; if (!srcCanvas) return;
    const canvas = document.createElement('canvas');
    canvas.width = srcCanvas.width; canvas.height = srcCanvas.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(srcCanvas, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] >= BG_THRESHOLD && data[i + 1] >= BG_THRESHOLD && data[i + 2] >= BG_THRESHOLD) data[i + 3] = 0;
    }
    ctx.putImageData(imageData, 0, 0);
    onAdd({ id: makeId(), kind: 'image', src: canvas.toDataURL('image/png'), w: 120, label: '수기 도장' });
    onClose();
  };

  const addSeal = () => {
    const t = text.trim(); if (!t) return;
    onAdd({ id: makeId(), kind: 'seal', text: t.slice(0, 4), color: sealInk, label: '도장 · ' + t });
    onClose();
  };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] >= BG_THRESHOLD && data[i + 1] >= BG_THRESHOLD && data[i + 2] >= BG_THRESHOLD) data[i + 3] = 0;
        }
        ctx.putImageData(imageData, 0, 0);
        onAdd({ id: makeId(), kind: 'image', src: canvas.toDataURL('image/png'), w: 120, label: '업로드 · ' + f.name.slice(0, 10) });
        onClose();
      };
      img.src = r.result;
    };
    r.readAsDataURL(f);
  };
  return (
    <Sheet open={open} onClose={onClose} title="새 도장 등록" sub="기기에만 저장됩니다">
      <div className="seg">
        <button className={tab === 'make' ? 'on' : ''} onClick={() => setTab('make')}>이름으로 만들기</button>
        <button className={tab === 'up' ? 'on' : ''} onClick={() => setTab('up')}>촬영 · 업로드</button>
        <button className={tab === 'draw' ? 'on' : ''} onClick={() => setTab('draw')}>수기로 그리기</button>
      </div>
      {tab === 'make' && (
        <div className="add-make">
          <input className="tf" value={text} maxLength={4} placeholder="예) 김민수 (최대 4자)"
            onChange={(e) => setText(e.target.value)} />
          <div className="seal-preview">
            {text.trim() ? <SealVisual text={text.trim()} color={sealInk} size={92} /> : <span className="muted">미리보기</span>}
          </div>
          <button className="btn solid wide" disabled={!text.trim()} onClick={addSeal}>보관함에 등록</button>
        </div>
      )}
      {tab === 'up' && (
        <div className="add-up">
          <button className="upload-tile" onClick={() => fileRef.current && fileRef.current.click()}>
            <Icon name="camera" size={26} /><span>도장·서명을 촬영하거나<br />갤러리에서 가져오기</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          <ul className="tips">
            <li>흰 종이에 찍은 도장을 밝은 곳에서 촬영하세요.</li>
            <li>배경이 깨끗할수록 서류에 자연스럽게 겹쳐집니다.</li>
          </ul>
        </div>
      )}
      {tab === 'draw' && (
        <div className="add-draw">
          <div className="opt-row">
            <span className="opt-l">경계선</span>
            <div className="mini-seg">
              <button className={guideShape === 'circle' ? 'on' : ''} onClick={() => setGuideShape('circle')}>원형</button>
              <button className={guideShape === 'square' ? 'on' : ''} onClick={() => setGuideShape('square')}>사각형</button>
            </div>
          </div>
          <div style={{ position: 'relative', width: DRAW_SIZE, height: DRAW_SIZE, margin: '10px auto' }}>
            <canvas ref={drawCanvasRef} width={DRAW_SIZE} height={DRAW_SIZE}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 12, touchAction: 'none', border: '1px solid var(--line)' }}
              onPointerDown={onDrawPointerDown} onPointerMove={onDrawPointerMove}
              onPointerUp={onDrawPointerUp} onPointerLeave={onDrawPointerUp} />
            <canvas ref={guideCanvasRef} width={DRAW_SIZE} height={DRAW_SIZE}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
          </div>
          <div className="opt-row">
            <span className="opt-l">굵기</span>
            <input className="rng" type="range" min="2" max="8" step="2" value={lineWidth}
              onChange={(e) => setLineWidth(+e.target.value)} />
            <span className="opt-v">{lineWidth}px</span>
          </div>
          <div className="sheet-actions">
            <button className="btn ghost" onClick={() => setErasing((v) => !v)}>{erasing ? '지우개 사용중' : '지우개'}</button>
            <button className="btn ghost" onClick={initDrawCanvas}><Icon name="trash" size={16} />전체 초기화</button>
          </div>
          <button className="btn solid wide" disabled={!hasDrawing} onClick={registerDrawing}>보관함에 등록</button>
        </div>
      )}
    </Sheet>
  );
}

/* ───────── 공유 · 내보내기 (형식 · 화질 · 파일명 · 보안) ───────── */
const CONTACTS = [
  { n: '김대리', s: '#2B6CE6' }, { n: '총무팀', s: '#0E8C86' }, { n: '엄마', s: '#D7402B' },
];

function ShareSheet({ open, onClose, docName, defaults, onAction }) {
  const [fmt, setFmt] = useState(defaults.format);
  const [hq, setHq] = useState(defaults.hq);
  const [pw, setPw] = useState(defaults.pw);
  const [name, setName] = useState(docName);
  useEffect(() => { if (open) { setFmt(defaults.format); setHq(defaults.hq); setPw(defaults.pw); setName(docName); } }, [open]);
  if (!open) return null;

  const via = [
    { k: 'kakao', label: '카카오톡', tone: '#FAE100', fg: '#3C1E1E', ic: 'kakao' },
    { k: 'message', label: '문자', tone: '#34C759', fg: '#fff', ic: 'message' },
    { k: 'mail', label: '메일', tone: '#2B6CE6', fg: '#fff', ic: 'mail' },
    { k: 'save', label: '기기 저장', tone: '#14233F', fg: '#fff', ic: 'save' },
    { k: 'print', label: '인쇄', tone: '#7A5AE0', fg: '#fff', ic: 'file' },
    { k: 'link', label: '링크 복사', tone: '#64748b', fg: '#fff', ic: 'link' },
  ];
  const est = fmt === 'PDF' ? (hq ? '1.8MB' : '620KB') : (hq ? '2.4MB' : '840KB');

  return (
    <Sheet open={open} onClose={onClose} title="공유 · 내보내기" sub={name + '.' + fmt.toLowerCase()}>
      <div className="pop-block">
        <div className="pop-block-h">파일 형식</div>
        <div className="fmt-row">
          {['PDF', 'PNG', 'JPG'].map((f) => (
            <button key={f} className={'fmt' + (fmt === f ? ' on' : '')} onClick={() => setFmt(f)}>
              <b>{f}</b><i>{f === 'PDF' ? '인쇄·제출용' : f === 'PNG' ? '고화질 이미지' : '용량 작게'}</i>
            </button>
          ))}
        </div>
      </div>

      <div className="pop-block">
        <div className="pop-block-h">옵션 <em>{est}</em></div>
        <div className="tog-row"><span>원본 화질 유지</span>
          <button className={'switch' + (hq ? ' on' : '')} onClick={() => setHq(!hq)}><span /></button></div>
        <div className="tog-row"><span>PDF 비밀번호 설정</span>
          <button className={'switch' + (pw ? ' on' : '')} onClick={() => setPw(!pw)} disabled={fmt !== 'PDF'}><span /></button></div>
        {pw && fmt === 'PDF' && <input className="tf sm" type="password" placeholder="비밀번호 4자 이상" />}
        <input className="tf sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="파일 이름" />
      </div>

      <div className="pop-block">
        <div className="pop-block-h">자주 보내는 곳</div>
        <div className="ct-row">
          {CONTACTS.map((c) => (
            <button key={c.n} className="ct" onClick={() => onAction('kakao', fmt) || onClose()}>
              <span className="ct-av" style={{ background: c.s }}>{c.n[0]}</span><i>{c.n}</i>
            </button>
          ))}
        </div>
      </div>

      <div className="pop-block">
        <div className="pop-block-h">보내기</div>
        <div className="share-grid">
          {via.map((it) => (
            <button key={it.k} className="share-item" onClick={() => { onAction(it.k, fmt); onClose(); }}>
              <span className="share-ic" style={{ background: it.tone, color: it.fg }}><Icon name={it.ic} size={23} /></span>
              <span className="share-label">{it.label}</span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/* ───────────────────────── Editor ───────────────────────── */
function EditorScreen({ store }) {
  const { docMode, docImage, docName, setDocName, library, addStamp, recent, pushRecent,
    pages, currentPage, setCurrentPage, addPage,
    placed, setPlacedLive, pushHistory, undo, redo, canUndo, canRedo,
    goBack, openDrawer, nav, showToast, settings, t, saveDoc } = store;
  const sealInk = t.sealInk;

  const pageRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [zoomBar, setZoomBar] = useState(false);
  const [popup, setPopup] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [share, setShare] = useState(false);
  const [preview, setPreview] = useState(false);
  const [menu, setMenu] = useState(false);
  const [prompt, setPrompt] = useState(null);       // 'rename' | 'saveas'
  const [confirm, setConfirm] = useState(null);      // {key,...}
  const [saveFmt, setSaveFmt] = useState(settings.format);
  const [fmtPick, setFmtPick] = useState(false);      // 툴바 저장 버튼용 형식 선택 다이얼로그
  const [placing, setPlacing] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [sel, setSel] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [docRot, setDocRot] = useState(0);
  const [snapGuides, setSnapGuides] = useState({ x: false, y: false });
  const dragRef = useRef(null);
  const lpRef = useRef(null);
  const pinchRef = useRef(null);

  const stampById = (id) => library.find((s) => s.id === id);
  const captureThumb = async () => {
    try {
      const c = await html2canvas(pageRef.current, {
        backgroundColor: '#ffffff', useCORS: true,
        onclone: (doc, cloned) => { cloned.style.boxShadow = 'none'; },
      });
      const tw = 100, th = Math.round(100 * c.height / c.width);
      const tc = document.createElement('canvas');
      tc.width = tw; tc.height = th;
      tc.getContext('2d').drawImage(c, 0, 0, tw, th);
      return tc.toDataURL('image/jpeg', 0.7);
    } catch (e) { return null; }
  };
  const capturePageCanvas = async (bgColor) => {
    await new Promise((r) => requestAnimationFrame(r));
    return html2canvas(pageRef.current, {
      backgroundColor: bgColor,
      useCORS: true,
      onclone: (doc, cloned) => { cloned.style.boxShadow = 'none'; },
    });
  };
  const buildPdfAllPages = async () => {
    const originalPage = currentPage;
    const pdfOpts = { unit: 'pt', format: 'a4' };
    if (settings.pw) pdfOpts.encryption = { userPassword: '0000', ownerPassword: '0000', userPermissions: ['print'] };
    const doc = new jsPDF(pdfOpts);
    let switched = false;
    for (let i = 0; i < pages.length; i++) {
      if (i !== originalPage) { setCurrentPage(i); switched = true; await new Promise((r) => requestAnimationFrame(r)); }
      const canvas = await capturePageCanvas('#ffffff');
      const imgData = canvas.toDataURL('image/png');
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
      const w = canvas.width * ratio, h = canvas.height * ratio;
      if (i > 0) doc.addPage();
      doc.addImage(imgData, 'PNG', (pageW - w) / 2, (pageH - h) / 2, w, h);
    }
    if (switched) setCurrentPage(originalPage);
    return doc;
  };
  // 그레이스케일 변환 + 적응형 임계값(블록 평균 대비 C만큼 어두우면 검정)으로 흑백 고대비 스캔 이미지를 만든다.
  const toScanCanvas = (canvas) => {
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
    return canvas;
  };
  const buildScanPdf = async () => {
    const originalPage = currentPage;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    let switched = false;
    for (let i = 0; i < pages.length; i++) {
      if (i !== originalPage) { setCurrentPage(i); switched = true; await new Promise((r) => requestAnimationFrame(r)); }
      const canvas = await capturePageCanvas('#ffffff');
      toScanCanvas(canvas);
      const imgData = canvas.toDataURL('image/png');
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
      const w = canvas.width * ratio, h = canvas.height * ratio;
      if (i > 0) doc.addPage();
      doc.addImage(imgData, 'PNG', (pageW - w) / 2, (pageH - h) / 2, w, h);
    }
    if (switched) setCurrentPage(originalPage);
    return doc;
  };
  const pctFromEvent = (e) => {
    const r = pageRef.current.getBoundingClientRect();
    return { x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100), y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100) };
  };

  const beginPlacement = (stampId, opts) => {
    setPlacing({ ...stampById(stampId), _opts: opts }); setSel(null); pushRecent(stampId);
  };
  const endPlacement = () => { setPlacing(null); setGhost(null); };
  const onPageMove = (e) => { if (placing) setGhost(pctFromEvent(e)); };
  const onPageClick = (e) => {
    if (placing) {
      const p = pctFromEvent(e);
      pushHistory();
      const id = makeId();
      setPlacedLive((arr) => [...arr, { id, stampId: placing.id, x: p.x, y: p.y, scale: placing._opts.size, opacity: placing._opts.opacity, rot: 0 }]);
      if (settings.autoSelect) { setPlacing(null); setGhost(null); setSel(id); }
      return;
    }
    setSel(null);
  };

  const onHandleDown = (e, id, mode) => {
    e.stopPropagation(); e.preventDefault();
    const inst = placed.find((p) => p.id === id); if (!inst) return;
    const r = pageRef.current.getBoundingClientRect();
    const center = { x: r.left + (inst.x / 100) * r.width, y: r.top + (inst.y / 100) * r.height };
    pushHistory();
    dragRef.current = { id, mode, rect: r, center, startScale: inst.scale, startRot: inst.rot,
      startAngle: Math.atan2(e.clientY - center.y, e.clientX - center.x),
      startDist: Math.hypot(e.clientX - center.x, e.clientY - center.y) || 1 };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragUp);
  };
  const SNAP_THRESHOLD = 5; // 캔버스 크기 대비 % — 가운데 근접 시 스냅
  const onDragMove = (e) => {
    const d = dragRef.current; if (!d) return;
    const set = (fn) => setPlacedLive((arr) => arr.map((p) => p.id === d.id ? fn(p) : p));
    if (d.mode === 'move') {
      let x = clamp(((e.clientX - d.rect.left) / d.rect.width) * 100, 0, 100);
      let y = clamp(((e.clientY - d.rect.top) / d.rect.height) * 100, 0, 100);
      const snapX = Math.abs(x - 50) < SNAP_THRESHOLD;
      const snapY = Math.abs(y - 50) < SNAP_THRESHOLD;
      if (snapX) x = 50;
      if (snapY) y = 50;
      setSnapGuides({ x: snapX, y: snapY });
      set((p) => ({ ...p, x, y }));
    } else if (d.mode === 'resize') {
      const dist = Math.hypot(e.clientX - d.center.x, e.clientY - d.center.y);
      set((p) => ({ ...p, scale: clamp(d.startScale * (dist / d.startDist), 0.4, 3.2) }));
    }
  };
  const onDragUp = () => {
    dragRef.current = null;
    setSnapGuides({ x: false, y: false });
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
  };

  // 도장 본체를 어디든 눌러 바로 드래그 이동 — 작은 이동 임계값을 넘기기 전까지는 탭/롱프레스로
  // 취급해 기존 선택·컨텍스트메뉴 동작과 충돌하지 않는다. 실제 드래그가 시작되면 기존 핸들
  // 이동(mode='move')과 동일한 onDragMove 로직(스냅 가이드 포함)을 그대로 재사용한다.
  const startBodyDrag = (e, id) => {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const r = pageRef.current.getBoundingClientRect();
    let dragging = false;
    const onMove = (ev) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
        dragging = true;
        clearTimeout(lpRef.current);
        pushHistory();
        dragRef.current = { id, mode: 'move', rect: r };
      }
      onDragMove(ev);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (dragging) onDragUp(); else dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // 핀치 투 줌(두 손가락 거리 비율 → scale). 회전 제스처는 제거됨 — rot은 항상 0으로 고정.
  // 단일 포인터 드래그(startBodyDrag)와 별개로 Touch 이벤트의 두 번째 손가락이 닿을 때만 개입한다.
  const onStampTouchStart = (e, id) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const inst = placed.find((p) => p.id === id); if (!inst) return;
    clearTimeout(lpRef.current);
    if (dragRef.current) { window.removeEventListener('pointermove', onDragMove); window.removeEventListener('pointerup', onDragUp); dragRef.current = null; }
    pushHistory();
    setSel(id);
    const [t0, t1] = e.touches;
    pinchRef.current = {
      id,
      startDist: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY) || 1,
      startScale: inst.scale,
    };
  };
  const onStampTouchMove = (e) => {
    const pr = pinchRef.current; if (!pr || e.touches.length !== 2) return;
    e.preventDefault();
    const [t0, t1] = e.touches;
    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    const scale = clamp(pr.startScale * (dist / pr.startDist), 0.4, 3.2);
    setPlacedLive((arr) => arr.map((p) => (p.id === pr.id ? { ...p, scale } : p)));
  };
  const onStampTouchEnd = (e) => {
    if (e.touches.length < 2) pinchRef.current = null;
  };

  const ctxAction = (k) => {
    if (!sel) return;
    pushHistory();
    if (k === 'del') { setPlacedLive((a) => a.filter((p) => p.id !== sel)); setSel(null); }
    if (k === 'dup') {
      const src = placed.find((p) => p.id === sel); if (!src) return;
      const id = makeId();
      setPlacedLive((a) => [...a, { ...src, id, x: clamp(src.x + 6, 0, 100), y: clamp(src.y + 6, 0, 100) }]);
      setSel(id);
    }
    if (k === 'front') {
      setPlacedLive((a) => { const i = a.findIndex((p) => p.id === sel); if (i < 0) return a; const c = [...a]; c.push(c.splice(i, 1)[0]); return c; });
    }
    if (k === 'reset') setPlacedLive((a) => a.map((p) => p.id === sel ? { ...p, rot: 0 } : p));
  };

  const onMenu = (k) => {
    if (k === 'rename') return setPrompt('rename');
    if (k === 'saveas') return setPrompt('saveas');
    if (k === 'pdf') return showToast('PDF로 변환하여 저장했습니다.');
    if (k === 'addpage') { addPage(); showToast('페이지를 추가했습니다. (' + (pages.length + 1) + '페이지)'); return; }
    if (k === 'rotate') { setDocRot((r) => (r + 90) % 360); return showToast('서류를 90° 회전했습니다.'); }
    if (k === 'replace') return showToast('서류 이미지를 다시 선택하세요.');
    if (k === 'manager') return nav('manager');
    if (k === 'settings') return nav('settings');
    if (k === 'clear') return setConfirm({ key: 'clear' });
  };

  const saveTimestamp = () => {
    const d = new Date(); const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  };
  const saveNativeFile = async (dataUrl, filename) => {
    try {
      const base64 = dataUrl.split(',')[1];
      await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Documents, recursive: true });
      const listing = await Filesystem.readdir({ path: '', directory: Directory.Documents });
      const exists = listing.files.some((f) => f.name === filename);
      showToast((exists ? '✅ ' : '⚠️ ') + '문서 폴더에 저장되었습니다\n' + filename + (exists ? '' : ' (저장 확인 실패 — 다시 시도해 주세요)'));
    } catch (e) {
      showToast('저장 실패 — 저장소 권한을 확인해 주세요');
    }
  };

  const onShareAction = (k, fmt) => {
    if (k === 'save' && (fmt === 'PDF' || fmt === 'PNG' || fmt === 'JPG')) {
      captureThumb().then((thumb) => saveDoc(thumb));
      (async () => {
        if (fmt === 'PDF') {
          const prevSel = sel;
          setSel(null);
          const doc = await buildPdfAllPages();
          if (prevSel) setSel(prevSel);
          if (Capacitor.isNativePlatform()) {
            await saveNativeFile(doc.output('datauristring'), `dojang-${saveTimestamp()}.pdf`);
            return;
          }
          const url = URL.createObjectURL(doc.output('blob'));
          const a = document.createElement('a');
          a.href = url;
          a.download = docName + '.pdf';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          showToast('기기에 저장했습니다 · PDF' + (settings.pw ? ' (비밀번호 설정됨)' : '') + (pages.length > 1 ? ` (${pages.length}페이지)` : ''));
          return;
        }
        const prevSel = sel;
        setSel(null); // hide selection outline/handles while capturing so they aren't baked into the export
        const isJpg = fmt === 'JPG';
        const canvas = await capturePageCanvas(isJpg ? '#ffffff' : null);
        if (prevSel) setSel(prevSel);

        const mime = isJpg ? 'image/jpeg' : 'image/png';
        if (Capacitor.isNativePlatform()) {
          await saveNativeFile(canvas.toDataURL(mime, isJpg ? 0.92 : undefined), `dojang-${saveTimestamp()}.${fmt.toLowerCase()}`);
          return;
        }
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = docName + '.' + fmt.toLowerCase();
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          showToast('기기에 저장했습니다 · ' + fmt);
        }, mime, isJpg ? 0.92 : undefined);
      })();
      return;
    }
    if (k === 'kakao') {
      const webShareFallback = () => {
        if (navigator.share) {
          navigator.share({ title: docName, text: docName + ' 서류 공유', url: window.location.href })
            .then(() => showToast('카카오톡으로 보냈습니다 · ' + fmt))
            .catch(() => {}); // 사용자가 공유 시트를 취소한 경우 조용히 무시
        } else {
          showToast('카카오톡 앱 연동 필요');
        }
      };
      if (Capacitor.isNativePlatform()) {
        // Kakao JS SDK는 네이티브 WebView의 origin(https://localhost)이 Kakao 서버의
        // 도메인 검증을 통과할 수 없어 항상 401을 반환한다(도메인 등록·link URL 수정으로도 해결 불가,
        // 실기기 재현으로 확정). 네이티브에서는 OS 공유 시트를 통해 카카오톡으로 직접 전달한다.
        Share.share({ title: '도장 한 번 — 인증서류', text: '도장이 찍힌 서류를 공유합니다.', dialogTitle: '카카오톡으로 공유' })
          .then(() => showToast('카카오톡으로 보냈습니다 · ' + fmt))
          .catch(() => {}); // 사용자가 공유 시트를 취소한 경우 조용히 무시
        return;
      }
      const Kakao = window.Kakao;
      if (!Kakao) { webShareFallback(); return; }
      try {
        if (!Kakao.isInitialized()) Kakao.init('2b967bd314af9eec81b66c4342bb3856');
        Kakao.Share.sendDefault({
          objectType: 'feed',
          content: {
            title: '도장 한 번 — 인증 서류',
            description: '서류에 도장을 찍어 공유합니다.',
            imageUrl: window.location.origin + '/icon.png',
            link: { mobileWebUrl: window.location.href, webUrl: window.location.href },
          },
        });
        showToast('카카오톡으로 보냈습니다 · ' + fmt);
      } catch (e) {
        webShareFallback();
      }
      return;
    }
    if (k === 'message') {
      if (Capacitor.isNativePlatform()) {
        Share.share({ title: '도장 한 번 — 인증서류', text: '도장이 찍힌 서류를 공유합니다.', dialogTitle: '공유' })
          .then(() => showToast('문자로 보냈습니다 · ' + fmt))
          .catch(() => {}); // 사용자가 공유 시트를 취소한 경우 조용히 무시
        return;
      }
      window.location.href = 'sms:?body=' + encodeURIComponent(docName + ' 서류 공유');
      showToast('문자로 보냈습니다 · ' + fmt);
      return;
    }
    if (k === 'mail') {
      if (Capacitor.isNativePlatform()) {
        Share.share({ title: '도장 한 번 — 인증서류', text: '도장이 찍힌 서류를 공유합니다.', dialogTitle: '공유' })
          .then(() => showToast('메일로 보냈습니다 · ' + fmt))
          .catch(() => {}); // 사용자가 공유 시트를 취소한 경우 조용히 무시
        return;
      }
      window.location.href = 'mailto:?subject=' + encodeURIComponent(docName) +
        '&body=' + encodeURIComponent(docName + ' 서류를 공유합니다.');
      showToast('메일로 보냈습니다 · ' + fmt);
      return;
    }
    if (k === 'print') {
      window.print();
      showToast('인쇄 대화상자를 열었습니다 · ' + fmt);
      return;
    }
    if (k === 'link') {
      navigator.clipboard.writeText(window.location.href)
        .then(() => showToast('링크를 복사했습니다'))
        .catch(() => showToast('링크 복사에 실패했습니다'));
      return;
    }
    const m = { kakao: '카카오톡으로 보냈습니다', message: '문자로 보냈습니다', mail: '메일로 보냈습니다',
      save: '기기에 저장했습니다', print: '인쇄 대화상자를 열었습니다', link: '공유 링크를 복사했습니다' };
    showToast((m[k] || '완료') + ' · ' + fmt);
  };

  const PAGE_W = 360;
  const renderPlaced = (p) => {
    const s = stampById(p.stampId); if (!s) return null;
    const stamp = { ...s, color: s.kind === 'seal' ? (s.color || sealInk) : s.color };
    const isSel = sel === p.id && !placing;
    const startLP = (e) => {
      if (placing) return;
      clearTimeout(lpRef.current);
      setSel(p.id);
      lpRef.current = setTimeout(() => { setCtx({ x: e.clientX - 20, y: e.clientY - 10 }); }, 520);
      startBodyDrag(e, p.id); // 핸들 없이 도장 본체 어디든 눌러 바로 드래그 이동 가능(기존 핸들 이동 방식과 병행)
    };
    return (
      <div key={p.id} className={'placed' + (isSel ? ' sel' : '')}
        style={{ left: p.x + '%', top: p.y + '%', opacity: p.opacity == null ? 1 : p.opacity,
          transform: `translate(-50%,-50%) rotate(${p.rot}deg)` }}
        onClick={(e) => { if (!placing) { e.stopPropagation(); setSel(p.id); } }}
        onContextMenu={(e) => { e.preventDefault(); setSel(p.id); setCtx({ x: e.clientX - 20, y: e.clientY - 10 }); }}
        onPointerDown={startLP}
        onPointerUp={() => clearTimeout(lpRef.current)}
        onPointerLeave={() => clearTimeout(lpRef.current)}
        onTouchStart={(e) => onStampTouchStart(e, p.id)}
        onTouchMove={onStampTouchMove}
        onTouchEnd={onStampTouchEnd}>
        <StampVisual stamp={stamp} scale={p.scale} />
        {isSel && (
          <React.Fragment>
            <span className="h-del" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); ctxAction('del'); }}><Icon name="close" size={13} sw={2.6} /></span>
            <span className="h-res" onPointerDown={(e) => onHandleDown(e, p.id, 'resize')}><Icon name="resize" size={13} sw={2.2} /></span>
            <span className="h-mn" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setCtx({ x: e.clientX - 20, y: e.clientY - 10 }); }}><Icon name="more" size={13} sw={2.4} /></span>
          </React.Fragment>
        )}
      </div>
    );
  };

  return (
    <div className="editor">
      <div className="appbar">
        <button className="iconbtn" onClick={goBack} aria-label="뒤로"><Icon name="back" size={22} /></button>
        <div className="appbar-title">
          <span className="apptitle">{docName}</span>
          <span className="appsub" style={{ cursor: pages.length > 1 ? 'pointer' : 'default' }}
            onClick={() => pages.length > 1 && setCurrentPage((currentPage + 1) % pages.length)}>
            {currentPage + 1} / {pages.length} 페이지 · 도장 {placed.length}개
          </span>
        </div>
        <button className="iconbtn" onClick={openDrawer} aria-label="전체 메뉴"><Icon name="menu" size={22} /></button>
        <button className="iconbtn" onClick={() => setMenu(true)} aria-label="더보기"><Icon name="more" size={22} /></button>
      </div>

      <div className="toolstrip">
        <ToolBtn name="stamp" label="도장" primary showLabel={t.toolLabels} onClick={() => setPopup(true)} />
        <span className="tool-div" />
        <ToolBtn name="undo" label="전단계" showLabel={t.toolLabels} disabled={!canUndo} onClick={undo} />
        <ToolBtn name="redo" label="다음단계" showLabel={t.toolLabels} disabled={!canRedo} onClick={redo} />
        <ToolBtn name="zoom" label="돋보기" showLabel={t.toolLabels} active={zoomBar} onClick={() => setZoomBar((v) => !v)} />
        <ToolBtn name="preview" label="미리보기" showLabel={t.toolLabels} onClick={() => setPreview(true)} />
        <ToolBtn name="save" label="저장" showLabel={t.toolLabels} onClick={() => { setSaveFmt(settings.format); setFmtPick(true); }} />
        <ToolBtn name="share" label="공유" showLabel={t.toolLabels} onClick={() => setShare(true)} />
      </div>

      {zoomBar && (
        <div className="zoombar">
          <button className="rbtn" onClick={() => setZoom((z) => clamp(+(z - 0.2).toFixed(2), 0.6, 2.6))}>−</button>
          <input className="rng" type="range" min="0.6" max="2.6" step="0.1" value={zoom} onChange={(e) => setZoom(+e.target.value)} />
          <button className="rbtn" onClick={() => setZoom((z) => clamp(+(z + 0.2).toFixed(2), 0.6, 2.6))}>+</button>
          <span className="zoom-val">{Math.round(zoom * 100)}%</span>
          <button className="btn ghost sm" onClick={() => setZoom(1)}>맞춤</button>
        </div>
      )}

      {placing && (
        <div className="place-banner">
          <span className="pb-art"><StampVisual stamp={{ ...placing, color: placing.kind === 'seal' ? (placing.color || sealInk) : placing.color }} scale={0.3} /></span>
          <span className="pb-text">원하는 위치를 탭하면 도장이 찍힙니다</span>
          <button className="btn solid sm" onClick={endPlacement}>완료</button>
        </div>
      )}

      <div className="canvas">
        <div className={'page-wrap' + (placing ? ' placing' : '')}>
          <div className="page" ref={pageRef} onMouseMove={onPageMove} onClick={onPageClick}
            style={{ width: PAGE_W * zoom, height: PAGE_W * 1.414 * zoom, rotate: docRot + 'deg' }}>
            {docMode === 'image' && docImage
              ? <img className="doc-img" src={docImage} alt="" draggable={false} />
              : docMode === 'blank' ? null : <SampleCertificate />}
            {placed.map(renderPlaced)}
            {snapGuides.x && (
              <div className="snap-guide-v" style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#2B6CE6', pointerEvents: 'none' }} />
            )}
            {snapGuides.y && (
              <div className="snap-guide-h" style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: '#2B6CE6', pointerEvents: 'none' }} />
            )}
            {placing && ghost && (
              <div className="stamp-ghost" style={{ left: ghost.x + '%', top: ghost.y + '%', opacity: placing._opts.opacity * 0.75 }}>
                <StampVisual stamp={{ ...placing, color: placing.kind === 'seal' ? (placing.color || sealInk) : placing.color }} scale={placing._opts.size} />
              </div>
            )}
          </div>
        </div>
      </div>

      {sel && !placing && (
        <div className="selbar">
          <span className="sb-t">도장 선택됨</span>
          <button onClick={() => ctxAction('dup')}><Icon name="layers" size={17} />복제</button>
          <button className="danger" onClick={() => ctxAction('del')}><Icon name="trash" size={17} />삭제</button>
        </div>
      )}

      <StampPopup open={popup} onClose={() => setPopup(false)} library={library} recent={recent} sealInk={sealInk}
        defaults={settings} popupStyle={t.popupStyle} onAddNew={() => { setPopup(false); setAddOpen(true); }}
        onConfirm={beginPlacement} />
      <AddStampSheet open={addOpen} onClose={() => setAddOpen(false)} sealInk={sealInk}
        onAdd={(s) => { addStamp(s); showToast('도장이 보관함에 저장되었습니다.'); }} />
      <ShareSheet open={share} onClose={() => setShare(false)} docName={docName} defaults={settings} onAction={onShareAction} />
      <OverflowMenu open={menu} onClose={() => setMenu(false)} on={onMenu} placedCount={placed.length} />
      <StampContextMenu at={ctx} onClose={() => setCtx(null)} on={ctxAction} />
      <PromptDialog open={prompt === 'rename'} title="이름 변경" hint="서류 이름을 입력하세요." initial={docName}
        onClose={() => setPrompt(null)} onConfirm={(v) => { setDocName(v); showToast('이름을 변경했습니다.'); }} />
      <PromptDialog open={prompt === 'saveas'} title="다른 이름으로 저장" hint="사본으로 저장할 이름을 입력하세요."
        initial={docName + ' 사본'} onClose={() => setPrompt(null)}
        onConfirm={(v) => { setDocName(v); showToast('「' + v + '」(으)로 저장했습니다.'); }} />
      {fmtPick && (
        <div className="sheet-scrim center" onClick={() => setFmtPick(false)}>
          <div className="dialog sm" onClick={(e) => e.stopPropagation()}>
            <div className="cf-title">저장 형식 선택</div>
            <div className="sheet-actions">
              {['JPG', 'PNG', 'PDF', 'SCAN'].map((f) => (
                <button key={f} className={'btn ' + (f === saveFmt ? 'solid' : 'ghost')}
                  onClick={() => { setSaveFmt(f); setFmtPick(false); setConfirm({ key: 'save' }); }}>{f === 'SCAN' ? '스캔(PDF)' : f}</button>
              ))}
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog open={confirm && confirm.key === 'save'} title="이 서류를 저장할까요?"
        body={'도장 ' + placed.length + '개가 합쳐져 ' + (saveFmt === 'SCAN' ? '스캔(PDF)' : saveFmt) + '로 저장됩니다.'} confirmLabel="저장"
        onClose={() => setConfirm(null)} onConfirm={async () => {
          captureThumb().then((thumb) => saveDoc(thumb));
          const fmt = saveFmt;
          if (fmt === 'SCAN') {
            const prevSel = sel;
            setSel(null);
            const doc = await buildScanPdf();
            if (prevSel) setSel(prevSel);
            if (Capacitor.isNativePlatform()) {
              await saveNativeFile(doc.output('datauristring'), `dojang-scan-${saveTimestamp()}.pdf`);
              return;
            }
            const url = URL.createObjectURL(doc.output('blob'));
            const a = document.createElement('a');
            a.href = url;
            a.download = docName + '-scan.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showToast('스캔(PDF)으로 저장했습니다' + (pages.length > 1 ? ` (${pages.length}페이지)` : ''));
            return;
          }
          if (fmt === 'PDF') {
            const prevSel = sel;
            setSel(null);
            const doc = await buildPdfAllPages();
            if (prevSel) setSel(prevSel);
            if (Capacitor.isNativePlatform()) {
              await saveNativeFile(doc.output('datauristring'), `dojang-${saveTimestamp()}.pdf`);
              return;
            }
            const url = URL.createObjectURL(doc.output('blob'));
            const a = document.createElement('a');
            a.href = url;
            a.download = docName + '.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showToast('저장했습니다 · PDF' + (pages.length > 1 ? ` (${pages.length}페이지)` : ''));
            return;
          }
          if (fmt !== 'PNG' && fmt !== 'JPG') { showToast('저장했습니다 · ' + fmt); return; }
          const isJpg = fmt === 'JPG';
          const prevSel = sel;
          setSel(null); // hide selection outline/handles while capturing so they aren't baked into the export
          const canvas = await capturePageCanvas(isJpg ? '#ffffff' : null);
          if (prevSel) setSel(prevSel);
          const mime = isJpg ? 'image/jpeg' : 'image/png';
          if (Capacitor.isNativePlatform()) {
            await saveNativeFile(canvas.toDataURL(mime, isJpg ? 0.92 : undefined), `dojang-${saveTimestamp()}.${fmt.toLowerCase()}`);
            return;
          }
          canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = docName + '.' + fmt.toLowerCase();
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showToast('저장했습니다 · ' + fmt);
          }, mime, isJpg ? 0.92 : undefined);
        }} />
      <ConfirmDialog open={confirm && confirm.key === 'clear'} title="찍은 도장을 모두 지울까요?" danger confirmLabel="모두 지우기"
        body="되돌리기(전단계)로 복구할 수 있습니다."
        onClose={() => setConfirm(null)} onConfirm={() => { pushHistory(); setPlacedLive([]); setSel(null); showToast('도장을 모두 지웠습니다.'); }} />
      <PreviewModal open={preview} onClose={() => setPreview(false)} docName={docName} fmt={settings.format}
        docMode={docMode} docImage={docImage} placed={placed} library={library} sealInk={sealInk}
        onShare={() => { setPreview(false); setShare(true); }} />
    </div>
  );
}

function PreviewModal({ open, onClose, docName, docMode, docImage, placed, library, sealInk, fmt, onShare }) {
  if (!open) return null;
  const PAGE_W = 340;
  return (
    <div className="preview-modal">
      <div className="preview-top">
        <span className="preview-name"><Icon name="preview" size={18} /> 미리보기</span>
        <button className="iconbtn" onClick={onClose} aria-label="닫기"><Icon name="close" size={22} /></button>
      </div>
      <div className="preview-scroll">
        <div className="page preview-page" style={{ width: PAGE_W, height: PAGE_W * 1.414 }}>
          {docMode === 'image' && docImage ? <img className="doc-img" src={docImage} alt="" /> : <SampleCertificate />}
          {placed.map((p) => {
            const s = library.find((x) => x.id === p.stampId); if (!s) return null;
            const stamp = { ...s, color: s.kind === 'seal' ? (s.color || sealInk) : s.color };
            return (
              <div key={p.id} className="placed" style={{ left: p.x + '%', top: p.y + '%', opacity: p.opacity == null ? 1 : p.opacity, transform: `translate(-50%,-50%) rotate(${p.rot}deg)` }}>
                <StampVisual stamp={stamp} scale={p.scale} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="preview-bar">
        <div className="pv-meta"><b>{docName}.{fmt.toLowerCase()}</b><i>1 / 1 페이지 · 도장 {placed.length}개</i></div>
        <button className="btn solid" onClick={onShare}>공유</button>
      </div>
    </div>
  );
}

export { EditorScreen, Sheet, AddStampSheet };
