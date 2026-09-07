// Sample named WASM functions without a browser. Timings include profiler cost;
// use compare-scaling.mjs for before/after performance decisions.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Session} from 'node:inspector/promises';
import init,{Simulation} from '../dist/pkg/celestial_wasm.js';
const bodies=Number(process.argv[2]||8192),ticks=Number(process.argv[3]||256);
assert.ok(Number.isInteger(bodies)&&bodies>=64&&bodies<=8192);
assert.ok(Number.isInteger(ticks)&&ticks>=16&&ticks<=1024);
await init({module_or_path:await readFile('target/browser-symbols/celestial_wasm_bg.wasm')});
const s=new Simulation(JSON.stringify({seed:42,mission:null,star_mass:1})),session=new Session();
try{
 s.command(JSON.stringify({type:'seed_swarm',count:bodies-1,disorder:.8}));s.advance(32);
 session.connect();await session.post('Profiler.enable');await session.post('Profiler.setSamplingInterval',{interval:500});await session.post('Profiler.start');s.advance(ticks);
 const {profile}=await session.post('Profiler.stop');await writeFile('scaling.cpuprofile',JSON.stringify(profile));
 const totals=new Map();for(const n of profile.nodes){const name=n.callFrame.functionName.replace(/::h[0-9a-f]+$/,'');totals.set(name,(totals.get(name)||0)+(n.hitCount||0));}
 console.log(JSON.stringify({bodies,ticks,scope:'Sampled CPU self time, including profiling overhead.',functions:[...totals].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([name,hits])=>({name,percent:100*hits/profile.samples.length}))},null,2));
}finally{session.disconnect();s.free();}
