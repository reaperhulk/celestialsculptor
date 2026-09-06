import {test,expect} from './fixtures.js';
test('capture the playable desktop and phone presentation for release review',async({page},testInfo)=>{
 test.skip(!['desktop','phone'].includes(testInfo.project.name),'Two representative review images cover the responsive layouts.');
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();await page.locator('#sandbox').click();
 if(await page.locator('.mobile-tabs').isVisible())await page.locator('.mobile-tabs [data-panel="mission"]').click();
 await page.locator('#recipes').click();await page.getByRole('button',{name:'The distant giant'}).click();await expect(page.locator('#planet-count')).toHaveText('5');
 if(await page.locator('.mobile-tabs').isVisible())await page.locator('.mobile-tabs [data-panel="sculpt"]').click();
 await page.locator('#display').click();await page.locator('#reduce-motion').check();await page.locator('#show-preview').uncheck();await page.locator('#close-display').click();
 await page.locator('#universe').focus();await expect(page.locator('#toast')).toBeHidden({timeout:6000});
 const path=testInfo.outputPath(`review-${testInfo.project.name}.png`);await page.screenshot({path});await testInfo.attach('Playable system',{path,contentType:'image/png'});
});
test('review a moon family at close range and the outcome notebook',async({page},testInfo)=>{
 test.skip(!['desktop','phone'].includes(testInfo.project.name),'Representative camera and notebook layouts.');
 await page.goto('./?fps=1');await expect(page.locator('#play')).toBeEnabled();await page.locator('#generate').click();await page.locator('#generate-style').selectOption('moons');await page.locator('#generate-play').uncheck();await page.locator('#generate-system').click();await expect(page.locator('#inspect-body option')).toHaveCount(10);await page.locator('#inspect-body').selectOption('1');await page.locator('#follow-body').click();
 await page.locator('#display').click();await page.locator('#show-preview').uncheck();await page.locator('#close-display').click();await expect(page.locator('#toast')).toBeHidden({timeout:6000});await expect(page.locator('#fps-overlay')).toContainText('fps');
 for(const name of ['moons','notebook']){if(name==='notebook'){await page.locator('#notebook').click();await page.locator('#checkpoint-name').fill('A family in motion');await page.locator('#save-checkpoint').click();await expect(page.locator('.notebook-entry')).toHaveCount(1);}const path=testInfo.outputPath(`review-${name}-${testInfo.project.name}.png`);await page.screenshot({path});await testInfo.attach(name,{path,contentType:'image/png'});}
});
