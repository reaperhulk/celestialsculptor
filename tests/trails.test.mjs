import test from 'node:test';
import assert from 'node:assert/strict';
import {updateTrails} from '../web/trails.js';
const state=(generation,tick,x=1)=>({generation,tick,bodies:[{id:0,kind:'star',pos:{x:0,y:0}},{id:1,kind:'rocky',pos:{x,y:0}}]});
test('same-tick undo or import clears trails from the previous timeline',()=>{
 const trails=new Map(),a=state(1,100),b=state(1,101,2),c=state(2,101,8);
 updateTrails(trails,null,a);updateTrails(trails,a,b);assert.equal(trails.get(1).length,2);
 updateTrails(trails,b,c);assert.deepEqual(trails.get(1),[[8,0]]);
 updateTrails(trails,c,c);assert.equal(trails.get(1).length,1);
 updateTrails(trails,c,{...c,bodies:c.bodies.slice(0,1)});assert.equal(trails.size,0);
});
test('long runs cap each path and omit the star',()=>{
 const trails=new Map();let previous=null;
 for(let tick=0;tick<1000;tick++){const next=state(1,tick,tick);updateTrails(trails,previous,next);previous=next;}
 assert.equal(trails.size,1);assert.equal(trails.get(1).length,192);assert.deepEqual(trails.get(1).at(-1),[999,0]);
});
test('moon trails remove host motion and reset when the parent changes',()=>{
 const trails=new Map(),snapshot=(tick,offset,parent=1)=>({generation:1,tick,bodies:[{id:0,kind:'star',pos:{x:0,y:0}},{id:1,kind:'giant',pos:{x:offset,y:0},parent:null},{id:2,kind:'rocky',pos:{x:offset+.1,y:.2},parent}]});const a=snapshot(0,1),b=snapshot(1,2);updateTrails(trails,null,a,true);updateTrails(trails,a,b,true);assert.equal(trails.size,1);assert.equal(trails.get(2).length,2);assert.ok(Math.abs(trails.get(2)[1][0]-.1)<1e-12);assert.equal(trails.get(2)[1][1],.2);const c=snapshot(2,2,0);updateTrails(trails,b,c,true);assert.deepEqual(trails.get(2),[[2.1,.2]]);
});
