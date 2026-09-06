import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSeed} from '../web/conditions.js';
test('experiment seed preserves the full unsigned Rust range',()=>{
 assert.equal(parseSeed('0'),0);assert.equal(parseSeed('4294967295'),4294967295);
 for(const value of ['',-1,0.5,'NaN','Infinity','4294967296'])assert.throws(()=>parseSeed(value));
});
