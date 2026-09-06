import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init, { Simulation } from '../dist/pkg/celestial_wasm.js';
import { Runtime } from '../web/runtime.js';
await init({module_or_path: await readFile(new URL('../dist/pkg/celestial_wasm_bg.wasm', import.meta.url))});
const config = { seed: 42, mission: 0, star_mass: 1 };
function setup() {
  const messages = [], r = new Runtime(Simulation, m => messages.push(m));
  r.handle({type: 'reset', config});
  r.handle({type: 'command', command: {type:'launch',kind:'rocky',radius:1,angle:0,speed:1}});
  return {r,messages};
}
test('worker controller pauses, advances fixed ticks, and bounds catch-up', () => {
  const {r} = setup(); r.advanceElapsed(1000);
  assert.equal(JSON.parse(r.sim.snapshot()).tick, 0);
  r.handle({type:'play',value:true}); r.handle({type:'speed',value:16}); r.advanceElapsed(1000);
  assert.equal(JSON.parse(r.sim.snapshot()).tick, 128);
  r.handle({type:'play',value:false}); r.advanceElapsed(1);
  assert.equal(JSON.parse(r.sim.snapshot()).tick, 128); r.sim.free();
});
test('failed reset leaves existing simulation intact and replies to request', () => {
  const {r,messages} = setup(), before = r.sim.snapshot();
  r.handle({type:'reset',id:37,config:{...config,star_mass:100}});
  assert.equal(r.sim.snapshot(), before); assert.equal(messages.at(-1).type,'error');
  assert.equal(messages.at(-1).id,37); r.sim.free();
});
test('completion pauses playback and export preserves authoritative commands', () => {
  const {r,messages} = setup(); r.handle({type:'play',value:true}); r.handle({type:'speed',value:16});
  for(let i=0;i<20;i++) r.advanceElapsed(0.1);
  assert.equal(JSON.parse(r.sim.snapshot()).status.completed,true); assert.equal(r.playing,false);
  r.handle({type:'export',id:5}); assert.equal(JSON.parse(messages.at(-1).replay).commands.length,1);
  r.sim.free();
});
test('worker stepping does not serialize full snapshots for completion polling',()=>{
 const {r}=setup();const snapshot=r.sim.snapshot.bind(r.sim);let reads=0;
 r.sim.snapshot=()=>{reads++;return snapshot();};
 r.handle({type:'play',value:true});reads=0;
 for(let i=0;i<20;i++)r.advanceElapsed(.016);
 assert.equal(reads,0);assert.equal(r.sim.flags(),0);r.sim.free();
});
test('timeline generations change only after successful history replacement',()=>{
 const {r,messages}=setup();const generation=r.generation;
 r.handle({type:'import',replay:'broken'});assert.equal(r.generation,generation);
 r.handle({type:'step'});assert.equal(r.generation,generation);
 r.handle({type:'rewind'});assert.equal(r.generation,generation+1);
 assert.equal(messages.at(-1).generation,generation+1);r.sim.free();
});
