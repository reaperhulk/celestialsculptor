import {test,expect} from './fixtures.js';

test('worlds render with closed launch details and placement survives focus changes',async({page})=>{
 await page.addInitScript(()=>{const draw=WebGL2RenderingContext.prototype.drawArraysInstanced;WebGL2RenderingContext.prototype.drawArraysInstanced=function(...args){window.__drawnInstances=args[3];return draw.apply(this,args);};});
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();await expect(page.locator('#mass-tools')).not.toHaveAttribute('open','');
 await expect.poll(()=>page.evaluate(()=>window.__drawnInstances)).toBe(1);
 await page.locator('#launch').click();await expect(page.locator('#planet-count')).toHaveText('1');await expect.poll(()=>page.evaluate(()=>window.__drawnInstances)).toBe(2);
 await page.locator('#place-mode').click();await expect.poll(()=>page.evaluate(()=>window.__drawnInstances)).toBe(3);
 await page.locator('#universe').focus();await expect.poll(()=>page.evaluate(()=>window.__drawnInstances)).toBe(3);
 await page.locator('#place-mode').click();await expect.poll(()=>page.evaluate(()=>window.__drawnInstances)).toBe(2);
});

test('tapping a planet reveals mass and axial rotation without scrolling or opening a disclosure',async({page},testInfo)=>{
 await page.goto('./?fps=1');await expect(page.locator('#play')).toBeEnabled();await page.locator('#launch').click();
 if(await page.locator('.mobile-tabs').isVisible())await page.locator('.mobile-tabs [data-panel="mission"]').click();
 await expect.poll(()=>page.evaluate(()=>window.__celestialPerformance?.camera?.zoom||0)).toBeGreaterThan(0);
 const camera=await page.evaluate(()=>window.__celestialPerformance.camera),r=await page.locator('#universe').boundingBox();
 await page.mouse.click(r.x+r.width/2+(1-camera.x)*r.height/(2*camera.zoom),r.y+r.height/2+camera.y*r.height*.62/(2*camera.zoom));
 await expect(page.locator('#inspect-body')).toHaveValue('1');await expect(page.locator('.body-summary')).toContainText('Mass: 1 Earth masses');await expect(page.locator('.body-summary')).toBeInViewport({ratio:1});await expect(page.locator('.body-rotation')).toBeInViewport({ratio:1});
 if(['desktop','phone'].includes(testInfo.project.name))await page.screenshot({path:testInfo.outputPath(`review-inspect-${testInfo.project.name}.png`)});
});

test('run followed immediately by pause stays paused even with delayed worker acknowledgements',async({page})=>{
 await page.addInitScript(()=>{const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{set onmessage(callback){super.onmessage=event=>setTimeout(()=>callback(event),150);} };});
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();await page.locator('#sandbox').click();await page.locator('#launch').click();await page.locator('#time-speed').selectOption('16');
 await page.locator('#play').evaluate(button=>{button.click();button.click();});await expect(page.locator('#play')).toHaveText('▶ Run');
 // Check settled worker state after multiple timer intervals, not just the optimistic label.
 await page.waitForTimeout(500);const tick=await page.locator('#universe').getAttribute('data-tick');await page.waitForTimeout(300);await expect(page.locator('#universe')).toHaveAttribute('data-tick',tick);await expect(page.locator('#play')).toHaveText('▶ Run');
});

test('live inspection preserves an open detail control and its keyboard focus',async({page})=>{
 await page.goto('./');await expect(page.locator('#play')).toBeEnabled();await page.locator('#sandbox').click();await page.locator('#launch').click();await page.locator('#inspect-body').selectOption('1');
 const summary=page.locator('#inspector details > summary');await summary.click();await page.locator('#play').click();await summary.focus();await summary.evaluate(node=>window.__inspectorSummary=node);
 await expect.poll(async()=>Number(await page.locator('#sim-years').textContent())).toBeGreaterThan(.2);await expect(page.locator('#inspector details')).toHaveAttribute('open','');expect(await summary.evaluate(node=>node===window.__inspectorSummary&&document.activeElement===node)).toBe(true);await page.locator('#play').click();
});
