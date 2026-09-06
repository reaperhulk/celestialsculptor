import {test,expect} from './fixtures.js';

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
test('an inspected world can be nudged and the edit undone',async({page})=>{
 await page.locator('#sandbox').click();await page.locator('#launch').click();
 await page.locator('#inspect-body').selectOption('1');
 await page.locator('[data-nudge="tangential"][data-amount="0.1"]').click();
 await expect(page.locator('#inspector')).toContainText('e = 0.210');
 await page.locator('#undo').click();await expect(page.locator('#inspector')).toContainText('e = 0.000');
});
test('sandbox starting points create editable paused systems',async({page})=>{
 await page.locator('#sandbox').click();
 if(await page.locator('.mobile-tabs').isVisible())await page.locator('.mobile-tabs [data-panel="mission"]').click();
 await page.locator('#recipes').click();await page.getByRole('button',{name:'A quiet garden'}).click();
 await expect(page.locator('#planet-count')).toHaveText('3');await expect(page.locator('#play')).toHaveText('▶ Run');
 await expect(page.locator('#mission-name')).toHaveText('Your universe');
});
test('graphics context loss leaves physics usable and recovery resumes drawing',async({page})=>{
 await page.locator('#launch').click();
 await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');window.restoreGraphics=gl.getExtension('WEBGL_lose_context');if(!window.restoreGraphics)throw Error('Context-loss test extension missing');window.restoreGraphics.loseContext();});
 await expect(page.locator('#toast')).toContainText('Graphics paused');
 await page.locator('#step').click();await expect(page.locator('#sim-years')).toHaveText('0.03');await expect(page.locator('#planet-count')).toHaveText('1');
 await page.evaluate(()=>window.restoreGraphics.restoreContext());await expect(page.locator('#toast')).toContainText('Graphics restored');
 await expect.poll(()=>page.evaluate(()=>document.querySelector('canvas').getContext('webgl2').isContextLost())).toBe(false);
 await page.locator('#step').click();await expect(page.locator('#sim-years')).toHaveText('0.06');
});
test('replacement confirmation pauses time and cancellation resumes the same run',async({page})=>{
 await page.locator('#launch').click();await page.locator('#play').click();await expect(page.locator('#play')).toHaveText('Ⅱ Pause');
 await page.locator('#clear').click();await expect(page.locator('#confirm-dialog')).toBeVisible();await expect(page.locator('#play')).toHaveText('▶ Run');
 const tick=await page.locator('#universe').getAttribute('data-tick');await page.waitForTimeout(120);await expect(page.locator('#universe')).toHaveAttribute('data-tick',tick);
 await page.locator('#confirm-cancel').click();await expect(page.locator('#play')).toHaveText('Ⅱ Pause');await expect(page.locator('#planet-count')).toHaveText('1');await page.locator('#play').click();
});
test('rejected stellar conditions keep the existing mode and restore the controls',async({page})=>{
 await page.locator('#sandbox').click();
 await page.evaluate(()=>document.querySelector('#star-mass').add(new Option('Invalid test mass','99')));
 await page.locator('#star-mass').selectOption('99');await expect(page.locator('#toast')).toContainText('Invalid stellar mass');
 await expect(page.locator('#star-mass')).toHaveValue('1');await expect(page.locator('#mission-name')).toHaveText('Your universe');
 await page.locator('#launch').click();await expect(page.locator('#planet-count')).toHaveText('1');
});
test('notifications stay inside the scene and clear the primary controls',async({page})=>{
 await page.locator('#sandbox').click();
 await page.locator('#seed-belt').click();await page.locator('#undo').click();
 await page.locator('#undo').click();await expect(page.locator('#toast')).toBeVisible();
 const bounds=await page.evaluate(()=>({toast:document.querySelector('#toast').getBoundingClientRect().toJSON(),scene:document.querySelector('#universe').getBoundingClientRect().toJSON(),launch:document.querySelector('#launch').getBoundingClientRect().toJSON()}));
 expect(bounds.toast.bottom).toBeLessThanOrEqual(bounds.scene.bottom);expect(bounds.toast.width).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth));
});
