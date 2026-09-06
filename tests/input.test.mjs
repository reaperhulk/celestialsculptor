import test from 'node:test';
import assert from 'node:assert/strict';
import {launchFromPoint,nearestBody} from '../web/input.js';
test('touch placement respects stellar offset and supported radius',()=>{
 assert.deepEqual(launchFromPoint(3,1,{x:2,y:1}),{radius:1,angle:0});
 assert.equal(launchFromPoint(0,-2).angle,270);
 assert.equal(launchFromPoint(100,0).radius,6);
 assert.equal(launchFromPoint(0,0).radius,.25);
});
test('picking chooses closest world and does not select empty space',()=>{
 const bodies=[{id:1,pos:{x:5,y:5}},{id:2,pos:{x:10,y:10}}];
 assert.equal(nearestBody(bodies,9,9,(x,y)=>[x,y]),2);
 assert.equal(nearestBody(bodies,100,100,(x,y)=>[x,y]),null);
});
