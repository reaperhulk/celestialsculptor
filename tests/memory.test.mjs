import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Simulation} from '../dist/pkg/celestial_wasm.js';
const wasm=await init({module_or_path:await readFile('dist/pkg/celestial_wasm_bg.wasm')});
test('repeated dense resets imports snapshots and frees reach a stable WASM heap size',()=>{
 const config=JSON.stringify({seed:42,mission:null,star_mass:1}),source=new Simulation(config);
 for(let i=1;i<64;i++)source.command(JSON.stringify({type:'launch',kind:'rocky',radius:.5+i*.08,angle:i*2.39996,speed:1}));
 const replay=source.export_replay();source.free();
 const cycle=()=>{const sim=new Simulation(config);try{sim.import_replay(replay);sim.advance(16);assert.equal(JSON.parse(sim.snapshot()).bodies.length,64);sim.rewind();sim.undo();sim.export_replay();}finally{sim.free();}};
 for(let i=0;i<32;i++)cycle();const warmed=wasm.memory.buffer.byteLength;
 for(let i=0;i<128;i++)cycle();assert.ok(wasm.memory.buffer.byteLength<=warmed+65536,'WASM memory grew by more than one page after warmup');
});
