import test from 'node:test';
import assert from 'node:assert/strict';
import {project,unproject,launchPath} from '../web/geometry.js';
test('orbital-plane picking inverts projection across device sizes and tilts',()=>{
 for(const [w,h] of [[800,600],[390,350],[1024,600]])for(const tilt of [.35,.62,1])for(const p of [[0,0],[2,-1],[-3,2]]){
   const pixel=project(...p,w,h,3.5,tilt),world=unproject(...pixel,w,h,3.5,tilt);
   assert.ok(Math.hypot(world[0]-p[0],world[1]-p[1])<1e-12);
 }
});
test('preview has circular radius and finite escaping trajectory',()=>{
 for(const p of launchPath(1.2,.7,1))assert.ok(Math.abs(Math.hypot(...p)-1.2)<1e-12);
 for(const speed of [0,.01,.5,1,Math.SQRT2,1.8,2.2])for(const p of launchPath(1,0,speed))assert.ok(p.every(Number.isFinite));
 assert.ok(Math.hypot(...launchPath(1,0,1.8).at(-1))>5);
});
