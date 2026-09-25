import { defineConfig } from '@playwright/test';
const chromium = {
  browserName: 'chromium',
  channel: 'chromium',
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
};
// Specs whose behaviour does not depend on the viewport run once, in the
// desktop project. The rest run at desktop and phone (touch, high density);
// tests tagged @layout, whose outcome depends on the layout, run in every
// viewport, and @tablet adds the tablet layout.
const viewportIndependent =
  /(challenges|device|engine|fallback|generation|gpu-compute|notebook|observatory|startup)\.spec\.js/;
const viewport = (name, use) => ({
  name,
  use: { ...chromium, ...use },
  testIgnore: name === 'desktop' ? /gpu-compute\.spec\.js/ : viewportIndependent,
  ...(['desktop', 'phone'].includes(name)
    ? {}
    : { grep: name === 'tablet' ? /@layout|@tablet/ : /@layout/ }),
});
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  timeout: 30000,
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { open: 'never' }],
        ['json', { outputFile: 'test-results/browser-report.json' }],
      ]
    : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/celestialsculptor/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'gpu-compute',
      testMatch: /gpu-compute\.spec\.js/,
      use: {
        ...chromium,
        viewport: { width: 960, height: 640 },
        launchOptions: {
          args: [
            ...chromium.launchOptions.args,
            '--enable-unsafe-webgpu',
            '--use-webgpu-adapter=swiftshader',
          ],
        },
      },
    },
    {
      name: 'gpu-metal',
      testMatch: /gpu-compute\.spec\.js/,
      use: {
        browserName: 'chromium',
        channel: 'chromium',
        viewport: { width: 960, height: 640 },
        launchOptions: { args: ['--enable-unsafe-webgpu'] },
      },
    },
    {
      name: 'firefox-engine',
      testMatch: /engine\.spec\.js/,
      use: { browserName: 'firefox', viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'webkit-engine',
      testMatch: /engine\.spec\.js/,
      use: { browserName: 'webkit', viewport: { width: 1280, height: 720 } },
    },
    viewport('desktop', { viewport: { width: 1366, height: 768 } }),
    viewport('phone', {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    }),
    viewport('small-phone', {
      viewport: { width: 320, height: 568 },
      isMobile: true,
      hasTouch: true,
    }),
    viewport('tablet', {
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 2,
      hasTouch: true,
    }),
    viewport('laptop', { viewport: { width: 1280, height: 720 } }),
    viewport('large-desktop', { viewport: { width: 1920, height: 1080 } }),
    viewport('landscape-phone', { viewport: { width: 844, height: 390 }, hasTouch: true }),
  ],
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://127.0.0.1:4173/celestialsculptor/',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
