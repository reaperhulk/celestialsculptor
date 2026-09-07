import test from 'node:test';import assert from 'node:assert/strict';import {workDelay} from '../web/work-schedule.js';
test('expensive worker turns do not add an idle delay when another tick is ready',()=>{assert.equal(workDelay(true,.5,1,10),0);assert.equal(workDelay(true,2,1,0),0);assert.equal(workDelay(true,0,16,1),0);});
test('paused and ahead-of-schedule workers sleep instead of spinning',()=>{assert.equal(workDelay(false,128,16,100),16);assert.equal(workDelay(true,0,1,0),10);assert.equal(workDelay(true,0,.25,0),16);});
