# 도장 한 번 (Dojang Once)
> 서류에 도장 찍어 바로 공유하는 모바일 앱

## 프로젝트 정보
- 앱명: 도장 한 번
- 플랫폼: Android 우선 → iOS 2차
- 현재 단계: 웹 프로토타입 완성

## 폴더 구조
```
filmcommando-coating-moblie-v1/
├── src/                        # JSX 소스 파일
│   ├── app.jsx                 # 루트·라우팅·상태
│   ├── editor.jsx              # 편집기·도장 배치
│   ├── menus.jsx               # 드로어·팝업·설정
│   ├── visuals.jsx             # 아이콘·도장 렌더러·샘플 서류
│   ├── android-frame.jsx       # Android Material3 프레임
│   └── tweaks-panel.jsx        # 디자인 트윅 패널
│
├── local-cdn/                  # CDN 차단 우회용 로컬 라이브러리
│   └── node_modules/           # react, react-dom, @babel/standalone
│
├── screenshots/
│   └── original/               # 원본 디자인 스크린샷 4장
│
├── test-results/
│   ├── logs/                   # 런타임 테스트 로그
│   └── screenshots/            # 자동 테스트 스크린샷
│
├── scraps/                     # 기획 스케치
├── dojang-local2.html          # ★ 현재 동작 확인된 메인 번들
├── dojang-local.html           # 로컬 CDN 절대경로 버전
├── dojang.html                 # CDN 원본 버전 (네트워크 필요)
├── 도장-한-번-original.html     # 원본 HTML (외부 JSX 로드 방식)
└── 화면-구성.html               # 화면 구성 디자인 문서
```

## 실행 방법
```bash
# 프로젝트 폴더에서 로컬 서버 실행
cd filmcommando-coating-moblie-v1
python3 -m http.server 8080

# 브라우저에서 접속
http://localhost:8080/dojang-local2.html
```

## 환경 정보
- Node.js v22 / pnpm 11 / Vite 8 / TypeScript 6
- Playwright 1.56 + Chromium 141 (자동 테스트)
- CDN 환경: unpkg/jsdelivr/fonts.googleapis 403 차단 → local-cdn 우회

## 구현 현황 (Phase)
- [x] Phase 0: 프로젝트 초기화 (완료)
- [ ] Phase 1: MVP 핵심 루프 (서류 로드·도장 배치·저장)
- [ ] Phase 2: 완성도 (카메라·PDF·서명·이미지 업로드)
- [ ] Phase 3: 공유·관리 (카카오톡·서류함·설정)
- [ ] Phase 4: 고도화 (배경제거·다중페이지·테마)
