import test from 'node:test';
import assert from 'node:assert/strict';
import {launchFromPoint,nearestBody,installInput} from '../web/input.js';
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
test('new bodies remain pickable before the first sizing frame',()=>{
 const bodies=[{id:0,pos:{x:0,y:0}},{id:1,pos:{x:100,y:0}}];
 for(const missing of [undefined,NaN])assert.equal(nearestBody(bodies,102,0,(x,y)=>[x,y],18,b=>b.id===0?20:missing),1);
});

test('wheel zoom normalizes pixel line and page units with bounded jumps',async()=>{
 const {wheelZoom}=await import('../web/input.js');
 assert.equal(wheelZoom(2,1),wheelZoom(32,0));assert.equal(wheelZoom(.1,2,800),wheelZoom(80,0));
 assert.equal(wheelZoom(NaN),1);assert.equal(wheelZoom(10000),wheelZoom(150));assert.ok(Math.abs(wheelZoom(50)*wheelZoom(-50)-1)<1e-12);
});
test('lifting one finger from a pinch continues panning without another touch or selection',()=>{
 const handlers={},canvas={clientWidth:800,clientHeight:600,getBoundingClientRect:()=>({left:0,top:0}),focus(){},setPointerCapture(){},addEventListener:(name,fn)=>handlers[name]=fn};
 const renderer={center:{x:0,y:0},zoom:3,tilt:1,inputMode:'pan'},calls=[];
 installInput(canvas,renderer,{onDraft:()=>calls.push('draft'),onSelect:()=>calls.push('select')});
 const event=(pointerId,clientX,clientY)=>({pointerId,clientX,clientY,button:0,pointerType:'touch'});
 handlers.pointerdown(event(1,300,300));handlers.pointerdown(event(2,400,300));handlers.pointermove(event(2,440,300));
 handlers.pointerup(event(2,440,300));const before={...renderer.center};handlers.pointermove(event(1,320,320));handlers.pointerup(event(1,320,320));
 assert.notDeepEqual(renderer.center,before);assert.deepEqual(calls,[]);
});
test('a tap retains follow and a real drag releases it at the current camera position',()=>{
 const handlers={},canvas={clientWidth:800,clientHeight:600,getBoundingClientRect:()=>({left:0,top:0}),focus(){},setPointerCapture(){},addEventListener:(name,fn)=>handlers[name]=fn};
 const renderer={center:{x:2,y:0},zoom:3,tilt:1,inputMode:'navigate',follow:1,state:{bodies:[]}},event={pointerId:1,clientX:300,clientY:300,button:0,pointerType:'touch'};
 installInput(canvas,renderer,{onDraft(){},onSelect(){}});handlers.pointerdown(event);handlers.pointerup(event);assert.equal(renderer.follow,1);
 handlers.pointerdown(event);renderer.center={x:3,y:0};handlers.pointermove({...event,clientX:310});assert.equal(renderer.follow,null);assert.ok(renderer.center.x>2.8);
});
