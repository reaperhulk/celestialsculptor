import {test,expect} from '@playwright/test';
test('browser WebAssembly executes every sandbox recipe and round-trips its commands',async({page})=>{
 await page.goto('./');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 const outcomes=await page.evaluate(async()=>{
  const {default:init,Simulation}=await import('./pkg/celestial_wasm.js');await init();
  const recipes=await (await fetch('./recipes.json')).json(),results=[];
  for(const recipe of recipes){const sim=new Simulation(JSON.stringify(recipe.config));
   try{for(const command of recipe.commands)sim.command(JSON.stringify(command));for(let i=0;i<4;i++)sim.advance(512);
    const before=sim.snapshot();sim.import_replay(sim.export_replay());const state=JSON.parse(before);
    results.push({id:recipe.id,exact:before===sim.snapshot(),tick:state.tick,calm:state.status.calm,habitable:state.status.habitable,events:state.events.map(event=>event.kind),finite:state.bodies.every(body=>Number.isFinite(body.pos.x)&&Number.isFinite(body.vel.y))});
   }finally{sim.free();}
  }return results;
 });
 for(const result of outcomes){expect(result.exact).toBe(true);expect(result.finite).toBe(true);expect(result.tick).toBe(2048);}
 expect(outcomes[0].calm).toBe(3);expect(outcomes[0].habitable).toBe(1);expect(outcomes[1].events).toContain('collision');expect(outcomes[2].calm).toBe(5);expect(outcomes[3].events).toContain('escape');
});
