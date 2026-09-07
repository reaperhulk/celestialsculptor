import test from 'node:test';
import assert from 'node:assert/strict';
import {BodyScale} from '../web/body-scale.js';
import {bodyDiameter} from '../web/appearance.js';
const giant=(id,x,y)=>({id,kind:'giant',mass:318*3.003e-6,radius:.002*Math.cbrt(318),pos:{x,y}});

test('non-contact giant surfaces stay visibly separate through close approaches at every view scale',()=>{
 const scale=new BodyScale(),positions=new Map();
 for(const height of [175,350,600,1080])for(const zoom of [.05,.5,1,3.5,9])for(const tilt of [.62,1])for(const angle of [0,.7,1.57,2.8])for(const separation of [.028,.05,.2,.6,2]){
  const a=giant(1,0,0),b=giant(2,separation*Math.cos(angle),separation*Math.sin(angle));scale.update([a,b],positions,height,zoom,tilt);
  const distance=Math.hypot(b.pos.x,b.pos.y*tilt)*height/(2*zoom);
  assert.ok(scale.radius(a)+scale.radius(b)<distance,`false contact at zoom ${zoom}, tilt ${tilt}, separation ${separation}`);
  assert.ok(scale.diameter(1)>0&&scale.diameter(2)>0);
 }
});
test('sizes use the drawn interpolated positions, fade crowded rings, and preserve isolated growth',()=>{
 const scale=new BodyScale(),a=giant(1,0,0),b=giant(2,4,0);scale.update([a,b],new Map(),600,3.5,1);assert.equal(scale.diameter(1),bodyDiameter(a,600,3.5));assert.ok(Math.abs(scale.rings(1)-1)<1e-12);
 scale.update([a,b],new Map([[2,{x:.08,y:0}]]),600,3.5,1);assert.ok(scale.radius(a)+scale.radius(b)<.08*600/7);assert.equal(scale.rings(1),0);
 scale.update([a],new Map(),600,3.5,1);assert.equal(scale.indices.size,1);const before=scale.diameter(1);a.mass*=8;a.radius*=2;scale.update([a],new Map(),600,3.5,1);assert.ok(Math.abs(scale.diameter(1)/before-2)<1e-12);
});
test('a crowded mixed population remains separated without changing physics data or allocating result buffers',()=>{
 const bodies=Array.from({length:64},(_,i)=>({...giant(i,i%8*.08,Math.floor(i/8)*.08),kind:i===0?'star':i%3?'rocky':'dust',radius:.01,mass:i===0?1:3.003e-6}));
 const before=JSON.stringify(bodies),scale=new BodyScale(),buffer=scale.sizes;scale.update(bodies,new Map(),600,2,.62);
 for(let i=0;i<64;i++)for(let j=i+1;j<64;j++){const a=bodies[i],b=bodies[j],gap=Math.hypot(a.pos.x-b.pos.x,(a.pos.y-b.pos.y)*.62)*600/4;assert.ok(scale.radius(a)+scale.radius(b)<gap);}
 scale.update(bodies,new Map(),600,2,.62);assert.equal(scale.sizes,buffer);assert.equal(JSON.stringify(bodies),before);
});
