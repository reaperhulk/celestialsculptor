import {test,expect} from './fixtures.js';
test('a thousand-body swarm renders, advances, pauses and remains navigable',async({page},testInfo)=>{
 test.skip(!['desktop','phone','tablet'].includes(testInfo.project.name),'Representative navigation viewports');
 await page.goto('./?fps=1');await expect(page.locator('#play')).toBeEnabled();await page.locator('#sandbox').click();await page.locator('#generate').click();await page.locator('#generate-style').selectOption('swarm');await page.locator('#generate-count').selectOption('1023');await page.locator('#generate-chaos').fill('0');await page.locator('#generate-play').uncheck();await page.locator('#generate-form button[type=submit]').click();
 await expect(page.locator('#playback-note')).toContainText('1024 bodies');await page.locator('#play').click();
 await expect.poll(async()=>Number(await page.locator('#universe').getAttribute('data-tick'))).toBeGreaterThan(0);
 await page.locator('#play').click();await expect(page.locator('#play')).toHaveText('▶ Run');await expect(page.locator('#play')).toHaveAttribute('aria-busy','false');await expect(page.locator('#universe')).toHaveAttribute('data-playing','false');const tick=await page.locator('#universe').getAttribute('data-tick');await page.waitForTimeout(300);expect(await page.locator('#universe').getAttribute('data-tick')).toBe(tick);
 const canvas=await page.locator('#universe').boundingBox();await page.mouse.move(canvas.x+canvas.width*.5,canvas.y+canvas.height*.5);await page.mouse.wheel(0,-300);await expect(page.locator('#fps-overlay')).toContainText('1024 bodies');await expect(page.locator('#fps-overlay')).toContainText('Physics paused');
 await page.screenshot({path:testInfo.outputPath(`review-swarm-${testInfo.project.name}.png`)});
});
