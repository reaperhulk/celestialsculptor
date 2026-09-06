import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import init,{Simulation} from '../dist/pkg/celestial_wasm.js';
await init({module_or_path:await readFile('dist/pkg/celestial_wasm_bg.wasm')});
const native=JSON.parse(execFileSync('cargo',['run','--quiet','--release','--locked','-p','celestial-sim','--bin','sculptor','--','bench'],{encoding:'utf8'}));
const cases=[];
for(const fixture of native.cases){
 const samples=[];
 for(let trial=0;trial<7;trial++){
  const sim=new Simulation(JSON.stringify(fixture.replay.config));sim.import_replay(JSON.stringify(fixture.replay));
  const start=performance.now();for(let i=0;i<4;i++)sim.advance(512);
  samples.push(performance.now()-start);sim.free();
 }
 samples.sort((a,b)=>a-b);cases.push({bodies:fixture.bodies,nativeMedianMs:fixture.median_ms,wasmMedianMs:samples[3],wasmMaxMs:samples[6],wasmTicksPerSecond:2048000/samples[3]});
}
const report={architecture:native.architecture,os:native.os,node:process.version,cases};
await writeFile('benchmark-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
