import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Simulation,OrbitProbe} from '../dist/pkg/celestial_wasm.js';
import {orbitState,orbitError,orbitBalances} from '../web/gpu-orbit-benchmark.js';
import {validateOrbitState} from '../web/gpu-orbit-probe.js';
await init({module_or_path:await readFile('dist/pkg/celestial_wasm_bg.wasm')});

test('collisionless oracle matches live KDK integration and arbitrary batching exactly',()=>{
 for(const count of [5,64,512]){
  const sim=new Simulation(JSON.stringify({seed:42,mission:null,star_mass:1}));let probe,split;
  try{
   sim.command(JSON.stringify({type:'seed_swarm',count:count-1,disorder:0}));
   const initial=orbitState(sim.body_frame()),before=sim.export_replay();probe=new OrbitProbe(initial,false);split=new OrbitProbe(initial,false);
   probe.advance(16);split.advance(7);split.advance(0);split.advance(9);
   assert.deepEqual(probe.state(),split.state());assert.equal(sim.export_replay(),before);
   sim.advance(16);assert.deepEqual(probe.state(),orbitState(sim.body_frame()));
   for(const ticks of [-1,.5,513,NaN,Infinity])assert.throws(()=>probe.advance(ticks));
  }finally{sim.free();probe?.free();split?.free();}
 }
});
test('orbital probe boundaries reject malformed state and GPU underflow or overflow',()=>{
 const good=new Float64Array([0,0,0,0,1,1,0,0,6,3e-6]);
 assert.equal(validateOrbitState(good),2);
 for(const state of [new Float64Array(5),good.slice(1),new Float64Array(8193*5),good.with(4,0),good.with(9,-1),good.with(1,NaN),good.with(7,Infinity)]){
  assert.throws(()=>new OrbitProbe(state,false));assert.throws(()=>validateOrbitState(state));
 }
 for(const state of [good.with(4,1e-99),good.with(0,1e99)])assert.throws(()=>validateOrbitState(state));
});
test('orbit diagnostics expose drift and preserve mass weighting',()=>{
 const state=new Float64Array([0,0,0,0,1,1,0,0,6,3e-6]);assert.deepEqual(orbitError(state,state),{positionRms:0,velocityRms:0});
 const changed=state.with(7,1);assert.ok(orbitError(state,changed).velocityRms>0);assert.equal(orbitBalances(changed).px,3e-6);assert.ok(orbitBalances(changed).energy>orbitBalances(state).energy);
});

test('long-run orbital diagnostics distinguish orbit size and phase',async()=>{
 const {elements}=await import('../web/gpu-lifetime.js');const state=new Float64Array([0,0,0,0,1,1,0,0,Math.sqrt(39.47841760435743*(1+3e-6)),3e-6]);const e=elements(state,1);assert.ok(Math.abs(e.axis-1)<1e-12);assert.ok(e.eccentricity<1e-12);assert.equal(e.phase,0);
});
