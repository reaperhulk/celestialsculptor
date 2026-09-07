import test from 'node:test';import assert from 'node:assert/strict';import {worldAt,anchoredZoom,panCenter,pinchCamera,MIN_ZOOM,MAX_ZOOM} from '../web/camera.js';
import {FrameMeter,fpsFlag,simulationPace} from '../web/performance.js';
const near=(a,b)=>assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-10);
test('wheel zoom keeps the pointed world fixed across desktop, touch and moon scales',()=>{
 for(const [w,h] of [[390,360],[1366,620],[1024,768]])for(const z of [.02,.1,3.5,9])for(const tilt of [.62,1]){
  const p={x:w*.2,y:h*.7},center={x:3,y:-2},anchor=worldAt(p,w,h,center,z,tilt),next=anchoredZoom(p,w,h,center,z,tilt,z*.8);near(anchor,worldAt(p,w,h,next.center,next.zoom,tilt));
 }
});
test('pinching can pan and zoom together without losing the world under the fingers',()=>{
 const anchor={x:2,y:-1},pixel={x:120,y:210},next=pinchCamera(anchor,pixel,390,400,.08,.62);near(anchor,worldAt(pixel,390,400,next.center,next.zoom,.62));
 assert.equal(pinchCamera(anchor,pixel,390,400,1e9,1).zoom,MAX_ZOOM);assert.equal(pinchCamera(anchor,pixel,390,400,0,1).zoom,MIN_ZOOM);
});
test('dragging translates the scene exactly with the pointer and is reversible',()=>{
 const center={x:2,y:3},next=panCenter(center,40,60,400,2,.62);near(center,panCenter(next,-40,-60,400,2,.62));
 near(worldAt({x:150,y:170},390,400,center,2,.62),worldAt({x:190,y:230},390,400,next,2,.62));
});
test('FPS flag is explicit and the overlay reports actual rendered intervals',()=>{
 assert.equal(fpsFlag('?fps=1'),true);assert.equal(fpsFlag('?fps=0',true),false);assert.equal(fpsFlag('',true),true);
 const meter=new FrameMeter();for(let i=0;i<120;i++)meter.record(i*1000/60,2);const r=meter.report(2000,204);assert.ok(Math.abs(r.fps-60)<1e-8);assert.ok(Math.abs(r.p95-1000/60)<1e-8);assert.equal(r.drawMs,2);assert.equal(r.ticksPerSecond,102);meter.reset();assert.equal(meter.report(3000,0),null);
});
test('resetting device timing at a restored tick excludes the old timeline',()=>{
 const meter=new FrameMeter();meter.reset(1000,50000);for(let i=0;i<60;i++)meter.record(1000+i*1000/60,1);const report=meter.report(2000,50102);assert.equal(report.ticksPerSecond,102);assert.ok(Math.abs(report.fps-60)<1e-8);
});
test('local scene context counts the current moon family and hides absent stellar bands',async()=>{
 const {sceneContext}=await import('../web/camera.js');const state={bodies:[{id:0,pos:{x:0,y:0}},{id:1,parent:null},{id:2,parent:1}],status:{zone_inner:.9,zone_outer:1.4}};
 assert.equal(sceneContext(state,{x:3,y:0},.1,390,400,1,2),'World 1 · 1 bound moon');assert.equal(sceneContext(state,{x:8,y:0},.1,390,400,1,null),'System view');assert.equal(sceneContext(state,{x:0,y:0},2,390,400,1,null),'Potential habitable zone');
});

test('physics pace distinguishes slow integration, catch-up and pause',()=>{
 assert.deepEqual(simulationPace(51.2,1),{requestedSpeed:1,achievedSpeed:.5,targetTicksPerSecond:102.4,throughputRatio:.5});
 assert.equal(simulationPace(204.8,1).throughputRatio,2);assert.equal(simulationPace(25.6,.25).throughputRatio,1);
 assert.equal(simulationPace(102.4,16).throughputRatio,1/16);assert.equal(simulationPace(100,1,false).achievedSpeed,0);assert.equal(simulationPace(100,1,false).throughputRatio,null);
 assert.equal(simulationPace(NaN,1).achievedSpeed,0);assert.equal(simulationPace(100,0).throughputRatio,null);
});
