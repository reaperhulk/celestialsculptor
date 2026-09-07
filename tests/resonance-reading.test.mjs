import test from 'node:test';import assert from 'node:assert/strict';import {resonanceText} from '../web/resonance-reading.js';
test('resonance evidence reports duration, eccentricity and reversals without calling a ratio a capture',()=>{
 const r={inner:1,outer:2,p:2,q:1,ratio:2,observed_years:2,turns:0,span:.01,librating:false};const state={bodies:[{id:1,parent:null}],orbits:[[1,{eccentricity:0}],[2,{period_years:2}]],moon_orbits:[],resonances:[r]};let text=resonanceText(state);assert.match(text,/7 more/);assert.match(text,/eccentricity/);assert.match(text,/two angle reversals/);assert.match(text,/Clockwise/);assert.doesNotMatch(text,/evidence detected/);
 r.librating=true;assert.match(resonanceText(state),/Libration evidence detected/);
});
