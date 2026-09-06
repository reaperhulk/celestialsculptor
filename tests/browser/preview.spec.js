import {test,expect} from './fixtures.js';
test('capture the playable desktop and phone presentation for release review',async({page},testInfo)=>{
 test.skip(!['desktop','phone'].includes(testInfo.project.name),'Two representative review images cover the responsive layouts.');
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();await page.locator('#sandbox').click();
 if(await page.locator('.mobile-tabs').isVisible())await page.locator('.mobile-tabs [data-panel="mission"]').click();
 await page.locator('#recipes').click();await page.getByRole('button',{name:'The distant giant'}).click();await expect(page.locator('#planet-count')).toHaveText('5');
 if(await page.locator('.mobile-tabs').isVisible())await page.locator('.mobile-tabs [data-panel="sculpt"]').click();
 await page.locator('#display').click();await page.locator('#reduce-motion').check();await page.locator('#show-preview').uncheck();await page.locator('#close-display').click();
 await page.locator('#universe').focus();
 const path=testInfo.outputPath(`review-${testInfo.project.name}.png`);await page.screenshot({path});await testInfo.attach('Playable system',{path,contentType:'image/png'});
});
