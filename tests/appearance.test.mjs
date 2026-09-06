import test from 'node:test';import assert from 'node:assert/strict';
import {bodyDiameter,orbitPath,strongestPerturber,fitZoom} from '../web/appearance.js';
import {PlanetStream} from '../web/vertices.js';
test('visible collision growth preserves the radius/volume law across viewports',()=>{
 for(const height of [240,400,620,1000])for(const zoom of [1,3.5,9]){
  const a=bodyDiameter({kind:'rocky',mass:3.003e-6},height,zoom),b=bodyDiameter({kind:'rocky',mass:8*3.003e-6},height,zoom);
  assert.ok(Math.abs(b/a-2)<1e-12);
 }
});
test('selected orbit overlay reaches the physical periapsis and apoapsis',()=>{
 const path=orbitPath({eccentricity:.5,periapsis:1,periapsis_angle:.8});
 const radii=path.map(([x,y])=>Math.hypot(x,y));assert.ok(Math.abs(Math.min(...radii)-1)<1e-10);assert.ok(Math.abs(Math.max(...radii)-3)<1e-10);
 for(const e of [0,.99,1,1.5])for(const point of orbitPath({eccentricity:e,periapsis:.4,periapsis_angle:1}))assert.ok(point.every(Number.isFinite));
});
test('nearby massive neighbors dominate the nonstellar attraction reading',()=>{
 const bodies=[{id:0,mass:1,pos:{x:0,y:0}},{id:1,mass:3e-6,pos:{x:2,y:0}},{id:2,mass:.003,pos:{x:2.1,y:0}},{id:3,mass:3e-6,pos:{x:3,y:0}}];
 const source=strongestPerturber(bodies[1],bodies);assert.equal(source.body.id,2);assert.ok(source.ratio>1);assert.equal(strongestPerturber(bodies[0],bodies),null);
 assert.ok(fitZoom(bodies,390,400,.62)>2);
});
test('planet vertices carry complete style and light data without buffer overrun',()=>{
 const stream=new PlanetStream(32);stream.point(1,2,30,[1,.5,.2],2,1,[.3,.7,1,0],[1,0,.4],.2);assert.equal(stream.length,16);stream.point(0,0,2,[1,1,1],4,0);assert.equal(stream.length,32);assert.throws(()=>stream.point(0,0,2,[1,1,1],4,0),RangeError);
});
test('selecting the star has no osculating planetary path',()=>{assert.deepEqual(orbitPath(undefined),[]);assert.deepEqual(orbitPath(null),[]);});
