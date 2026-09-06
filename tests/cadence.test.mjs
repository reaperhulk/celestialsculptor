import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameClock} from '../web/cadence.js';
function frames(options){const clock=new FrameClock();let count=0;for(let i=0;i<120;i++)if(clock.due(i*1000/120,options))count++;return count;}
test('drawing work scales with playback and display settings without advancing physics',()=>{
 assert.equal(frames({playing:true}),60);assert.equal(frames({playing:true,batterySaver:true}),30);
 assert.equal(frames({}),30);assert.equal(frames({reduceMotion:true}),15);assert.equal(frames({hidden:true}),0);
 const clock=new FrameClock();assert.ok(clock.due(0));assert.equal(clock.due(1,{hidden:true}),false);assert.ok(clock.due(2));
});
