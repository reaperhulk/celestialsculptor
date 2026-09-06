import {test,expect} from './fixtures.js';
test('navigation pans without editing the launch conditions and fit remains reachable',async({page})=>{
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();const canvas=page.locator('#universe'),r=await canvas.boundingBox();
 await page.mouse.move(r.x+r.width*.5,r.y+r.height*.65);await page.mouse.down();await page.mouse.move(r.x+r.width*.65,r.y+r.height*.72,{steps:10});await page.mouse.up();
 await expect(page.locator('#radius')).toHaveValue('1');await expect(page.locator('#planet-count')).toHaveText('0');await expect(page.locator('#fit-view')).toBeInViewport();await page.locator('#fit-view').click();
 await page.locator('#place-mode').click();await expect(page.locator('#place-mode')).toHaveAttribute('aria-pressed','true');await canvas.focus();await page.keyboard.press('Escape');await expect(page.locator('#place-mode')).toHaveAttribute('aria-pressed','false');
});
test('custom masses, retrograde moons and independent axial spin work through the real worker',async({page})=>{
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();await page.locator('#sandbox').click();await page.locator('#kind').selectOption('giant');await page.locator('#launch').click();await expect(page.locator('#planet-count')).toHaveText('1');
 await page.locator('#inspect-body').selectOption('1');await expect(page.locator('#inspector')).toContainText('318.00 Earth masses');await page.locator('#moon-tools > summary').click();await page.locator('#moon-direction').selectOption('-1');await page.locator('#add-moon').click();await expect(page.locator('#inspect-body option')).toHaveCount(3);
 await page.locator('#spin-reverse').click();await page.locator('#inspect-body').selectOption('2');await expect(page.locator('#inspector')).toContainText('Moon of 1');await page.locator('#step').click();await expect(page.locator('#inspector')).toContainText('Moon of 1');
});
test('FPS can be enabled with a URL flag and disabled in view settings',async({page})=>{
 await page.goto('./?fps=1');await expect(page.locator('#play')).toBeEnabled();await expect(page.locator('#fps-overlay')).toContainText('fps');await expect.poll(()=>page.evaluate(()=>window.__celestialPerformance?.fps||0)).toBeGreaterThan(0);
 expect(await page.evaluate(()=>window.__celestialPerformance.dpr)).toBe(await page.evaluate(()=>Math.min(2,devicePixelRatio)));
 await page.locator('#display').click();await page.locator('#show-fps').uncheck();await page.locator('#close-display').click();await expect(page.locator('#fps-overlay')).toBeHidden();
});
test('the star stays selectable while time advances',async({page})=>{
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();await page.locator('#launch').click();await page.locator('#inspect-body').selectOption('0');await page.locator('#step').click();await expect(page.locator('#inspector')).toContainText('solar masses');await expect(page.locator('#sim-years')).toHaveText('0.03');
});
test('real two-finger touch input combines pan and zoom without placing worlds',async({page})=>{
 await page.goto('./?fps=1');await expect(page.locator('#play')).toBeEnabled();await expect.poll(()=>page.evaluate(()=>window.__celestialPerformance?.camera?.zoom||0)).toBeGreaterThan(0);const before=await page.evaluate(()=>window.__celestialPerformance.camera),r=await page.locator('#universe').boundingBox(),x=r.x+r.width*.5,y=r.y+r.height*.6;
 const session=await page.context().newCDPSession(page);const touch=(a,b)=>[{x:a.x,y:a.y,id:1},{x:b.x,y:b.y,id:2}];await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch({x:x-30,y},{x:x+30,y})});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch({x:x-45,y:y-15},{x:x+55,y:y+5})});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(()=>page.evaluate(()=>window.__celestialPerformance.camera.zoom)).toBeLessThan(before.zoom*.8);await expect(page.locator('#radius')).toHaveValue('1');await expect(page.locator('#planet-count')).toHaveText('0');await session.detach();
});
