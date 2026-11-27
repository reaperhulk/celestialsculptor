import { test, expect } from './fixtures.js';
test('worker construction failures have a visible recovery action', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw Error('Worker unavailable');
      }
    };
  });
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'error');
  await expect(page.locator('#loading')).toContainText('worker could not start');
  await expect(page.locator('#reload')).toBeVisible();
  await expect(page.locator('#play')).toBeDisabled();
  await expect(page.locator('#launch')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('a cancelled reload leaves controls usable and the saved replay available', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('#play')).toBeEnabled();
  const key = 'celestial-sculptor.experiment.v1';
  const replay = JSON.stringify({
    version: 7,
    config: { seed: 43, mission: null, star_mass: 1 },
    commands: [1.5, 2.5, 3.5, 4.5].map((radius) => ({
      tick: 0,
      command: { type: 'seed_belt', radius },
    })),
    end_tick: 307200,
  });
  await page.evaluate(
    ([key, replay]) => {
      localStorage.setItem(key, replay);
      localStorage.setItem(key + '.backup', replay);
    },
    [key, replay],
  );
  await page.reload();
  await page.getByRole('button', { name: 'Cancel replay' }).click();
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  await expect(page.locator('#save-status')).toContainText('reload to resume');
  await page.waitForTimeout(3100);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(replay);
  await page.locator('#step').click();
  await expect(page.locator('#universe')).toHaveAttribute('data-tick', '16');
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).end_tick, key))
    .toBe(16);
});
