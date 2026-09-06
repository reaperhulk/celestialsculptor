import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
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
 const probe=new Simulation(JSON.stringify(fixture.replay.config));probe.import_replay(JSON.stringify(fixture.replay));
 const snapshotBytes=Buffer.byteLength(probe.snapshot());const started=performance.now();for(let i=0;i<200;i++)JSON.parse(probe.snapshot());const snapshotMicroseconds=(performance.now()-started)*5;probe.free();
 samples.sort((a,b)=>a-b);assert.ok(samples.every(sample=>Number.isFinite(sample)&&sample>0));cases.push({snapshotBytes,snapshotMicroseconds,bodies:fixture.bodies,nativeMedianMs:fixture.median_ms,wasmMedianMs:samples[3],wasmMaxMs:samples[6],wasmTicksPerSecond:2048000/samples[3]});
}
const report={architecture:native.architecture,os:native.os,node:process.version,cases};
await writeFile('benchmark-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,'## Simulation performance\n\nInformational medians; correctness gates use numerical invariants, not runner speed.\n\n| Bodies | Native ms / 2048 ticks | WASM ms / 2048 ticks | Snapshot µs | Snapshot bytes |\n|---:|---:|---:|---:|---:|\n'+cases.map(c=>`| ${c.bodies} | ${c.nativeMedianMs.toFixed(1)} | ${c.wasmMedianMs.toFixed(1)} | ${c.snapshotMicroseconds.toFixed(1)} | ${c.snapshotBytes} |`).join('\n')+'\n');
