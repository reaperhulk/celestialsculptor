import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
import init,{Simulation} from '../dist/pkg/celestial_wasm.js';
await init({module_or_path:await readFile(new URL('../dist/pkg/celestial_wasm_bg.wasm',import.meta.url))});
const report=JSON.parse(execFileSync('cargo',['run','--quiet','--release','--locked','-p','celestial-sim','--bin','sculptor','--','sweep'],{encoding:'utf8',maxBuffer:20_000_000}));
test('the full seeded outcome matrix reproduces native body identities and trajectories in WASM',()=>{
 assert.equal(report.passed,true);assert.equal(report.cases.length,120);
 for(const example of report.cases){const sim=new Simulation(JSON.stringify(example.replay.config));try{sim.import_replay(JSON.stringify(example.replay));const actual=JSON.parse(sim.snapshot());assert.equal(actual.bodies.length,example.bodies);
  for(const [index,a] of actual.bodies.entries()){const b=example.final_bodies[index];assert.equal(a.id,b.id);assert.equal(a.kind,b.kind);assert.equal(a.parent,b.parent);assert.ok(Math.abs(a.mass-b.mass)<1e-12);for(const field of ['pos','vel'])for(const axis of ['x','y'])assert.ok(Math.abs(a[field][axis]-b[field][axis])<1e-8,`${example.style}/${example.seed}/${field}.${axis}`);}
 }finally{sim.free();}}
});
