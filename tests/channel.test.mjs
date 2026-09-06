import test from 'node:test';
import assert from 'node:assert/strict';
import {RequestChannel} from '../web/channel.js';
test('worker requests match out of order responses and ignore duplicate replies',async()=>{
 const sent=[],channel=new RequestChannel(message=>sent.push(message));
 const a=channel.send('export'),b=channel.send('snapshot');
 channel.receive({...sent[1],value:2});channel.receive({...sent[0],value:1});
 assert.equal((await a).value,1);assert.equal((await b).value,2);
 assert.equal(channel.receive(sent[0]),false);assert.equal(channel.pending.size,0);
});
test('worker death releases all requests and rejects future work immediately',async()=>{
 const channel=new RequestChannel(()=>{}),a=channel.send('step'),b=channel.send('export');
 const rejected=Promise.all([assert.rejects(a,/stopped/),assert.rejects(b,/stopped/)]);
 channel.close('Worker stopped');await rejected;await assert.rejects(channel.send('play'),/stopped/);assert.equal(channel.pending.size,0);
});
test('post failures and missing responses release their request slots',async()=>{
 const broken=new RequestChannel(()=>{throw Error('clone failed');});await assert.rejects(broken.send('reset'),/clone failed/);
 const silent=new RequestChannel(()=>{},5);await assert.rejects(silent.send('reset'),/did not respond/);assert.equal(silent.pending.size,0);
});
