import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import init,{Simulation} from '../dist/pkg/celestial_wasm.js';
await init({module_or_path:await readFile('dist/pkg/celestial_wasm_bg.wasm')});
const config=JSON.stringify({seed:42,mission:null,star_mass:1});
test('WASM grows impacts and retains their orbital and material evidence',()=>{
 const sim=new Simulation(config);try{for(const [kind,mass,speed] of [['rocky',1,1],['ice',3,.6]])sim.command(JSON.stringify({type:'launch_mass',kind,mass,radius:1,angle:0,speed}));sim.advance(1);const state=JSON.parse(sim.snapshot());assert.equal(state.bodies[1].kind,'ice');assert.ok(state.orbits[0][1].eccentricity>.4);assert.ok(state.events.some(e=>e.impact?.radius_after>e.impact?.radius_before));const replay=sim.export_replay();assert.equal(JSON.parse(replay).version,3);const before=sim.snapshot();sim.import_replay(replay);assert.equal(sim.snapshot(),before);}finally{sim.free();}
});
test('WASM runs retrograde moons and round-trips reversed spin',()=>{
 const sim=new Simulation(config);try{sim.command(JSON.stringify({type:'launch_mass',kind:'giant',mass:318,radius:3,angle:0,speed:1}));sim.command(JSON.stringify({type:'launch_moon',parent:1,kind:'rocky',mass:.1,distance:.05,angle:0,speed:-1}));sim.command(JSON.stringify({type:'spin',id:1,rate:-1}));for(let i=0;i<10;i++)sim.advance(512);const state=JSON.parse(sim.snapshot());assert.equal(state.status.moons,1);assert.equal(state.moon_orbits.length,1);assert.ok(state.bodies[1].spin<0);const before=sim.snapshot();sim.import_replay(sim.export_replay());assert.equal(sim.snapshot(),before);}finally{sim.free();}
});
test('current event locations survive removal so escapes remain inspectable',()=>{
 const sim=new Simulation(JSON.stringify({seed:42,mission:null,star_mass:1}));try{sim.command(JSON.stringify({type:'launch_mass',kind:'rocky',mass:1,radius:1,angle:0,speed:1.8}));for(let i=0;i<4;i++)sim.advance(512);const state=JSON.parse(sim.snapshot()),event=state.events.find(e=>e.kind==='escape');assert.ok(event?.position);assert.ok(Math.hypot(event.position.x,event.position.y)>8);assert.equal(state.bodies.some(b=>b.id===event.body),false);const before=sim.snapshot();sim.import_replay(sim.export_replay());assert.equal(sim.snapshot(),before);}finally{sim.free();}
});
