import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Simulation} from '../dist/pkg/celestial_wasm.js';
import {Runtime} from '../web/runtime.js';
import {readGeneration} from '../web/generation.js';
await init({module_or_path:await readFile('dist/pkg/celestial_wasm_bg.wasm')});
const config={seed:42,mission:null,star_mass:1};
test('large WASM systems round-trip and enforce actual and legacy capacity',()=>{
 const s=new Simulation(JSON.stringify(config));try{s.command(JSON.stringify({type:'generate_system',style:'swarm',count:8191,chaos:.1}));assert.equal(s.body_count(),8192);const replay=s.export_replay();assert.ok(replay.length<512);assert.throws(()=>s.command(JSON.stringify({type:'launch',kind:'rocky',radius:1,angle:0,speed:1})));s.import_replay(replay);assert.equal(s.body_count(),8192);const old=JSON.parse(replay);old.version=5;assert.throws(()=>s.import_replay(JSON.stringify(old)));assert.equal(s.export_replay(),replay);}finally{s.free();}
});
test('large worker batches yield at the budget, retain debt and obey Pause',()=>{
 let clock=0;const r=new Runtime(Simulation,()=>{}, {now:()=>++clock,workBudgetMs:3});try{r.handle({type:'reset',config});r.handle({type:'command',command:{type:'seed_swarm',count:1023,disorder:0}});r.handle({type:'speed',value:16});r.handle({type:'play',value:true});r.advanceElapsed(.1);assert.equal(JSON.parse(r.sim.snapshot()).tick,3);assert.equal(r.debt,125);r.handle({type:'play',value:false});r.advanceElapsed(.1);assert.equal(JSON.parse(r.sim.snapshot()).tick,3);r.handle({type:'play',value:true});r.advanceElapsed(.1);assert.equal(JSON.parse(r.sim.snapshot()).tick,6);}finally{r.sim?.free();}
});
test('swarm settings preserve resolution only for the current replay rules',()=>{
 const value={version:6,config,command:{type:'generate_system',style:'swarm',count:8191,chaos:0}};const read=v=>readGeneration({getItem:()=>JSON.stringify(v)});assert.deepEqual(read(value),value);assert.equal(read({...value,version:5}),null);assert.equal(read({...value,command:{...value.command,count:8192}}),null);
});
