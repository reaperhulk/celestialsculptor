import test from 'node:test';import assert from 'node:assert/strict';
import {variations,lineage,orbitPath} from '../web/experiment-lab.js';
import {deviceScenario} from '../web/device-test.js';
import {aggregateDevices} from '../web/device-qualification.js';
const replay={version:7,config:{mission:null,seed:42,star_mass:1},commands:[{tick:0,command:{type:'launch',kind:'rocky',radius:1,speed:1,angle:0}},{tick:32,command:{type:'launch',kind:'rocky',radius:2,speed:1,angle:0}}],end_tick:64};
test('variations change exactly one chosen condition, preserve age and leave the original untouched',()=>{
 const original=structuredClone(replay);const variants=variations(replay,'radius',[1.9,2,2.1]);assert.deepEqual(replay,original);
 for(const [i,v] of variants.entries()){const r=JSON.parse(v.replay);assert.equal(r.end_tick,64);assert.deepEqual(r.commands[0],replay.commands[0]);assert.equal(r.commands[1].command.radius,[1.9,2,2.1][i]);assert.equal(r.config.seed,42);}
 assert.throws(()=>variations(replay,'mass',[1]));assert.throws(()=>variations(replay,'seed',[1.5]));assert.throws(()=>variations({...replay,config:{mission:0}},'seed',[42]));
});
test('lineage follows retained merger and fragment evidence rather than equating run IDs',()=>{
 const history={events:[{tick:1,body:1,text:'merge',impact:{consumed:2}},{tick:2,body:1,text:'disruption',impact:{consumed:3,remnants:[4,5]}}]};assert.deepEqual(lineage(history,4).ancestors,[1,2,3,4]);assert.equal(lineage(history,4).evidence.length,2);
 const points=orbitPath({bound:true,periapsis:1,apoapsis:3,eccentricity:.5,periapsis_angle:0});assert.equal(points.length,129);assert.ok(Math.abs(points[0][0]-1)<1e-12);assert.ok(Math.abs(points[64][0]+3)<1e-12);
});
test('device qualification never treats emulation or partial recordings as physical support',()=>{
 const good={wasmHash:'b'.repeat(64),dirty:false,quality:{maxDpr:2,reduceMotion:false},format:'celestial-device-recording',version:2,revision:'a'.repeat(40),reason:'completed',activeSeconds:300,frames:18000,fps:60,p95FrameMs:17,maxFrameMs:30,throughputRatio:1,physicalDevice:true,deviceClass:'iphone',deviceModel:'test fixture only',scenario:'moons',replay:deviceScenario('moons')};
 const report=aggregateDevices([good,{...good,physicalDevice:false},{...good,activeSeconds:100},{...good,revision:'old'},null,{...good,replay}],good.revision,good.wasmHash);assert.deepEqual(report.results.map(r=>r.qualified),[true,false,false,false,false,false]);assert.equal(report.required.find(r=>r.deviceClass==='ipad').status,'pending physical evidence');
});
