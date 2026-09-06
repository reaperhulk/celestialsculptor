import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSeed,parseLaunchFields} from '../web/conditions.js';
test('experiment seed preserves the full unsigned Rust range',()=>{
 assert.equal(parseSeed('0'),0);assert.equal(parseSeed('4294967295'),4294967295);
 for(const value of ['',-1,0.5,'NaN','Infinity','4294967296'])assert.throws(()=>parseSeed(value));
});

test('launch fields reject missing and nonfinite values instead of previewing a stellar impact',()=>{
 const fields={kind:'rocky',radius:'1',speed:'100',angle:'90'};
 assert.deepEqual(parseLaunchFields(fields),{kind:'rocky',radius:1,speed:1,angle:Math.PI/2});
 for(const [key,value] of [['radius',''],['speed',''],['angle',''],['radius',0],['radius',7],['speed',221],['angle',Infinity],['kind','star']])assert.throws(()=>parseLaunchFields({...fields,[key]:value}));
});
