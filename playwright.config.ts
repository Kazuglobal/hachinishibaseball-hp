import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 }, // iPhone 12近似
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 0.0.0.0 --port 4200',
    url: 'http://localhost:4200/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
