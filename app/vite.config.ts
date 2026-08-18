import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'))

// https://vite.dev/config/
// base는 gh-pages 모드에서만 저장소 하위경로를 사용한다 — Capacitor 네이티브 빌드(기본 pnpm build)는
// https://localhost/ 루트에서 서빙되므로 영향받지 않는다.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'gh-pages' ? '/filmcommando-coating-moblie-v1/' : '/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
}))
