/* app.jsx — root: routing, shared state, settings, tweaks, mount */
import { useState as useS, useEffect as useE, useRef as useR } from 'react';
import { Icon, SealVisual, SAMPLE_LIBRARY, makeId } from './visuals.jsx';
import { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakRadio, TweakToggle } from './tweaks-panel.jsx';
import { AndroidDevice } from './android-frame.jsx';
import { Drawer, SettingsScreen, StampManagerScreen, DocsScreen } from './menus.jsx';
import { EditorScreen, AddStampSheet } from './editor.jsx';

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
  ink: '주홍', size: 1, opacity: 1, autoSelect: true,
  format: 'PDF', hq: false, autosave: true, pw: false, localOnly: true,
};

const LS_KEY = 'docstamp_v2';
const loadState = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } };
const saveState = (s) => { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {} };

function CaptureScreen({ onLoadSample, onLoadImage, openDrawer, theme }) {
  const fileRef = useR(null);
  const videoRef = useR(null);
  const streamRef = useR(null);
  const [cameraOpen, setCameraOpen] = useS(false);
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => onLoadImage(r.result, f.name.replace(/\.[^.]+$/, '').slice(0, 20) || '업로드 서류');
    r.readAsDataURL(f);
  };

  const closeCamera = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    setCameraOpen(false);
  };
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch (e) {
      fileRef.current && fileRef.current.click(); // getUserMedia 미지원/거부 시 갤러리 선택으로 폴백
    }
  };
  useE(() => {
    if (cameraOpen && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [cameraOpen]);
  const capturePhoto = () => {
    const video = videoRef.current; if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    closeCamera();
    onLoadImage(dataUrl, '촬영 서류');
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
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
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
          <video ref={videoRef} autoPlay playsInline muted
            style={{ flex: 1, width: '100%', objectFit: 'cover', background: '#000' }} />
          <div className="preview-bar">
            <button className="btn solid wide" onClick={capturePhoto}>촬영</button>
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
  const [docMode, setDocMode] = useS(init.docMode || 'sample');
  const [docImage, setDocImage] = useS(init.docImage || null);
  const [docName, setDocName] = useS(init.docName || '재직증명서');
  const [docs, setDocs] = useS(init.docs || []);
  const [library, setLibrary] = useS(init.library || SAMPLE_LIBRARY);
  const [placed, setPlaced] = useS(init.placed || []);
  const [recent, setRecent] = useS(init.recent || []);
  const [favId, setFavId] = useS(init.favId || null);
  const [settings, setSettings] = useS({ ...DEFAULT_SETTINGS, ...(init.settings || {}) });
  const [drawer, setDrawer] = useS(false);
  const [addFromMenu, setAddFromMenu] = useS(false);
  const [past, setPast] = useS([]);
  const [future, setFuture] = useS([]);
  const [toast, setToast] = useS(null);
  const toastT = useR(null);

  const sealInk = SEAL_INKS[settings.ink] || SEAL_INKS['주홍'];

  useE(() => { saveState({ screen, docMode, docImage, docName, docs, library, placed, recent, favId, settings }); },
    [screen, docMode, docImage, docName, docs, library, placed, recent, favId, settings]);

  const showToast = (msg) => {
    setToast(msg); clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 2200);
  };
  const setSetting = (k, v) => setSettings((s) => ({ ...s, [k]: v }));
  const pushHistory = () => { setPast((p) => [...p, placed]); setFuture([]); };
  const undo = () => { if (!past.length) return; const prev = past[past.length - 1]; setPast((p) => p.slice(0, -1)); setFuture((f) => [placed, ...f]); setPlaced(prev); };
  const redo = () => { if (!future.length) return; const nxt = future[0]; setFuture((f) => f.slice(1)); setPast((p) => [...p, placed]); setPlaced(nxt); };

  const loadSample = () => { setDocMode('sample'); setDocImage(null); setDocName('재직증명서'); setScreen('editor'); };
  const loadImage = (src, name) => { setDocMode('image'); setDocImage(src); setDocName(name); setScreen('editor'); };
  const saveDoc = (thumbnail) => {
    setDocs((d) => {
      const idx = d.findIndex((x) => x.name === docName);
      const entry = { id: idx >= 0 ? d[idx].id : makeId(), name: docName, date: new Date().toISOString(), stampCount: placed.length, thumbnail, docMode, docImage, placed };
      if (idx >= 0) { const copy = [...d]; copy[idx] = entry; return copy; }
      return [entry, ...d];
    });
  };

  const store = {
    docMode, docImage, docName, setDocName,
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
        onOpen={(doc) => { setDocMode(doc.docMode); setDocImage(doc.docImage); setDocName(doc.name); setPlaced(doc.placed || []); setScreen('editor'); }} />
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
