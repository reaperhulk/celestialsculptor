import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {arch,cpus} from 'node:os';
import {execFileSync} from 'node:child_process';
import init,{Simulation} from '../dist/pkg/celestial_wasm.js';
await init({module_or_path:await readFile('dist/pkg/celestial_wasm_bg.wasm')});
const config={seed:42,mission:null,star_mass:1},cases=[];
for(const disorder of [0,.8])for(const bodies of [64,256,512,1024,2048,4096,8192]){
 const ticks=bodies<=1024?64:16,samples=[],snapshots=[];let last;
 for(let round=0;round<7;round++){
  const sim=new Simulation(JSON.stringify(config));try{
   sim.command(JSON.stringify({type:'seed_swarm',count:bodies-1,disorder}));assert.equal(sim.body_count(),bodies);
   const start=performance.now();sim.advance(ticks);const elapsed=performance.now()-start;
   const snapshotStart=performance.now(),text=sim.snapshot(),state=JSON.parse(text),snapshotMs=performance.now()-snapshotStart;
   assert.equal(state.tick,ticks);assert.ok(state.bodies.every(b=>Number.isFinite(b.pos.x)&&Number.isFinite(b.pos.y)));if(last)assert.equal(text,last,'Repeatability');last=text;
   if(round>=2){samples.push(elapsed/ticks);snapshots.push(snapshotMs);}
  }finally{sim.free();}
 }
 const medianMs=[...samples].sort((a,b)=>a-b)[2],state=JSON.parse(last);const result={bodies,disorder,ticks,medianTickMs:medianMs,ticksPerSecond:1000/medianMs,requested1xTicksPerSecond:102.4,snapshotMedianMs:[...snapshots].sort((a,b)=>a-b)[2],snapshotBytes:Buffer.byteLength(last),finalBodies:state.bodies.length,collisions:state.status.collisions,grazes:state.status.grazes,disruptions:state.status.disruptions,samples};cases.push(result);console.log(JSON.stringify(result));
}
await writeFile('scaling-benchmark-results.json',JSON.stringify({revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),architecture:arch(),cpu:cpus()[0]?.model,node:process.version,scope:'Whole WASM simulation ticks and snapshot encode/parse. Host throughput, not device FPS. Short trajectories; conservation and long-lived moons have separate tests.',cases},null,2)+'\n');
