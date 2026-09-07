import {test,expect} from './fixtures.js';
test('device scenarios preserve the original and produce portable timing reports',async({page})=>{
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();await page.locator('#display').click();await page.locator('#device-tools > summary').click();await page.locator('#prepare-device').click();await expect(page.locator('#device-status')).toContainText('Scenario ready');await expect(page.locator('#inspect-body option')).toHaveCount(64);
 await page.locator('#record-device').click();await expect(page.locator('#play')).toHaveText('Ⅱ Pause');await page.locator('#display').click();const download=page.waitForEvent('download');await page.locator('#download-device').click();expect((await download).suggestedFilename()).toBe('celestial-device-performance.json');await page.locator('#close-display').click();await page.locator('#notebook').click();await expect(page.locator('.notebook-entry')).toContainText('Original');
});
