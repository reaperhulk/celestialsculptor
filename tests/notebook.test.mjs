import test from 'node:test';import assert from 'node:assert/strict';import {entry,summarize,readNotebook,writeNotebook,compare} from '../web/notebook.js';
const replay=JSON.stringify({version:3,config:{seed:42,mission:null,star_mass:1},commands:[],end_tick:0});
const state={status:{years:2,planets:2,calm:1,formed:1,moons:0,habitable:1,collisions:2,ejections:0},bodies:[{id:0,mass:1},{id:1,mass:3.003e-6},{id:2,mass:6.006e-6}]};
test('named checkpoints preserve replays and compare physical outcomes',()=>{const a=entry('Original',replay,state,'a'),b=entry('Variation',replay,{...state,status:{...state.status,moons:1}},'b');let value;const storage={setItem:(_,text)=>value=text,getItem:()=>value};writeNotebook(storage,[a,b]);assert.deepEqual(readNotebook(storage),[a,b]);assert.equal(summarize(state).mass,3);assert.equal(compare(a,b).find(x=>x.key==='moons').change,1);assert.equal(JSON.parse(readNotebook(storage)[0].replay).config.seed,42);});
test('corrupt notebooks, quota failures and unbounded collections are handled',()=>{assert.deepEqual(readNotebook({getItem:()=>'{'}),[]);assert.deepEqual(readNotebook(null),[]);assert.throws(()=>writeNotebook(null,[]),/Device storage/);assert.throws(()=>writeNotebook({setItem(){}},Array.from({length:13},(_,i)=>entry('x',replay,state,String(i)))),/12 experiments/);});
test('older notebook entries gain impact counters without losing their original replay',()=>{
 const old=entry('Legacy',replay,state,'old');delete old.summary.grazes;delete old.summary.disruptions;
 const restored=readNotebook({getItem:()=>JSON.stringify({version:1,entries:[old]})});assert.equal(restored.length,1);assert.equal(restored[0].replay,replay);assert.equal(restored[0].summary.grazes,0);
 const variant=entry('Impact',replay,{...state,status:{...state.status,grazes:2,disruptions:1}},'new');assert.equal(compare(restored[0],variant).find(row=>row.key==='disruptions').change,1);
});
