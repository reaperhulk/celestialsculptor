import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import init,{Simulation} from '../dist/pkg/celestial_wasm.js';import {Runtime} from '../web/runtime.js';
await init({module_or_path:await readFile(new URL('../dist/pkg/celestial_wasm_bg.wasm',import.meta.url))});
function runtime(){const messages=[],r=new Runtime(Simulation,m=>messages.push(m));r.handle({type:'reset',config:{seed:42,mission:null,star_mass:1}});return {r,messages};}
const world={type:'launch_mass',kind:'rocky',mass:1,radius:1,angle:0,speed:1};
test('observations include impact details and event watching pauses without changing physics',()=>{
 const {r,messages}=runtime();try{
  r.handle({type:'command',command:world});r.handle({type:'command',command:{...world,speed:.8}});
  r.handle({type:'event_policy',value:'pause'});r.handle({type:'play',value:true});r.advanceElapsed(.1);assert.equal(r.playing,false);
  r.handle({type:'observations',id:4});const history=messages.at(-1).history;assert.ok(history.events.some(e=>e.impact?.orbit_after));
  const replay=r.sim.export_replay();r.sim.import_replay(replay);assert.deepEqual(JSON.parse(r.sim.observations()),history);
 }finally{r.sim.free();}
});
test('equal-age comparisons reconstruct both runs and leave the active experiment alone',()=>{
 const {r,messages}=runtime();try{
  r.handle({type:'command',command:world});r.sim.advance(100);const a=r.sim.export_replay();
  r.handle({type:'command',command:{...world,radius:2}});r.sim.advance(100);const b=r.sim.export_replay(),active=r.sim.snapshot();
  r.handle({type:'compare',id:1,replays:[a,b]});const result=messages.at(-1);assert.equal(result.tick,100);assert.ok(result.states.every(s=>s.tick===100));assert.equal(result.states[0].status.planets,1);assert.equal(result.states[1].status.planets,2);assert.equal(r.sim.snapshot(),active);
  r.handle({type:'seek',tick:0});r.handle({type:'original'});assert.equal(messages.at(-1).replay,b);assert.equal(messages.at(-1).snapshot.tick,200);
 }finally{r.sim.free();}
});
