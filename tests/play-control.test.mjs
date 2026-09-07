import test from 'node:test';
import assert from 'node:assert/strict';
import {PlayControl} from '../web/play-control.js';
test('rapid run and pause preserve the latest intent despite delayed snapshots and acknowledgements',async()=>{
 const requests=[],labels=[],control=new PlayControl((type,data)=>new Promise((resolve,reject)=>requests.push({type,...data,resolve,reject})),value=>labels.push(value));
 control.observe({playing:false});const run=control.toggle(),pause=control.toggle();assert.deepEqual(requests.map(r=>r.value),[true,false]);
 control.observe({playing:true});requests[0].resolve({playing:true});await run;assert.equal(control.playing,false);assert.equal(labels.at(-1),false);
 control.observe({playing:false});requests[1].resolve({playing:false});await pause;assert.equal(control.pending,0);assert.equal(control.playing,false);
 const resume=control.toggle();requests[2].reject(new Error('failed'));await assert.rejects(resume);assert.equal(control.playing,false);
});

test('pause supersedes a run still preserving a reviewed timeline',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),sent=[];let control;
 control=new PlayControl(async(type,data,current)=>{if(data.value){await gate;if(!current())return {playing:control.playing};}sent.push(data.value);return {playing:data.value};},()=>{});
 control.observe({playing:false});const run=control.toggle();assert.equal(control.playing,true);await control.toggle();release();await run;assert.deepEqual(sent,[false]);assert.equal(control.playing,false);
});
test('pending pause remains visible until its own worker acknowledgement',async()=>{
 const requests=[],updates=[],control=new PlayControl((type,data)=>new Promise(resolve=>requests.push(resolve)),(playing,pending=false)=>updates.push({playing,pending}));
 control.observe({playing:true});const pause=control.set(false);assert.deepEqual(updates.at(-1),{playing:false,pending:true});
 control.observe({playing:true});assert.deepEqual(updates.at(-1),{playing:false,pending:true});
 control.observe({playing:false});assert.deepEqual(updates.at(-1),{playing:false,pending:true});
 requests[0]({playing:false});await pause;assert.deepEqual(updates.at(-1),{playing:false,pending:false});
});
