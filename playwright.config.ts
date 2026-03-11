import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3010',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'PORT=3010 HOSTNAME=127.0.0.1 node .next/standalone/server.js',
    port: 3010,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      AUTH_USER: 'admin_e2e',
      AUTH_PASS: 'super-secure-pass',
      API_KEY: 'e2e-api-key',
      AUTH_COOKIE_SECURE: 'false',
      KITZCHAT_STATE_DIR: '.tmp/e2e-state',
      KITZCHAT_HOST_LOCK: 'local',
      NODE_ENV: 'test',
    },
  },
});
