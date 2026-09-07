import test from 'node:test';import assert from 'node:assert/strict';
import {orbitReading,distance,period,quantity} from '../web/readings.js';
import {launchPath} from '../web/geometry.js';
test('small satellites retain useful mass, period, frame and distance precision',()=>{
 const body={id:2,kind:'rocky',mass:.003*3.003e-6,pos:{x:3,y:.05},vel:{x:-1,y:1}},host={id:1,pos:{x:3,y:0},vel:{x:0,y:1}};
 const text=orbitReading(body,{distance:.05,calm:true,bound:true,habitable:false,eccentricity:.000006,periapsis:.05,apoapsis:.05,period_years:.2},host);
 assert.match(text,/0.003 Earth masses/);assert.match(text,/Calm orbit/);assert.match(text,/Counterclockwise around World 1/);assert.match(text,/days/);assert.match(distance(.001),/km/);assert.equal(period(null),'no return');assert.equal(quantity(NaN),'—');
});
test('retrograde previews travel along the same orbit in reverse',()=>{
 const a=launchPath(1,0,1),b=launchPath(1,0,-1);assert.equal(a.length,b.length);
 for(let i=0;i<a.length;i++){assert.equal(a[i][0],b[i][0]);assert.ok(Math.abs(a[i][1]+b[i][1])<1e-12);}
});
test('axial spin readings distinguish its direction from reversed orbital motion',async()=>{
 const {spinReading,spinRate}=await import('../web/readings.js');const host={pos:{x:0,y:0},vel:{x:0,y:0}},body={mass:1,radius:1,pos:{x:1,y:0},vel:{x:0,y:-1},spin:.4*2*Math.PI};assert.match(spinReading(body,host),/opposite sense/);body.spin*=-1;assert.match(spinReading(body,host),/same sense/);body.spin=0;assert.equal(spinReading(body,host),'No axial rotation.');assert.equal(spinRate('2',-1),-4*Math.PI);for(const x of ['',-1,1001,Infinity])assert.throws(()=>spinRate(x,1));
});
