import {test,expect} from './fixtures.js';
test('seeded generator creates a paused moon family with real satellite orbits',async({page})=>{
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();await page.locator('#generate').click();await page.locator('#generate-style').selectOption('moons');await page.locator('#generate-seed').fill('719');await page.locator('#generate-play').uncheck();await page.locator('#generate-system').click();
 await expect(page.locator('#mission-name')).toHaveText('Your universe');await expect(page.locator('#inspect-body option')).toHaveCount(10);await expect(page.locator('#play')).toHaveText('▶ Run');await expect(page.locator('#seed')).toHaveValue('719');await page.locator('#inspect-body').selectOption('2');await expect(page.locator('#inspector')).toContainText('Moon of 1');await page.locator('#follow-body').click();await expect(page.locator('#fit-view')).toBeInViewport();
});
test('formation chapter exposes disks and protects the original garden',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('celestial-sculptor.profile.v1',JSON.stringify({version:1,completed:[0,1,2,3]})));
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();
 await expect(page.locator('#mission-name')).toHaveText('A garden from dust');await expect(page.locator('#launch-form')).toBeHidden();await expect(page.locator('#seed-disk')).toBeEnabled();await page.locator('#disk-radius').fill('1.35');await page.locator('#disk-width').fill('0.08');await page.locator('#disk-disorder').evaluate(input=>{input.value='8';input.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#seed-disk').click();await expect(page.locator('#inspect-body option')).toHaveCount(26);
});
