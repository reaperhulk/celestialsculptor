import test from 'node:test';import assert from 'node:assert/strict';import {interpolationAlpha,sampleBody} from '../web/motion.js';
test('tracked worlds and their camera can share smooth intermediate positions',()=>{
 const previous={pos:{x:2,y:3},rotation:6.2},body={pos:{x:4,y:7},rotation:.1};const alpha=interpolationAlpha(1.025,1,.95,true,true);const position=sampleBody(body,previous,alpha);assert.ok(Math.abs(position.x-3)<1e-10);assert.ok(Math.abs(position.y-5)<1e-10);assert.ok(position.rotation>6.2&&position.rotation<6.4);assert.equal(interpolationAlpha(1.025,1,.95,false,true),1);assert.equal(interpolationAlpha(1.025,1,.95,true,false),1);assert.equal(interpolationAlpha(2,1,.95,true,true),1);assert.deepEqual(sampleBody(body,null,0),{x:4,y:7,rotation:.1});
});
