import {test,expect} from './fixtures.js';
test('resonance lessons explain evidence without changing the active challenge',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('celestial-sculptor.profile.v1',JSON.stringify({version:1,completed:[0,1,2,3,4,5,6,7]})));
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();if(await page.locator('.mobile-tabs').isVisible())await page.locator('[data-panel=mission]').click();
 await expect(page.locator('#mission-name')).toHaveText('Celestial clockwork');await page.locator('#next-hint').click();await expect(page.locator('#mission-hint')).toContainText('bounded');await expect(page.locator('#mastery-goals li')).toHaveCount(2);
 await page.locator('#study-example').click();await expect(page.locator('#lesson-title')).toHaveText('A ratio is the beginning');await expect(page.locator('#lesson-outcome')).toContainText('The challenge was achieved');await page.locator('#lesson-case').selectOption('1');await expect(page.locator('#lesson-outcome')).toContainText('not achieved');await page.locator('#close-lesson').click();await expect(page.locator('#planet-count')).toHaveText('0');await expect(page.locator('#sim-years')).toHaveText('0.00');
});
test('earned mastery remains visible in the collection and mission map after reload',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('celestial-sculptor.profile.v1',JSON.stringify({version:1,completed:[0,1,2,3,4],mastery:['4:economy','4:restraint']})));
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();await expect(page.locator('#collection')).toContainText('2 mastery medals');await page.locator('#campaign').click();await expect(page.locator('.mission-choice').nth(4)).toContainText('Economy · Restraint');await page.reload();await expect(page.locator('#collection')).toContainText('2 mastery medals');
});
test('trying a lesson preserves the current run and starts the selected setup at year zero',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('celestial-sculptor.profile.v1',JSON.stringify({version:1,completed:[0,1,2,3,4,5,6,7]})));await page.goto('./');await expect(page.locator('#play')).toBeEnabled();if(await page.locator('.mobile-tabs').isVisible())await page.locator('[data-panel=mission]').click();await page.locator('#study-example').click();await expect(page.locator('#lesson-outcome')).toContainText('achieved');await page.locator('#try-lesson').click();await expect(page.locator('#lesson-dialog')).not.toBeVisible();await expect(page.locator('#planet-count')).toHaveText('2');await expect(page.locator('#sim-years')).toHaveText('0.00');await page.locator('#notebook').click();await expect(page.locator('.notebook-entry')).toContainText('Original');
});
