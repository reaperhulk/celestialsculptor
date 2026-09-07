import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import init,{Simulation} from '../dist/pkg/celestial_wasm.js';import {BodyFrames} from '../web/body-frame.js';import {Runtime} from '../web/runtime.js';
await init({module_or_path:await readFile('dist/pkg/celestial_wasm_bg.wasm')});
const config={seed:42,mission:null,star_mass:1};
const packet=(s,body=0)=>({...JSON.parse(s.compact_snapshot(body)),generation:0,playing:true,frame_version:1,frame:s.body_frame()});
test('packed doubles preserve every body field and selected orbital readings exactly',()=>{
 const s=new Simulation(JSON.stringify(config)),frames=new BodyFrames();try{
  s.command(JSON.stringify({type:'launch_mass',kind:'giant',mass:318,radius:3,angle:0,speed:1}));s.command(JSON.stringify({type:'launch_moon',parent:1,kind:'rocky',mass:.003,distance:.05,angle:1,speed:-1}));s.command(JSON.stringify({type:'spin',id:1,rate:-2}));s.command(JSON.stringify({type:'seed_swarm',count:1021,disorder:.2}));
  for(let round=0;round<5;round++){s.advance(4);const full=JSON.parse(s.snapshot()),compact=frames.decode(packet(s,2));assert.deepEqual(compact.bodies,full.bodies);assert.deepEqual(compact.status,full.status);assert.deepEqual(compact.events,full.events);assert.deepEqual(compact.orbits.find(([id])=>id===2),full.orbits.find(([id])=>id===2));assert.deepEqual(compact.moon_orbits,full.moon_orbits);}
 }finally{s.free();}
});
test('repeated display messages preserve both interpolation frames while reusing storage',()=>{
 const s=new Simulation(JSON.stringify(config)),frames=new BodyFrames();try{s.command(JSON.stringify({type:'seed_swarm',count:511,disorder:0}));const a=frames.decode(packet(s));s.advance(1);const b=frames.decode(packet(s));const frozen=structuredClone([a.bodies,b.bodies]);for(let i=0;i<8;i++)frames.decode(packet(s));assert.deepEqual([a.bodies,b.bodies],frozen);s.advance(1);const c=frames.decode(packet(s));assert.notEqual(c.bodies,a.bodies);s.advance(1);const d=frames.decode(packet(s));assert.equal(d.bodies,a.bodies);assert.deepEqual(b.bodies,frozen[1]);}finally{s.free();}
});
test('worker transfers the packed buffer and inspection refreshes details without an edit',()=>{
 const frames=new BodyFrames();let last,transferred;const r=new Runtime(Simulation,(m,t)=>{last=m;transferred=t;});try{r.receive({type:'reset',config});r.receive({type:'command',command:{type:'seed_swarm',count:1023,disorder:0}});assert.equal(transferred[0],last.frame.buffer);assert.equal(last.bodies,undefined);const before=r.sim.export_replay();r.receive({type:'inspect',body:1000,id:99});const decoded=frames.decode(last);assert.ok(decoded.orbits.some(([id])=>id===1000));assert.equal(decoded.bodies.length,1024);assert.equal(decoded.id,99);assert.equal(r.sim.export_replay(),before);}finally{r.sim?.free();}
});
test('unknown packed frame versions and malformed lengths are rejected',()=>{const frames=new BodyFrames();assert.throws(()=>frames.decode({frame_version:2,frame:new Float64Array(20)}));assert.throws(()=>frames.decode({frame_version:1,frame:new Float64Array(21)}));});
