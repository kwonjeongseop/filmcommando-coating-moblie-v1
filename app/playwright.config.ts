// 도장 한 번 앱의 E2E 테스트 설정 — Chromium 데스크톱 + Pixel 8 모바일 프로젝트로 실행한다.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  outputDir: '../test-results/logs/playwright-artifacts',
  reporter: [
    ['html', { outputFolder: '../test-results/logs/playwright-report', open: 'never' }],
    ['json', { outputFile: '../test-results/logs/playwright-results.json' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Pixel 8',
      use: {
        ...devices['Pixel 8'],
        viewport: { width: 412, height: 915 },
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
