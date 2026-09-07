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
test('invalid elapsed samples and malformed playback requests cannot poison the worker clock',()=>{
 const {r,messages}=setup();r.handle({type:'play',value:'false'});assert.equal(r.playing,false);assert.equal(messages.at(-1).type,'error');
 r.handle(null);assert.equal(messages.at(-1).type,'error');r.handle({type:'play',value:true});
 const before=r.sim.snapshot();for(const elapsed of [NaN,Infinity,-Infinity,-1,0])r.advanceElapsed(elapsed);
 assert.equal(r.sim.snapshot(),before);assert.equal(r.debt,0);r.advanceElapsed(.1);assert.equal(JSON.parse(r.sim.snapshot()).tick,10);r.sim.free();
});
test('history review can move backward and forward, then edits create a branch',()=>{
 const {r,messages}=setup();try{r.sim.advance(512);r.handle({type:'command',command:{type:'launch',kind:'ice',radius:2,angle:1,speed:1}}); // Ice is locked: failure must not damage the history.
 r.sim.advance(512);const original=r.sim.export_replay();r.handle({type:'seek',tick:100});assert.equal(JSON.parse(r.sim.snapshot()).tick,100);assert.equal(messages.at(-1).timeline_end,1024);
 r.handle({type:'seek',tick:1024});assert.equal(r.sim.export_replay(),original);
 r.handle({type:'seek',tick:100});r.handle({type:'command',command:{type:'launch',kind:'rocky',radius:2,angle:1,speed:1}});assert.equal(r.timelineSource,null);assert.equal(JSON.parse(r.sim.export_replay()).end_tick,100);assert.equal(JSON.parse(r.sim.export_replay()).commands.length,2);
 const before=r.sim.snapshot();r.handle({type:'seek',tick:200});assert.equal(messages.at(-1).type,'error');assert.equal(r.sim.snapshot(),before);
 }finally{r.sim.free();}
});
test('timeline review removes later placements and restores them exactly on return',()=>{
 const {r,messages}=setup();try{r.handle({type:'reset',config:{...config,mission:null}});r.handle({type:'command',command:{type:'launch',kind:'rocky',radius:1,angle:0,speed:1}});r.sim.advance(512);r.handle({type:'command',command:{type:'launch',kind:'ice',radius:2,angle:1,speed:1}});r.sim.advance(512);const original=r.sim.snapshot();r.handle({type:'seek',tick:100});assert.equal(messages.at(-1).bodies.length,2);r.handle({type:'seek',tick:1024});assert.equal(r.sim.snapshot(),original);r.handle({type:'seek',tick:100});r.handle({type:'play',value:true});r.advanceElapsed(.1);assert.equal(r.timelineSource,null);assert.equal(JSON.parse(r.sim.export_replay()).commands.length,1);}finally{r.sim.free();}
});
test('pausing a reviewed timeline retains its full observation cache and original endpoint',()=>{
 const {r,messages}=setup();try{r.sim.advance(256);r.handle({type:'seek',tick:32});const history=r.timelineHistory,source=r.timelineSource;r.handle({type:'play',value:false});assert.deepEqual(r.timelineHistory,history);assert.equal(r.timelineSource,source);r.handle({type:'observations',filter:{body:1}});assert.equal(messages.at(-1).type,'observations');assert.ok(messages.at(-1).history.frames.at(-1).tick>=256);r.handle({type:'seek',tick:256});assert.equal(JSON.parse(r.sim.snapshot()).tick,256);}finally{r.sim.free();}
});
