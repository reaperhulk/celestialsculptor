import {test,expect} from './fixtures.js';

test('close giants have separated rendered surfaces and remain selectable',async({page},testInfo)=>{
 await page.addInitScript(()=>{
  localStorage.setItem('celestial-sculptor.experiment.v1',JSON.stringify({version:5,config:{seed:42,mission:null,star_mass:1},commands:[3.2,3.8].map(radius=>({tick:0,command:{type:'launch_mass',kind:'giant',mass:318,radius,angle:2.2,speed:1}})),end_tick:0}));
  const upload=WebGL2RenderingContext.prototype.bufferSubData,draw=WebGL2RenderingContext.prototype.drawArraysInstanced;let vertices;
  WebGL2RenderingContext.prototype.bufferSubData=function(...args){vertices=args[2];return upload.apply(this,args);};
  WebGL2RenderingContext.prototype.drawArraysInstanced=function(...args){window.__planetVertices=Array.from(vertices);return draw.apply(this,args);};
 });
 await page.goto('./?fps=1');await expect(page.locator('#play')).toBeEnabled();await expect(page.locator('#planet-count')).toHaveText('2');
 const r=await page.locator('#universe').boundingBox(),center={x:3.5*Math.cos(2.2),y:3.5*Math.sin(2.2)},x=r.x+r.width/2,y=r.y+r.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-center.x*r.height/7,y+center.y*.62*r.height/7,{steps:5});await page.waitForTimeout(100);await page.mouse.up();await page.mouse.move(x,y);
 for(let i=0;i<3;i++)await page.mouse.wheel(0,-150);
 await expect.poll(()=>page.evaluate(()=>window.__celestialPerformance?.camera?.zoom||10)).toBeLessThan(1.5);
 const geometry=await page.evaluate(()=>{const vertices=window.__planetVertices,giants=[];for(let i=0;i<vertices.length;i+=16)if(vertices[i+6]===3)giants.push({x:vertices[i],y:vertices[i+1],radius:vertices[i+2]*.31});const canvas=document.querySelector('#universe').getBoundingClientRect(),camera=window.__celestialPerformance.camera;return {giants,canvas:{x:canvas.x,y:canvas.y,width:canvas.width,height:canvas.height},camera};});
 expect(geometry.giants).toHaveLength(2);const [a,b]=geometry.giants,c=geometry.canvas,cam=geometry.camera,distance=Math.hypot(a.x-b.x,(a.y-b.y)*.62)*c.height/(2*cam.zoom);expect(a.radius+b.radius).toBeLessThan(distance);
 await page.mouse.click(c.x+c.width/2+(a.x-cam.x)*c.height/(2*cam.zoom),c.y+c.height/2-(a.y-cam.y)*.62*c.height/(2*cam.zoom));await expect(page.locator('.body-summary')).toContainText('318 Earth masses');
 if(['desktop','phone'].includes(testInfo.project.name))await page.screenshot({path:testInfo.outputPath(`review-close-giants-${testInfo.project.name}.png`)});
});
