import {test,expect} from './fixtures.js';
test('a dense restored system continues beyond year forty and pauses at 16x',async({page},testInfo)=>{
 test.skip(!['desktop','phone'].includes(testInfo.project.name),'Long reconstruction runs on representative desktop and touch viewports.');test.setTimeout(90000);
 await page.addInitScript(()=>{
  localStorage.setItem('celestial-sculptor.experiment.v1',JSON.stringify({version:5,config:{seed:42,mission:null,star_mass:1},commands:[1.5,2.5,3.5,4.5].map(radius=>({tick:0,command:{type:'seed_belt',radius}})),end_tick:512*40}));
  window.__savedTicks=[];const save=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='celestial-sculptor.experiment.v1')window.__savedTicks.push(JSON.parse(value).end_tick);return save.call(this,key,value);};
  const interval=window.setInterval.bind(window);window.setInterval=(callback,delay,...args)=>interval(callback,delay===3000?50:delay,...args);
 });
 await page.goto('./');await expect(page.locator('#sim-years')).toHaveText('40.00',{timeout:60000});await expect(page.locator('#play')).toHaveText('▶ Run');await expect(page.locator('#play')).toBeEnabled();expect(await page.evaluate(()=>window.__savedTicks.every(tick=>tick>=512*40))).toBe(true);
 await page.locator('#time-speed').selectOption('16');await page.locator('#play').click();await expect.poll(async()=>Number(await page.locator('#sim-years').textContent())).toBeGreaterThan(40.5);
 await page.locator('#play').click();await expect(page.locator('#play')).toHaveText('▶ Run');await page.waitForTimeout(250);const stopped=await page.locator('#universe').getAttribute('data-tick');await page.waitForTimeout(300);await expect(page.locator('#universe')).toHaveAttribute('data-tick',stopped);await expect(page.locator('#play')).toBeEnabled();
});
