import { test, expect } from './fixtures.js';
test(
  'a thousand-body swarm renders, advances, pauses and remains navigable',
  { tag: '@tablet' },
  async ({ page }, testInfo) => {
    await page.goto('./?fps=1');
    await expect(page.locator('#play')).toBeEnabled();
    await page.locator('#sandbox').click();
    await page.locator('#generate').click();
    await page.locator('#generate-style').selectOption('swarm');
    await page.locator('#generate-count').selectOption('1023');
    await page.locator('#generate-chaos').fill('0');
    await page.locator('#generate-play').uncheck();
    await page.locator('#generate-form button[type=submit]').click();
    await expect(page.locator('#playback-note')).toContainText('1024 bodies');
    await page.locator('#play').click();
    await expect
      .poll(async () => Number(await page.locator('#universe').getAttribute('data-tick')))
      .toBeGreaterThan(0);
    await page.locator('#play').click();
    await expect(page.locator('#play')).toHaveText('▶ Run');
    await expect(page.locator('#play')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#universe')).toHaveAttribute('data-playing', 'false');
    const tick = await page.locator('#universe').getAttribute('data-tick');
    await page.waitForTimeout(300);
    expect(await page.locator('#universe').getAttribute('data-tick')).toBe(tick);
    // Selecting a world outside the sampled orbit set must read cleanly now and
    // fill in once the engine reports its orbit.
    await page.locator('#inspect-body').selectOption({ index: 200 });
    await expect(page.locator('.body-summary')).toContainText('World');
    await expect(page.locator('.body-orbit')).toContainText(/orbit|habitable|Escaping/i, {
      timeout: 15000,
    });
    await expect(page.locator('.body-orbit')).not.toContainText('pending');
    const canvas = await page.locator('#universe').boundingBox();
    await page.mouse.move(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.5);
    await page.mouse.wheel(0, -300);
    // A fast batch can reach the swarm's first merger (0.20 yr) before the pause.
    await expect(page.locator('#fps-overlay')).toContainText(/102[0-4] bodies/);
    await expect(page.locator('#fps-overlay')).toContainText('Physics paused');
    await page.screenshot({
      path: testInfo.outputPath(`review-swarm-${testInfo.project.name}.png`),
    });
  },
);
test('Observe opens on the largest swarm without stalling the page', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'The mobile Observe tab');
  await page.goto('./');
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#sandbox').click();
  await page.locator('#generate').click();
  await page.locator('#generate-style').selectOption('swarm');
  await page.locator('#generate-count').selectOption('8191');
  await page.locator('#generate-chaos').fill('0');
  await page.locator('#generate-play').uncheck();
  await page.locator('#generate-form button[type=submit]').click();
  await expect(page.locator('#playback-note')).toContainText('8192 bodies');
  // Detailed history samples every eight ticks; a software-rendered swarm
  // advances slowly, so allow the warm-up time it needs.
  test.setTimeout(120000);
  await page.locator('#play').click();
  await expect
    .poll(async () => Number(await page.locator('#universe').getAttribute('data-tick')), {
      timeout: 60000,
    })
    .toBeGreaterThan(24);
  await page.locator('#play').click();
  await page.evaluate(() => {
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__longTasks.push(Math.round(entry.duration));
    }).observe({ type: 'longtask' });
  });
  await page.locator('.mobile-tabs [data-panel="observe"]').click();
  await expect(page.locator('#history-caption')).toContainText('latest', { timeout: 15000 });
  await expect(page.locator('#history-caption')).toContainText('Select a world in the scene');
  // Two refresh cycles with the panel open must not stall either.
  await page.waitForTimeout(2500);
  const longTasks = await page.evaluate(() => window.__longTasks);
  expect(Math.max(0, ...longTasks)).toBeLessThan(300);
  const options = await page.locator('#history-body').evaluate((el) => el.options.length);
  expect(options).toBeLessThanOrEqual(40);
  expect(options).toBeGreaterThan(0);
});
