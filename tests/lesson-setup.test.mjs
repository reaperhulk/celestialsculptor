import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {lessonSetup} from '../web/challenges.js';
import init,{Simulation} from '../dist/pkg/celestial_wasm.js';await init({module_or_path:await readFile('dist/pkg/celestial_wasm_bg.wasm')});
test('every lesson becomes its year-zero challenge without awarding its future result',async()=>{
 const lessons=JSON.parse(await readFile('web/lessons.json'));for(const lesson of lessons)for(const example of lesson.cases){const setup=lessonSetup(example),sim=new Simulation(JSON.stringify(setup.config));try{sim.import_replay(JSON.stringify(setup));const state=JSON.parse(sim.snapshot());assert.equal(state.tick,0);assert.equal(state.status.completed,false);assert.equal(state.config.mission,lesson.mission);assert.ok(state.bodies.length>1);}finally{sim.free();}}
 const original={replay:{version:5,config:{},end_tick:128,commands:[{tick:0,command:{}},{tick:64,command:{}}]}};assert.equal(lessonSetup(original).commands.length,1);assert.equal(original.replay.commands.length,2);
});
