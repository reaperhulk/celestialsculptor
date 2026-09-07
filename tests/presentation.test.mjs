import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldPresent} from '../web/presentation.js';
const running={playing:true,status:{completed:false,exhausted:false},bodies:[{},{}]};
test('terminal state bypasses UI throttling when the worker stops publishing',()=>{
 assert.equal(shouldPresent(running,{...running,playing:false,status:{completed:true,exhausted:false}},100,110),true);
 assert.equal(shouldPresent(running,{...running,status:{completed:false,exhausted:true}},100,110),true);
});
test('ordinary progress is throttled while actions and pause stay immediate',()=>{
 assert.equal(shouldPresent(running,running,100,110),false);
 assert.equal(shouldPresent(running,running,100,181),true);
 assert.equal(shouldPresent(running,{...running,id:2},100,110),true);
 assert.equal(shouldPresent(running,{...running,playing:false},100,110),true);
 assert.equal(shouldPresent({...running,playing:false,busy:'compare'},{...running,playing:false,busy:null},100,110),true);
});
