import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSeed,parseLaunchFields,placementIssue} from '../web/conditions.js';
test('experiment seed preserves the full unsigned Rust range',()=>{
 assert.equal(parseSeed('0'),0);assert.equal(parseSeed('4294967295'),4294967295);
 for(const value of ['',-1,0.5,'NaN','Infinity','4294967296'])assert.throws(()=>parseSeed(value));
});

test('launch fields reject missing and nonfinite values instead of previewing a stellar impact',()=>{
 const fields={kind:'rocky',radius:'1',speed:'100',angle:'90'};
 assert.deepEqual(parseLaunchFields(fields),{kind:'rocky',radius:1,speed:1,angle:Math.PI/2});
 for(const [key,value] of [['radius',''],['speed',''],['angle',''],['radius',0],['radius',7],['speed',221],['angle',Infinity],['kind','star']])assert.throws(()=>parseLaunchFields({...fields,[key]:value}));
});

test('placement guidance follows Rust availability and explains exhausted resources',()=>{
 const status={available_slots:4,actions_remaining:9,tools:[{kind:'rocky',cost:1,unlocked:true,affordable:true}]};
 assert.equal(placementIssue(status,'rocky'),'');assert.match(placementIssue(status,'giant'),/unlocks/);
 assert.match(placementIssue({...status,available_slots:0},'rocky'),/full/);
 assert.match(placementIssue({...status,actions_remaining:0},'rocky'),/edit limit/);
 assert.match(placementIssue({...status,tools:[{...status.tools[0],affordable:false}]},'rocky'),/1 matter/);
});
test('custom masses use their actual cost and range instead of the kind default',()=>{
 const status={remaining:.15,available_slots:3,actions_remaining:7,tools:[{kind:'rocky',cost:1,min_mass:.1,max_mass:10,unlocked:true,affordable:false}]};
 assert.equal(placementIssue(status,'rocky',.1),'');assert.match(placementIssue(status,'rocky',1),/1 matter/);assert.match(placementIssue(status,'rocky',.05),/range/);assert.match(placementIssue(status,'rocky'),/1 matter/);
});
