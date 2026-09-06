import test from 'node:test';
import assert from 'node:assert/strict';
import {VertexStream} from '../web/vertices.js';
test('maximum world trails and preview fit the reusable vertex allocation',()=>{
 const v=new VertexStream(64*192*12+241*12),backing=v.data.buffer;
 for(let i=0;i<64*191+240;i++)v.line(0,0,1,1,[1,1,1],.5);
 assert.equal(v.view().length,(64*191+240)*12);v.reset();v.line(1,2,3,4,[.5,.5,.5],1);
 assert.equal(v.data.buffer,backing);assert.equal(v.view().length,12);
});
test('capacity errors fail before corrupting an existing vertex stream',()=>{
 const v=new VertexStream(8);v.point(1,2,20,[1,0,0],1,0);const before=[...v.view()];
 assert.throws(()=>v.point(2,3,20,[0,1,0],1,0),RangeError);assert.deepEqual([...v.view()],before);
});
test('maximum trails, local moon orbits and active impacts fit one bounded line buffer',async()=>{
 const {LINE_CAPACITY}=await import('../web/vertices.js'),stream=new VertexStream(LINE_CAPACITY);for(let i=0;i<63*191+8*96+192+192+12*48;i++)stream.line(0,0,1,1,[1,1,1],1);assert.ok(stream.length<LINE_CAPACITY);
});
