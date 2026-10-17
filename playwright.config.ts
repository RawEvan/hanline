import { defineConfig } from '@playwright/test'
import { join } from 'node:path'

const wav = join(process.cwd(), '.cache', 'input.wav')

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 30 * 60 * 1000,
  expect: { timeout: 18 * 60 * 1000 },
  use: {
    baseURL: 'http://127.0.0.1:4179',
    channel: 'chrome',
    headless: true,
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-audio-capture=${wav}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4179 --strictPort',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
