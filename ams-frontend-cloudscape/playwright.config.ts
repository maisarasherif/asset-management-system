import { defineConfig } from "@playwright/test";
import * as Module from "node:module";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
const configDir = dirname(fileURLToPath(import.meta.url));
const localNodeModules = join(configDir, "node_modules");

process.env.NODE_PATH = [localNodeModules, process.env.NODE_PATH].filter(Boolean).join(delimiter);
(Module as typeof Module & { _initPaths: () => void })._initPaths();

export default defineConfig({
  testDir: "../tests/regression/e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4174",
    ...(browserChannel ? { channel: browserChannel } : {}),
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
