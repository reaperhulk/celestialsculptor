import test from 'node:test';
import assert from 'node:assert/strict';
import {CoalescedTask} from '../web/coalesce.js';
test('overlapping saves serialize and retain a request for the latest state',async()=>{
 let release,calls=0,active=0,max=0;
 const task=new CoalescedTask(async()=>{calls++;active++;max=Math.max(max,active);if(calls===1)await new Promise(resolve=>release=resolve);active--;});
 const first=task.run();for(let i=0;i<20;i++)assert.equal(task.run(),first);release();await first;
 assert.equal(calls,2);assert.equal(max,1);assert.equal(task.running,null);
 await task.run();assert.equal(calls,3);
});
test('a failed task releases the slot for a later recovery',async()=>{
 let fail=true;const task=new CoalescedTask(async()=>{if(fail)throw Error('offline');});
 await assert.rejects(task.run(),/offline/);fail=false;await task.run();assert.equal(task.running,null);
});
