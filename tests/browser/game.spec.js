import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('./');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 await expect(page.locator('#loading')).toBeHidden();
 await expect(page.locator('#play')).toBeEnabled();
 expect(errors).toEqual([]);
});

test('real worker launches a world, completes a goal, and unlocks the next',async({page})=>{
 await page.locator('#launch').click();await expect(page.locator('#planet-count')).toHaveText('1');
 await page.locator('#time-speed').selectOption('16');await page.locator('#play').click();
 await expect(page.locator('#goal-state')).toContainText('Discovery made',{timeout:15000});
 await expect(page.locator('#play')).toHaveText('▶ Run');
 if(await page.locator('.mobile-tabs').isVisible())await page.locator('.mobile-tabs [data-panel="mission"]').click();
 await page.locator('#next-mission').click();await expect(page.locator('#mission-name')).toHaveText('A place for life');
 await expect(page.locator('#kind option[value="ice"]')).toBeEnabled();
});

test('viewport fits the game and keeps playback and creation reachable',async({page})=>{
 const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,width:innerWidth,height:innerHeight,body:document.body.getBoundingClientRect().height,canvas:document.querySelector('canvas').getBoundingClientRect().height}));
 expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);expect(dimensions.body).toBeLessThanOrEqual(dimensions.height+1);expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.height+1);expect(dimensions.canvas).toBeGreaterThan(170);
 await expect(page.locator('#launch')).toBeInViewport();await expect(page.locator('#play')).toBeInViewport();
});

test('autosave reload restores a paused experiment',async({page})=>{
 await page.locator('#launch').click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('celestial-sculptor.experiment.v1')||'{"commands":[]}').commands.length)).toBe(1);
 await page.reload();await expect(page.locator('#planet-count')).toHaveText('1');await expect(page.locator('#play')).toHaveText('▶ Run');
});

test('help and challenge map work with keyboard dismissal',async({page})=>{
 await page.locator('#help').click();await expect(page.locator('#help-dialog')).toBeVisible();await page.keyboard.press('Escape');
 await expect(page.locator('#help-dialog')).toBeHidden();await page.locator('#campaign').click();
 await expect(page.locator('.mission-choice')).toHaveCount(10);await expect(page.locator('.mission-choice').nth(1)).toBeDisabled();
});
