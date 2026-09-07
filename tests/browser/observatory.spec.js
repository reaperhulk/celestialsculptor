import {test,expect} from './fixtures.js';
test('inspect an encounter, preserve its original, branch and compare at equal ages',async({page})=>{
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();await page.locator('#sandbox').click();await page.locator('#launch').click();await page.locator('#speed').fill('80');await page.locator('#launch').click();await page.locator('#step').click();
 if(await page.locator('.mobile-tabs').isVisible())await page.getByRole('button',{name:'Observe',exact:true}).click();
 else await page.locator('#analysis-tools > summary').click();
 await expect(page.locator('#encounter-list')).toContainText('Impact');await page.locator('#encounter-list button').filter({hasText:'Before'}).first().click();await expect(page.locator('#planet-count')).toHaveText('2');
 await page.getByRole('button',{name:'Boost 10%',exact:true}).click();await page.locator('#step').click();await expect(page.locator('#planet-count')).toHaveText('1');
 await page.locator('#notebook').click();await expect(page.locator('.notebook-entry')).toHaveCount(1);await expect(page.locator('.notebook-entry')).toContainText('Original');await page.locator('#checkpoint-name').fill('Branched impact');await page.locator('#save-checkpoint').click();await expect(page.locator('.notebook-entry')).toHaveCount(2);
 for(const check of await page.locator('.notebook-entry input[type=checkbox]').all())await check.check();await expect(page.locator('#comparison-age')).toContainText('Both at year');await expect(page.locator('#comparison tbody tr')).toHaveCount(11);
 await page.reload();await expect(page.locator('#play')).toBeEnabled();await page.locator('#notebook').click();await expect(page.locator('.notebook-entry')).toHaveCount(2);
});
test('advancing an unchanged encounter list preserves its actual button elements',async({page})=>{
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();await page.locator('#sandbox').click();await page.locator('#launch').click();await page.locator('#launch').click();await page.locator('#step').click();if(await page.locator('.mobile-tabs').isVisible())await page.locator('[data-panel=observe]').click();else await page.locator('#analysis-tools > summary').click();await expect(page.locator('#encounter-list button').first()).toBeVisible();await page.evaluate(()=>window.savedEncounterButton=document.querySelector('#encounter-list button'));await page.locator('#step').click();
 // Cross the real one-second observation refresh, then check DOM identity.
 await page.waitForTimeout(1200);expect(await page.evaluate(()=>window.savedEncounterButton===document.querySelector('#encounter-list button'))).toBe(true);
});
