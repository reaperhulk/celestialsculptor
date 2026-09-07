import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Simulation} from '../dist/pkg/celestial_wasm.js';
import {CheckpointCache,MemoryCheckpointStore,matchesCheckpoint} from '../web/checkpoints.js';
import {Runtime} from '../web/runtime.js';
await init({module_or_path:await readFile('dist/pkg/celestial_wasm_bg.wasm')});
test('persistent restart selects the nearest matching prefix and rejects altered cache bytes',async()=>{
 const store=new MemoryCheckpointStore(),cache=new CheckpointCache({provenance:'build-A',store}),sim=new Simulation(JSON.stringify({seed:42,mission:null,star_mass:1}));
 try{
  sim.command(JSON.stringify({type:'seed_swarm',count:511,disorder:.4}));sim.advance(64);await cache.capture(sim,{force:true});sim.advance(64);await cache.capture(sim,{force:true});
  const replay=JSON.parse(sim.export_replay()),nearest=await new CheckpointCache({provenance:'build-A',store}).nearest(replay);assert.equal(nearest.tick,128);
  assert.equal(await new CheckpointCache({provenance:'build-B',store}).nearest(replay),null);
  const metadata=(await store.list()).find(e=>e.replay.end_tick===128);store.records.get(metadata.key).text+='bad';assert.equal((await cache.nearest(replay)).tick,64);
  assert.equal(matchesCheckpoint(metadata,{...replay,commands:[]},'build-A'),false);
 }finally{sim.free();}
});
test('worker reconstructs a branch from restart state with the same result as full replay',async()=>{
 const store=new MemoryCheckpointStore(),checkpoints=new CheckpointCache({provenance:'build',store}),messages=[],r=new Runtime(Simulation,m=>messages.push(m),{checkpoints});
 try{
  r.receive({type:'reset',config:{seed:42,mission:null,star_mass:1}});r.receive({type:'command',command:{type:'seed_swarm',count:511,disorder:0}});await checkpoints.pending;
  r.sim.advance(128);await checkpoints.capture(r.sim,{force:true});const replay=r.sim.export_replay(),snapshot=r.sim.snapshot();
  await r.receive({type:'import',id:91,replay});assert.equal(r.sim.snapshot(),snapshot);assert.ok(messages.some(m=>m.id===91&&m.from_checkpoint&&m.tick===128));
 }finally{await checkpoints.pending;r.sim.free();}
});

test('a newer comparison supersedes an in-flight age without replacing the active world',async()=>{
 const messages=[],r=new Runtime(Simulation,m=>messages.push(m));r.receive({type:'reset',config:{mission:null,seed:42,star_mass:1}});try{
  r.receive({type:'command',command:{type:'launch',kind:'rocky',radius:1,speed:1,angle:0}});const current=r.sim.export_replay(),replay=JSON.stringify({...JSON.parse(current),end_tick:512*600});
  const first=r.receive({type:'compare',id:1,replays:[replay,replay],tick:512*600}),second=r.receive({type:'compare',id:2,replays:[replay,replay],tick:16});await Promise.all([first,second]);assert.ok(messages.some(m=>m.id===1&&m.type==='error'&&m.message.includes('cancelled')));assert.ok(messages.some(m=>m.id===2&&m.type==='comparison'&&m.tick===16));assert.equal(r.sim.export_replay(),current);
 }finally{r.sim.free();}
});
