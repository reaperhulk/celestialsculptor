import test from 'node:test';
import assert from 'node:assert/strict';
import {goalMessage} from '../web/guidance.js';
test('sandbox guidance never asks the player to meet a nonexistent goal',()=>{
 assert.match(goalMessage({},null,1),/starting point/);assert.match(goalMessage({},null,4),/No goal/);
 assert.match(goalMessage({},0,1),/first world/);assert.match(goalMessage({condition:true},0,2),/settle/);
 assert.match(goalMessage({completed:true},0,2),/Discovery made/);assert.match(goalMessage({completed:true,exhausted:true},0,2),/limit/);
});
