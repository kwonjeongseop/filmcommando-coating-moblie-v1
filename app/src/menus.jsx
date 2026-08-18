/* menus.jsx — drawer, overflow menu, context menu, dialogs, settings & stamp manager screens */
import { useState as uS, useEffect as uE, useRef as uR } from 'react';
import { Icon, StampVisual } from './visuals.jsx';

/* ───────────── 전체 메뉴 (좌측 드로어) ───────────── */
function Drawer({ open, onClose, onNav, docName, stampCount, placedCount }) {
  if (!open) return null;
  const group = (label, items) => (
    <div className="dr-group" key={label}>
      <div className="dr-group-label">{label}</div>
      {items.map((it) => (
        <button key={it.k} className="dr-item" onClick={() => { onNav(it.k); onClose(); }}>
          <Icon name={it.ic} size={19} />
          <span className="dr-item-t">{it.t}</span>
          {it.meta && <span className="dr-item-m">{it.meta}</span>}
        </button>
      ))}
    </div>
  );
  return (
    <div className="dr-scrim" onClick={onClose}>
      <nav className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="dr-head">
          <span className="dr-logo"><Icon name="stamp" size={22} color="#fff" /></span>
          <div>
            <div className="dr-app">도장 한 번</div>
            <div className="dr-sub">개인 · 무료 플랜</div>
          </div>
        </div>
        <div className="dr-now">
          <Icon name="file" size={17} />
          <div className="dr-now-t">
            <b>{docName}</b>
            <i>도장 {placedCount}개 적용 · 자동 저장됨</i>
          </div>
        </div>
        <div className="dr-scroll">
          {group('작업', [
            { k: 'editor', ic: 'pen', t: '현재 서류 편집' },
            { k: 'capture', ic: 'camera', t: '새 서류 불러오기' },
          ])}
          {group('보관', [
            { k: 'docs', ic: 'layers', t: '내 서류함', meta: '3' },
            { k: 'manager', ic: 'stamp', t: '도장 보관함', meta: String(stampCount) },
          ])}
          {group('기타', [
            { k: 'settings', ic: 'more', t: '설정' },
            { k: 'help', ic: 'preview', t: '이용 안내' },
          ])}
        </div>
        <div className="dr-foot">버전 {__APP_VERSION__}</div>
      </nav>
    </div>
  );
}

/* ───────────── 더보기(⋮) 메뉴 — 그룹형 ───────────── */
function OverflowMenu({ open, onClose, on, placedCount }) {
  if (!open) return null;
  const S = ({ label }) => <div className="mn-label">{label}</div>;
  const I = ({ k, ic, t, meta, danger, disabled }) => (
    <button className={'mn-item' + (danger ? ' danger' : '')} disabled={disabled}
      onClick={() => { on(k); onClose(); }}>
      <Icon name={ic} size={17} /><span>{t}</span>{meta && <em>{meta}</em>}
    </button>
  );
  return (
    <div className="menu-scrim" onClick={onClose}>
      <div className="menu wide" onClick={(e) => e.stopPropagation()}>
        <S label="파일" />
        <I k="rename" ic="pen" t="이름 변경" />
        <I k="saveas" ic="saveas" t="다른 이름으로 저장" />
        <I k="pdf" ic="file" t="PDF로 내보내기" />
        <div className="mn-div" />
        <S label="서류" />
        <I k="addpage" ic="plus" t="페이지 추가" />
        <I k="rotate" ic="rotate" t="서류 회전" meta="90°" />
        <I k="replace" ic="image" t="서류 이미지 편집" />
        <div className="mn-div" />
        <S label="도장" />
        <I k="manager" ic="layers" t="도장 보관함" />
        <I k="clear" ic="trash" t="찍은 도장 모두 지우기" meta={String(placedCount)} danger disabled={!placedCount} />
        <div className="mn-div" />
        <I k="settings" ic="more" t="설정" />
      </div>
    </div>
  );
}

/* ───────────── 찍은 도장 컨텍스트 메뉴 ───────────── */
function StampContextMenu({ at, onClose, on }) {
  if (!at) return null;
  return (
    <div className="menu-scrim" onClick={onClose}>
      <div className="ctx" style={{ left: at.x, top: at.y }} onClick={(e) => e.stopPropagation()}>
        <button onClick={() => { on('dup'); onClose(); }}><Icon name="layers" size={16} />복제</button>
        <button onClick={() => { on('front'); onClose(); }}><Icon name="upload" size={16} />맨 앞으로</button>
        <button onClick={() => { on('reset'); onClose(); }}><Icon name="rotate" size={16} />회전 초기화</button>
        <div className="ctx-div" />
        <button className="danger" onClick={() => { on('del'); onClose(); }}><Icon name="trash" size={16} />삭제</button>
      </div>
    </div>
  );
}

/* ───────────── 확인 다이얼로그 ───────────── */
function ConfirmDialog({ open, title, body, confirmLabel = '확인', danger, onConfirm, onClose }) {
  if (!open) return null;
  return (
    <div className="sheet-scrim center" onClick={onClose}>
      <div className="dialog sm" onClick={(e) => e.stopPropagation()}>
        <div className="cf-title">{title}</div>
        {body && <p className="cf-body">{body}</p>}
        <div className="sheet-actions">
          <button className="btn ghost" onClick={onClose}>취소</button>
          <button className={'btn ' + (danger ? 'danger' : 'solid')} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── 이름 입력 다이얼로그 ───────────── */
function PromptDialog({ open, title, hint, initial, confirmLabel = '저장', onConfirm, onClose }) {
  const [v, setV] = uS('');
  uE(() => { if (open) setV(initial || ''); }, [open, initial]);
  if (!open) return null;
  return (
    <div className="sheet-scrim center" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><span className="sheet-title">{title}</span>
          <button className="iconbtn" onClick={onClose} aria-label="닫기"><Icon name="close" size={20} /></button></div>
        {hint && <p className="sheet-hint">{hint}</p>}
        <input className="tf" value={v} onChange={(e) => setV(e.target.value)} placeholder="파일 이름" />
        <div className="sheet-actions" style={{ marginTop: 14 }}>
          <button className="btn ghost" onClick={onClose}>취소</button>
          <button className="btn solid" disabled={!v.trim()} onClick={() => { onConfirm(v.trim()); onClose(); }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── 설정 화면 ───────────── */
function SettingsScreen({ settings, setSetting, onBack }) {
  const Row = ({ t, d, children }) => (
    <div className="st-row"><div className="st-rt"><b>{t}</b>{d && <i>{d}</i>}</div><div className="st-rc">{children}</div></div>
  );
  const Sw = ({ on, k }) => (
    <button className={'switch' + (on ? ' on' : '')} onClick={() => setSetting(k, !on)} aria-label={k}><span /></button>
  );
  const inks = { '주홍': '#D7402B', '진홍': '#C0182B', '남색': '#1A357A' };
  return (
    <div className="sub-screen">
      <div className="appbar">
        <button className="iconbtn" onClick={onBack} aria-label="뒤로"><Icon name="back" size={22} /></button>
        <div className="appbar-title"><span className="apptitle">설정</span></div>
      </div>
      <div className="st-scroll">
        <div className="st-group">
          <div className="st-glabel">도장 기본값</div>
          <Row t="기본 인주 색" d="새로 만드는 도장에 적용">
            <div className="ink-row">
              {Object.keys(inks).map((n) => (
                <button key={n} className={'ink' + (settings.ink === n ? ' on' : '')} style={{ background: inks[n] }}
                  onClick={() => setSetting('ink', n)} aria-label={n} />
              ))}
            </div>
          </Row>
          <Row t="기본 크기" d={Math.round(settings.size * 100) + '%'}>
            <input className="rng" type="range" min="0.2" max="1.8" step="0.1" value={settings.size}
              onChange={(e) => setSetting('size', +e.target.value)} />
          </Row>
          <Row t="투명도" d={Math.round(settings.opacity * 100) + '%'}>
            <input className="rng" type="range" min="0.4" max="1" step="0.05" value={settings.opacity}
              onChange={(e) => setSetting('opacity', +e.target.value)} />
          </Row>
          <Row t="찍은 뒤 바로 선택" d="위치·크기를 이어서 조절"><Sw on={settings.autoSelect} k="autoSelect" /></Row>
        </div>
        <div className="st-group">
          <div className="st-glabel">저장 · 내보내기</div>
          <Row t="기본 저장 형식">
            <div className="mini-seg">
              {['PDF', 'PNG', 'JPG'].map((f) => (
                <button key={f} className={settings.format === f ? 'on' : ''} onClick={() => setSetting('format', f)}>{f}</button>
              ))}
            </div>
          </Row>
          <Row t="원본 화질 유지" d="파일 용량이 커집니다"><Sw on={settings.hq} k="hq" /></Row>
          <Row t="자동 저장" d="편집 중 30초마다"><Sw on={settings.autosave} k="autosave" /></Row>
        </div>
        <div className="st-group">
          <div className="st-glabel">보안</div>
          <Row t="공유 시 비밀번호" d="PDF에 암호를 설정"><Sw on={settings.pw} k="pw" /></Row>
          <Row t="도장 이미지 기기에만 보관" d="서버로 전송하지 않음"><Sw on={settings.localOnly} k="localOnly" /></Row>
        </div>
      </div>
    </div>
  );
}

/* ───────────── 도장 보관함 화면 ───────────── */
function StampManagerScreen({ library, onBack, onAdd, onRemove, onRename, favId, onFav }) {
  const [menuFor, setMenuFor] = uS(null);
  const [renameFor, setRenameFor] = uS(null);
  const [delFor, setDelFor] = uS(null);
  const groups = [
    { k: 'seal', t: '인감 · 막도장' },
    { k: 'signature', t: '서명' },
    { k: 'sign', t: '사인 · 이니셜' },
    { k: 'image', t: '업로드 이미지' },
  ];
  const target = library.find((s) => s.id === (renameFor || delFor || menuFor));
  return (
    <div className="sub-screen">
      <div className="appbar">
        <button className="iconbtn" onClick={onBack} aria-label="뒤로"><Icon name="back" size={22} /></button>
        <div className="appbar-title"><span className="apptitle">도장 보관함</span>
          <span className="appsub">{library.length}개 보관 중 · 기기에만 저장</span></div>
        <button className="iconbtn" onClick={onAdd} aria-label="추가"><Icon name="plus" size={22} /></button>
      </div>
      <div className="st-scroll">
        {groups.map((g) => {
          const items = library.filter((s) => s.kind === g.k);
          if (!items.length) return null;
          return (
            <div className="mg-group" key={g.k}>
              <div className="st-glabel">{g.t} <em>{items.length}</em></div>
              <div className="mg-grid">
                {items.map((s) => (
                  <div key={s.id} className="mg-card">
                    <button className="mg-more" onClick={() => setMenuFor(s.id)} aria-label="관리"><Icon name="more" size={16} /></button>
                    {favId === s.id && <span className="mg-fav"><Icon name="check" size={12} sw={3} /></span>}
                    <div className="mg-art"><StampVisual stamp={s} scale={s.kind === 'image' ? 0.8 : 0.55} /></div>
                    <span className="mg-label">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <button className="mg-add" onClick={onAdd}><Icon name="plus" size={20} />새 도장 · 서명 등록</button>
      </div>

      {menuFor && (
        <div className="sheet-scrim" onClick={() => setMenuFor(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head"><span className="sheet-title">{target && target.label}</span>
              <button className="iconbtn" onClick={() => setMenuFor(null)}><Icon name="close" size={20} /></button></div>
            <div className="list-menu">
              <button onClick={() => { onFav(menuFor); setMenuFor(null); }}><Icon name="check" size={18} />기본 도장으로 지정</button>
              <button onClick={() => { setRenameFor(menuFor); setMenuFor(null); }}><Icon name="pen" size={18} />이름 변경</button>
              <button className="danger" onClick={() => { setDelFor(menuFor); setMenuFor(null); }}><Icon name="trash" size={18} />삭제</button>
            </div>
          </div>
        </div>
      )}
      <PromptDialog open={!!renameFor} title="이름 변경" initial={target ? target.label : ''}
        onClose={() => setRenameFor(null)} onConfirm={(v) => onRename(renameFor, v)} />
      <ConfirmDialog open={!!delFor} title="이 도장을 삭제할까요?" danger confirmLabel="삭제"
        body="보관함에서 지워집니다. 이미 찍은 도장은 그대로 남습니다."
        onClose={() => setDelFor(null)} onConfirm={() => onRemove(delFor)} />
    </div>
  );
}

/* ───────────── 내 서류함 화면 ───────────── */
function fmtDocDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function DocsScreen({ docs, onBack, onOpen }) {
  return (
    <div className="sub-screen">
      <div className="appbar">
        <button className="iconbtn" onClick={onBack} aria-label="뒤로"><Icon name="back" size={22} /></button>
        <div className="appbar-title"><span className="apptitle">내 서류함</span><span className="appsub">{docs.length}건</span></div>
      </div>
      <div className="st-scroll">
        {docs.length ? (
          <div className="doc-list">
            {docs.map((d) => (
              <button key={d.id} className="doc-row" onClick={() => onOpen(d)}>
                <span className="doc-thumb">
                  {d.thumbnail
                    ? <img src={d.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                    : <Icon name="file" size={20} />}
                </span>
                <span className="doc-meta"><b>{d.name}</b><i>{fmtDocDate(d.date)}</i></span>
                <span className={'doc-tag' + (d.stampCount ? ' on' : '')}>{d.stampCount ? `도장 ${d.stampCount}개` : '도장 없음'}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty">
            <Icon name="file" size={26} color="#b9c1d0" />
            <span>저장된 서류가 없습니다</span>
          </div>
        )}
      </div>
    </div>
  );
}

export {
  Drawer, OverflowMenu, StampContextMenu, ConfirmDialog, PromptDialog,
  SettingsScreen, StampManagerScreen, DocsScreen, fmtDocDate,
};
