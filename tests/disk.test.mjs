import test from 'node:test';
import assert from 'node:assert/strict';
import {diskCommand,diskIssue} from '../web/disk.js';
test('disk guidance accounts for both radial edges and exact requested capacity',()=>{
 const fields={radius:'2.5',spread:'1',count:'24',disorder:'25'},command=diskCommand(fields);
 assert.equal(command.disorder,.25);assert.throws(()=>diskCommand({...fields,radius:'.5',spread:'1'}),/entire disk/);assert.throws(()=>diskCommand({...fields,spread:''}),/Fill/);
 const status={remaining:6,actions_remaining:1,available_slots:24,tools:[{kind:'dust',unlocked:true,cost:.25}]};assert.equal(diskIssue(command,status),'');
 assert.match(diskIssue(command,{...status,available_slots:23}),/23/);assert.match(diskIssue(command,{...status,remaining:5.9}),/6 matter/);
});
