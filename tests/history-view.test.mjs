import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {historyView} from '../web/history-view.js';
import init,{Simulation} from '../dist/pkg/celestial_wasm.js';await init({module_or_path:await readFile('dist/pkg/celestial_wasm_bg.wasm')});
test('live and review charts transmit the same selected history with bounded payload',()=>{
 const sim=new Simulation(JSON.stringify({mission:null,star_mass:1,seed:42}));try{
 for(let i=1;i<64;i++)sim.command(JSON.stringify({type:'launch',kind:'rocky',radius:.5+i*.08,angle:i*2.399963229728653,speed:1}));
 for(let i=0;i<18;i++)sim.advance(512);
 const full=JSON.parse(sim.observations());for(const body of [0,1,32,999]){
 const view=JSON.parse(sim.observation_view(body,0,0));assert.deepEqual(view,historyView(full,{body,inner:0,outer:0}));assert.ok(view.frames.every(f=>f.bodies.length<=1&&f.resonances.length<=1));assert.ok(JSON.stringify(view).length<350000);assert.ok(JSON.stringify(view).length<JSON.stringify(full).length/5);
 }
 }finally{sim.free();}
});
