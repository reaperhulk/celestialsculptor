import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import init,{Simulation} from '../dist/pkg/celestial_wasm.js';
await init({module_or_path:await readFile(new URL('../dist/pkg/celestial_wasm_bg.wasm',import.meta.url))});
for(const mass of [.6,1,1.5])test(`timed disk and orbital-burn native/WASM parity at ${mass} solar masses`,async()=>{
 const sim=new Simulation(JSON.stringify({seed:719,mission:null,star_mass:mass}));
 const command=value=>sim.command(JSON.stringify(value));
 command({type:'launch',kind:'rocky',radius:1,angle:.3,speed:1});
 command({type:'seed_disk',radius:3,spread:.8,disorder:.15,count:16});
 sim.advance(256);command({type:'nudge',id:1,tangential:.1,radial:.05});
 sim.advance(512);command({type:'launch',kind:'giant',radius:5,angle:2,speed:1});sim.advance(512);
 const dir=await mkdtemp(join(tmpdir(),'sculptor-parity-'));
 try{
  const file=join(dir,'replay.json');await writeFile(file,sim.export_replay());
  const native=JSON.parse(execFileSync('cargo',['run','--quiet','--release','--locked','-p','celestial-sim','--bin','sculptor','--','replay',file],{encoding:'utf8'}));
  const wasm=JSON.parse(sim.snapshot());assert.deepEqual(wasm.events,native.events);assert.equal(wasm.bodies.length,native.bodies.length);
  for(let i=0;i<wasm.bodies.length;i++){assert.equal(wasm.bodies[i].id,native.bodies[i].id);for(const field of ['pos','vel'])for(const axis of ['x','y'])assert.ok(Math.abs(wasm.bodies[i][field][axis]-native.bodies[i][field][axis])<1e-8);}
  const before=sim.snapshot();sim.import_replay(await readFile(file,'utf8'));assert.equal(sim.snapshot(),before);
 }finally{sim.free();await rm(dir,{recursive:true,force:true});}
});
