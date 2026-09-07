import test from 'node:test';import assert from 'node:assert/strict';import {DeviceRecording,deviceScenario,deviceScenarioSpeed} from '../web/device-test.js';
import {readFile} from 'node:fs/promises';import init,{Simulation} from '../dist/pkg/celestial_wasm.js';
await init({module_or_path:await readFile('dist/pkg/celestial_wasm_bg.wasm')});
test('a five-minute recording excludes idle gaps, bounds memory and retains slow frames',()=>{
 const r=new DeviceRecording({scenario:'test'});for(let i=0;i<=9000;i++)r.record(i*1000/60,2,i,true);
 r.record(160000,0,9000,false);for(let i=0;i<=9001;i++)r.record(200000+i*1000/60,3,9000+i,true);
 const report=r.report();assert.equal(r.done,true);assert.equal(report.reason,'completed');assert.ok(Math.abs(report.fps-60)<.01);assert.ok(report.activeSeconds<301);assert.equal(r.intervals.length,1001);assert.equal(report.p95DrawCpuMs,3);
 const slow=new DeviceRecording({});slow.record(0,1,0,true);slow.record(500,1,1,true);assert.equal(slow.report().maxFrameMs,500);assert.equal(slow.report().histogramOverflowFrames,1);
 assert.equal(deviceScenario('stress').commands.length,63);assert.equal(deviceScenario('moons').commands[0].command.count,9);
});
test('a changed workload finishes an immutable partial measurement',()=>{
 const r=new DeviceRecording({revision:'abc',speed:.25,scenario:'current'});r.record(0,2,0,true);r.record(16,2,1,true);r.stop('rendering quality changed');const before=r.report();r.record(1000,30,100,true);assert.deepEqual(r.report(),before);assert.equal(before.reason,'rendering quality changed');assert.equal(before.revision,'abc');assert.equal(before.frames,1);
});
test('large device workloads instantiate the requested physical population at 1x',()=>{
 for(const count of [1024,4096,8192]){const name=`swarm${count}`,replay=deviceScenario(name),sim=new Simulation(JSON.stringify(replay.config));try{sim.import_replay(JSON.stringify(replay));assert.equal(sim.body_count(),count);assert.equal(deviceScenarioSpeed(name),1);assert.equal(replay.version,6);}finally{sim.free();}}
 assert.equal(deviceScenarioSpeed('stress'),.25);
});
