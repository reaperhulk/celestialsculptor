import test from 'node:test';import assert from 'node:assert/strict';import {experimentDifferences} from '../web/comparison.js';
test('comparison explanations exclude future edits and name changed conditions',()=>{
 const a={version:7,config:{seed:42,star_mass:1,mission:null},commands:[]},b={...a,commands:[{tick:64,command:{type:'nudge',id:1,radial:.1,tangential:0}}]};assert.deepEqual(experimentDifferences(a,b,32),[]);assert.match(experimentDifferences(a,b,64)[0],/Orbital burn/);assert.match(experimentDifferences(a,{...a,config:{...a.config,star_mass:1.5}},0)[0],/star mass: 1 → 1.5/);
});
