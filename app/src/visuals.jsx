/* visuals.jsx — icons, stamp renderers, sample document, library presets */

const makeId = () => Math.random().toString(36).slice(2, 9);

/* ───────────────────────── Icons (simple stroke) ───────────────────────── */
const ICON_PATHS = {
  back:    <path d="M15 5l-7 7 7 7" />,
  more:    <g><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></g>,
  stamp:   <g><circle cx="12" cy="10.5" r="4.6" /><path d="M12 5.9V3.2" /><path d="M9.6 3.2h4.8" /><path d="M4 19.6h16" /></g>,
  zoom:    <g><circle cx="11" cy="11" r="6.6" /><path d="M20.5 20.5l-4.7-4.7" /><path d="M11 8.2v5.6M8.2 11h5.6" /></g>,
  undo:    <g><path d="M4 12h12a4 4 0 0 1 0 8h-3" /><path d="M8 8l-4 4 4 4" /></g>,
  redo:    <g><path d="M20 12H8a4 4 0 0 0 0 8h3" /><path d="M16 8l4 4-4 4" /></g>,
  preview: <g><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></g>,
  save:    <g><path d="M12 3.5v9.5" /><path d="M8 9.5l4 4 4-4" /><path d="M4.5 16.5v2a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2" /></g>,
  saveas:  <g><path d="M14 3.5H7A1.8 1.8 0 0 0 5.2 5.3v13.4A1.8 1.8 0 0 0 7 20.5h10a1.8 1.8 0 0 0 1.8-1.8V8.3z" /><path d="M14 3.5V8h4.8" /><path d="M12 11.5v4M10 13.5h4" /></g>,
  share:   <g><circle cx="6" cy="12" r="2.4" /><circle cx="18" cy="6" r="2.4" /><circle cx="18" cy="18" r="2.4" /><path d="M8.1 10.9l7.8-3.8M8.1 13.1l7.8 3.8" /></g>,
  camera:  <g><path d="M4 8.5h2.7L8 6.5h8l1.3 2H20a1.3 1.3 0 0 1 1.3 1.3v8.4A1.3 1.3 0 0 1 20 19.5H4a1.3 1.3 0 0 1-1.3-1.3V9.8A1.3 1.3 0 0 1 4 8.5z" /><circle cx="12" cy="13" r="3.3" /></g>,
  upload:  <g><path d="M12 16V4.5" /><path d="M8 8.5l4-4 4 4" /><path d="M4.5 15.5v3A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-3" /></g>,
  plus:    <path d="M12 5v14M5 12h14" />,
  check:   <path d="M5 12.5l4.5 4.5L19 6.5" />,
  close:   <g><path d="M6 6l12 12M18 6L6 18" /></g>,
  trash:   <g><path d="M4.5 7h15" /><path d="M9.5 7V4.3h5V7" /><path d="M6.5 7l1 13h9l1-13" /></g>,
  rotate:  <g><path d="M19 12a7 7 0 1 1-2.05-4.95" /><path d="M17 3v4.2h-4.2" /></g>,
  resize:  <g><path d="M9 21H3v-6" /><path d="M3 21l7-7" /><path d="M21 9V3h-6" /><path d="M21 3l-7 7" /></g>,
  mail:    <g><rect x="3" y="5.5" width="18" height="13" rx="1.6" /><path d="M3.5 6.5l8.5 6.5 8.5-6.5" /></g>,
  message: <path d="M4 5.5h16v10H8.5l-4.5 4z" />,
  kakao:   <path d="M12 4.3c-4.6 0-8.3 2.9-8.3 6.5 0 2.3 1.5 4.3 3.8 5.5L6.4 20l3.6-2.2c.6.1 1.3.2 2 .2 4.6 0 8.3-2.9 8.3-6.5S16.6 4.3 12 4.3z" />,
  file:    <g><path d="M7 3.5h7l5 5v12H7z" /><path d="M14 3.5V8.5h5" /></g>,
  image:   <g><rect x="4" y="5" width="16" height="14" rx="1.6" /><circle cx="9" cy="10" r="1.5" /><path d="M5 17.5l4.5-4.5 3.5 3.5 2.5-2.5 3.5 3.5" /></g>,
  link:    <g><path d="M9.5 14.5l5-5" /><path d="M10.5 8l1.2-1.2a3.2 3.2 0 0 1 4.5 4.5L15 12.5" /><path d="M13.5 16l-1.2 1.2a3.2 3.2 0 0 1-4.5-4.5L9 11.5" /></g>,
  home:    <g><path d="M4 11l8-6.5 8 6.5" /><path d="M6 9.7V20h12V9.7" /></g>,
  layers:  <g><path d="M12 4l8 4-8 4-8-4 8-4z" /><path d="M4 12l8 4 8-4" /></g>,
  pen:     <g><path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" /><path d="M14 7l3 3" /></g>,
  menu:    <g><path d="M4 7h16M4 12h16M4 17h16" /></g>,
};

function Icon({ name, size = 22, sw = 1.8, color = 'currentColor', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={style}>
      {ICON_PATHS[name] || null}
    </svg>
  );
}

/* ───────────────────────── Stamp visuals ───────────────────────── */
function SealVisual({ text, color, size }) {
  const chars = [...(text || '')].slice(0, 4);
  const n = chars.length;
  const cols = n <= 2 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const ring = Math.max(2.5, size * 0.045);
  const fs = (size * 0.9) / rows * (cols === 1 ? 0.78 : 0.92);
  // traditional right-to-left, top-to-bottom column fill
  const cell = (ch, i) => {
    const col = cols - Math.floor(i / rows);
    const row = (i % rows) + 1;
    return (
      <span key={i} style={{
        gridColumn: col, gridRow: row,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: fs, lineHeight: 1,
      }}>{ch}</span>
    );
  };
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `${ring}px solid ${color}`, boxSizing: 'border-box',
      position: 'relative', color,
      fontFamily: "'Nanum Myeongjo', serif", fontWeight: 800,
      display: 'grid', placeItems: 'center', userSelect: 'none',
      background: 'transparent',
    }}>
      <div style={{
        position: 'absolute', inset: size * 0.085, borderRadius: '50%',
        border: `1.4px solid ${color}`, opacity: 0.85,
      }} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        width: size * 0.66, height: size * 0.66,
      }}>
        {chars.map(cell)}
      </div>
    </div>
  );
}

function StampVisual({ stamp, scale = 1 }) {
  if (!stamp) return null;
  if (stamp.kind === 'image') {
    return <img src={stamp.src} alt="" draggable={false}
      style={{ width: (stamp.w || 120) * scale, height: 'auto', display: 'block', pointerEvents: 'none' }} />;
  }
  if (stamp.kind === 'seal') {
    return <SealVisual text={stamp.text} color={stamp.color} size={94 * scale} />;
  }
  if (stamp.kind === 'signature') {
    return <div style={{
      fontFamily: "'Nanum Pen Script', cursive", fontSize: 60 * scale,
      color: stamp.color, lineHeight: 1, whiteSpace: 'nowrap',
      transform: 'rotate(-4deg)', userSelect: 'none',
    }}>{stamp.text}</div>;
  }
  if (stamp.kind === 'sign') {
    return <div style={{
      fontFamily: "'Dancing Script', cursive", fontWeight: 700, fontSize: 50 * scale,
      color: stamp.color, lineHeight: 1, whiteSpace: 'nowrap', userSelect: 'none',
    }}>{stamp.text}</div>;
  }
  return null;
}

const SAMPLE_LIBRARY = [
  { id: 'lib_seal1', kind: 'seal', label: '인감 · 김민수', text: '金民洙', color: '#D7402B' },
  { id: 'lib_seal2', kind: 'seal', label: '막도장 · 이영희', text: '이영희', color: '#D7402B' },
  { id: 'lib_seal3', kind: 'seal', label: '법인 직인', text: '대한법인', color: '#C0182B' },
  { id: 'lib_sign1', kind: 'signature', label: '서명 · 김민수', text: '김민수', color: '#16203A' },
  { id: 'lib_sign2', kind: 'sign', label: '사인 · M.Kim', text: 'M.Kim', color: '#16203A' },
];

/* ───────────────────────── Sample certificate ───────────────────────── */
function SampleCertificate() {
  const row = (label, value) => (
    <tr>
      <th style={{
        border: '1px solid #2b2b2b', background: '#f3f4f6', fontWeight: 600,
        padding: '10px 8px', width: '28%', fontSize: 13, letterSpacing: 4,
      }}>{label}</th>
      <td style={{ border: '1px solid #2b2b2b', padding: '10px 12px', fontSize: 14, textAlign: 'left' }}>{value}</td>
    </tr>
  );
  return (
    <div style={{
      fontFamily: "'Nanum Myeongjo', serif", color: '#1a1a1a',
      padding: '46px 38px 54px', boxSizing: 'border-box', height: '100%',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ textAlign: 'center', fontSize: 26, fontWeight: 800, letterSpacing: 10, marginBottom: 6, whiteSpace: 'nowrap' }}>
        재직증명서
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, color: '#666', letterSpacing: 2, marginBottom: 30 }}>
        제 2026-0428 호
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 26 }}>
        <tbody>
          {row('성    명', '김 민 수 (金 民 洙)')}
          {row('생 년 월 일', '1989. 03. 14.')}
          {row('소    속', '경영지원본부 총무팀')}
          {row('직    위', '책임 / 과장')}
          {row('재 직 기 간', '2017. 02. 01. ~ 현재')}
        </tbody>
      </table>
      <p style={{ fontSize: 15, lineHeight: 2.1, textAlign: 'left', margin: '0 0 8px' }}>
        위 사람은 본 기관에 위와 같이 재직하고 있음을 증명합니다.
      </p>
      <p style={{ fontSize: 12.5, lineHeight: 1.9, color: '#555', margin: 0 }}>
        본 증명서는 제출용으로 발급되었으며, 기재 사항에 허위가 없음을 확인합니다.
      </p>
      <div style={{ flex: 1 }} />
      <div style={{ textAlign: 'center', fontSize: 17, letterSpacing: 6, margin: '20px 0 26px' }}>
        2026 년 6 월 8 일
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 10, fontSize: 19, fontWeight: 700, letterSpacing: 5,
      }}>
        <span>대 한 법 률 구 조 공 단</span>
        <span style={{ position: 'relative', display: 'inline-block', width: 56, height: 56 }} />
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, color: '#888', marginTop: 14, letterSpacing: 1 }}>
        ( 직인 날인란 — 우측에 도장을 찍어 주세요 )
      </div>
    </div>
  );
}

export { makeId, Icon, StampVisual, SealVisual, SampleCertificate, SAMPLE_LIBRARY };
