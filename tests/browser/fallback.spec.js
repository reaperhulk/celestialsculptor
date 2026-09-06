import {test,expect} from './fixtures.js';
test('the real simulation remains usable when WebGL is unavailable',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
 await page.goto('./');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 await expect(page.locator('#loading')).toContainText('You can still sculpt');
 await page.locator('#sandbox').click();await page.locator('#launch').click();
 await page.locator('#inspect-body').selectOption('1');await expect(page.locator('#inspector')).toContainText('1.00 Earth masses');
 await page.locator('[data-nudge="tangential"][data-amount="0.1"]').click();await expect(page.locator('#inspector')).toContainText('e = 0.210');
 await page.locator('#step').click();await expect(page.locator('#sim-years')).toHaveText('0.03');
});
