import test from 'node:test';import assert from 'node:assert/strict';import {DeviceRecording,deviceScenario} from '../web/device-test.js';
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
