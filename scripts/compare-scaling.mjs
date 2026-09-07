// Alternate complete physics workloads against a preserved release package.
// Every timed pair must also match exact state, balances, history, and replay.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {cpus,arch} from 'node:os';
import {execFileSync} from 'node:child_process';
assert.ok(process.argv[2],'Usage: node scripts/compare-scaling.mjs REFERENCE_PKG [COUNTS_CSV] [TICKS]');
const paths=[resolve(process.argv[2]),resolve('dist/pkg')],modules=[];
for(const path of paths){const m=await import(pathToFileURL(join(path,'celestial_wasm.js')).href);await m.default({module_or_path:await readFile(join(path,'celestial_wasm_bg.wasm'))});modules.push(m);}
const counts=(process.argv[3]||'64,256,512,1024,2048,4096,8192').split(',').map(Number);
assert.ok(counts.every(n=>Number.isInteger(n)&&n>=64&&n<=8192),'Counts must be 64–8192');
const requestedTicks=process.argv[4]===undefined?null:Number(process.argv[4]);
assert.ok(requestedTicks===null||Number.isInteger(requestedTicks)&&requestedTicks>=16&&requestedTicks<=512,'Ticks must be 16–512');
const config={seed:42,mission:null,star_mass:1},cases=[];let checkpoints=0;
for(const disorder of [0,.8])for(const bodies of counts){
 const ticks=requestedTicks??(bodies<=1024?64:16),samples=[[],[]],cpuSamples=[[],[]];
 for(let round=0;round<7;round++){
  const worlds=modules.map(m=>{const s=new m.Simulation(JSON.stringify(config));s.command(JSON.stringify({type:'seed_swarm',count:bodies-1,disorder}));return s;});
  try{
   for(const i of round%2?[1,0]:[0,1]){const start=performance.now(),cpu=process.cpuUsage();worlds[i].advance(ticks);const used=process.cpuUsage(cpu);if(round>=2){samples[i].push((performance.now()-start)/ticks);cpuSamples[i].push((used.user+used.system)/1000/ticks);}}
   for(const field of ['snapshot','balances','observations','export_replay'])assert.equal(worlds[0][field](),worlds[1][field](),`${bodies}/${disorder}/${round}: ${field}`);
   checkpoints++;
  }finally{worlds.forEach(s=>s.free());}
 }
 const median=s=>[...s].sort((a,b)=>a-b)[2];const [beforeMs,afterMs]=samples.map(median),[beforeCpuMs,afterCpuMs]=cpuSamples.map(median);const result={bodies,disorder,ticks,beforeMs,afterMs,speedup:beforeMs/afterMs,beforeCpuMs,afterCpuMs,cpuSpeedup:beforeCpuMs/afterCpuMs,samples,cpuSamples};cases.push(result);console.log(JSON.stringify(result));
}
await writeFile('scaling-comparison-results.json',JSON.stringify({revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),reference:paths[0],architecture:arch(),cpu:cpus()[0]?.model,node:process.version,scope:'Alternating warmed whole physics ticks. Exact state checks; not rendered FPS.',checkpoints,cases},null,2)+'\n');
