import {test,expect} from '@playwright/test';
test('worker construction failures have a visible recovery action',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{window.Worker=class{constructor(){throw Error('Worker unavailable');}};});
 await page.goto('./');await expect(page.locator('body')).toHaveAttribute('data-ready','error');
 await expect(page.locator('#loading')).toContainText('worker could not start');await expect(page.locator('#reload')).toBeVisible();
 await expect(page.locator('#play')).toBeDisabled();await expect(page.locator('#launch')).toBeDisabled();expect(errors).toEqual([]);
});
