import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  use: {
    headless: true,
    baseURL: "http://127.0.0.1:3000",
  },
  webServer: [
    {
      command: "pnpm --filter @qr-forever/web exec next dev --port 3000",
      url: "http://127.0.0.1:3000",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "pnpm --filter @qr-forever/resolver-worker exec wrangler dev --port 8787 --var CONTRACT_ADDRESS:0x0000000000000000000000000000000000000001 --var POLYGON_RPC_URL:https://rpc-amoy.polygon.technology --var RATE_LIMIT_PER_MINUTE:60 --var MOCK_RECORDS_JSON:'{\"1\":{\"targetType\":\"url\",\"target\":\"https://example.com\",\"txHash\":\"0xabc123\"}}'",
      url: "http://127.0.0.1:8787/health",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
