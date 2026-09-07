// Rules 6 versus 7: controlled approximation change, not bitwise trajectory parity.
// Exact-gravity convergence and long-run stability remain separate release gates.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {cpus,arch} from 'node:os';
import {execFileSync} from 'node:child_process';
import init,{Simulation} from '../dist/pkg/celestial_wasm.js';
await init({module_or_path:await readFile('dist/pkg/celestial_wasm_bg.wasm')});
const config={seed:42,mission:null,star_mass:1},cases=[];
for(const disorder of [0,.8])for(const bodies of [512,1024,2048,4096,8192]){
 const ticks=bodies<=1024?64:32,samples=[[],[]],cpuSamples=[[],[]];let final;
 for(let round=0;round<9;round++){
  const worlds=[6,7].map(version=>{const s=new Simulation(JSON.stringify(config));s.import_replay(JSON.stringify({version,config,end_tick:0,commands:[{tick:0,command:{type:'seed_swarm',count:bodies-1,disorder}}]}));return s;});
  try{
   const initial=worlds.map(s=>JSON.parse(s.balances()));
   for(const i of round%2?[1,0]:[0,1]){const start=performance.now(),cpu=process.cpuUsage();worlds[i].advance(ticks);const used=process.cpuUsage(cpu);if(round>=2){samples[i].push((performance.now()-start)/ticks);cpuSamples[i].push((used.user+used.system)/1000/ticks);}}
   final=worlds.map((s,i)=>{const state=JSON.parse(s.snapshot()),b=JSON.parse(s.balances()),a=initial[i];assert.equal(state.tick,ticks);assert.ok(state.bodies.every(b=>[b.pos.x,b.pos.y,b.vel.x,b.vel.y].every(Number.isFinite)));assert.ok(Math.abs(b.mass-a.mass)<1e-12);assert.ok(Math.hypot(b.momentum.x-a.momentum.x,b.momentum.y-a.momentum.y)<1e-12);assert.ok(Math.abs(b.angular_momentum-a.angular_momentum)<1e-12);return {rules:state.rules_version,bodies:state.bodies.length,collisions:state.status.collisions,energyDrift:(b.energy_balance-a.energy_balance)/Math.abs(a.energy_balance)};});
  }finally{worlds.forEach(s=>s.free());}
 }
 const median=s=>[...s].sort((a,b)=>a-b)[3];const [beforeMs,afterMs]=samples.map(median),[beforeCpuMs,afterCpuMs]=cpuSamples.map(median);const result={bodies,disorder,ticks,beforeMs,afterMs,speedup:beforeMs/afterMs,beforeCpuMs,afterCpuMs,cpuSpeedup:beforeCpuMs/afterCpuMs,final,samples,cpuSamples};cases.push(result);console.log(JSON.stringify(result));
}
await writeFile('tree-rules-comparison.json',JSON.stringify({revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),architecture:arch(),cpu:cpus()[0]?.model,node:process.version,scope:'Alternating warmed whole simulation ticks, rules 6 opening 0.25 versus rules 7 opening 0.35. Mass and momenta checked; exact trajectories are not expected across this versioned approximation change.',cases},null,2)+'\n');
