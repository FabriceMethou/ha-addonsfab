import { defineConfig } from "@playwright/test";

const PORT = 18777;

// Runs the real API on a throwaway database with invented data (e2e/serve.py).
// `npm run test:e2e` builds the frontend first.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "../.venv-dev/bin/python e2e/serve.py",
    env: { E2E_PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
