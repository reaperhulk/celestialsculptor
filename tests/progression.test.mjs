import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProfile,canPlay,nextMission,award,readProfile,writeProfile} from '../web/progression.js';
test('all ten missions unlock in order with idempotent awards',()=>{
 let p=normalizeProfile(null);
 for(let i=0;i<10;i++){
   assert.equal(nextMission(p),i);assert.ok(canPlay(p,i));
   if(i<9)assert.equal(canPlay(p,i+1),false);
   p=award(p,i);assert.deepEqual(award(p,i),p);
 }
 assert.equal(p.completed.length,10);assert.equal(canPlay(p,10),false);
});
test('corrupt and unavailable storage do not prevent play',()=>{
 assert.deepEqual(readProfile({getItem(){throw Error('denied');}}),{version:1,completed:[]});
 assert.equal(writeProfile({setItem(){throw Error('quota');}},{}),false);
 assert.deepEqual(normalizeProfile({version:1,completed:[9,9,-1,'0',null]}),{version:1,completed:[]});
 assert.equal(canPlay(normalizeProfile({version:1,completed:[9]}),1),false);
});
test('corrupt completion gaps retain only a valid campaign prefix',()=>{
 for(const [input,expected] of [[[0,2],[0]],[[0,1,3],[0,1]],[[9,0,1,1],[0,1]],[[2,1,0],[0,1,2]]]){
  assert.deepEqual(normalizeProfile({version:1,completed:input}).completed,expected);
 }
 assert.deepEqual(readProfile({getItem:()=> ' '.repeat(4097)}).completed,[]);
});
