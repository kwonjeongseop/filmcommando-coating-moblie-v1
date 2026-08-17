import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base는 gh-pages 모드에서만 저장소 하위경로를 사용한다 — Capacitor 네이티브 빌드(기본 pnpm build)는
// https://localhost/ 루트에서 서빙되므로 영향받지 않는다.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'gh-pages' ? '/filmcommando-coating-moblie-v1/' : '/',
}))
