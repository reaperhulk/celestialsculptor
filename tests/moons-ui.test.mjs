import test from 'node:test';import assert from 'node:assert/strict';import {moonRegion} from '../web/moons.js';
test('moon guidance adapts to mass and rejects an unbound host or impossible Hill region',()=>{
 const giant={mass:318*3.003e-6,radius:.002*Math.cbrt(318)},orbit={bound:true,periapsis:3};const small=moonRegion(giant,orbit,1,.01),large=moonRegion(giant,orbit,1,1);assert.ok(small.available&&large.available);assert.ok(large.min>small.min);assert.equal(large.max,small.max);assert.equal(moonRegion(giant,{...orbit,bound:false},1,.01).available,false);assert.equal(moonRegion(giant,{...orbit,periapsis:.1},1,.01).available,false);assert.equal(moonRegion(giant,orbit,1,NaN).available,false);
});
