import test from 'node:test';import assert from 'node:assert/strict';
import {series,chartGeometry} from '../web/observatory.js';import {preserveOriginal,entry} from '../web/notebook.js';
test('orbital graphs keep true time spacing and gaps for removed or transferred bodies',()=>{
 const history={frames:[{tick:0,bodies:[{id:1,axis:1,parent:null}],resonances:[]},{tick:64,bodies:[],resonances:[]},{tick:128,bodies:[{id:1,axis:.1,parent:2}],resonances:[]},{tick:512,bodies:[{id:1,axis:.2,parent:2}],resonances:[]}]};
 const data=series(history,1,'axis'),chart=chartGeometry(data,'axis');assert.equal(chart.paths.length,2);assert.equal(chart.first,0);assert.equal(chart.last,512);assert.equal(chart.latest,.2);assert.equal(chartGeometry([data[0]],'axis'),null);assert.equal(data[1].value,null);
 const angles=chartGeometry([{tick:0,value:179},{tick:64,value:-179},{tick:128,value:-160}],'angle');assert.equal(angles.paths.length,2);
});
test('automatic branching saves a durable original once and fails before a destructive change when storage is full',()=>{
 const replay=JSON.stringify({version:4,config:{seed:42,mission:null,star_mass:1},commands:[],end_tick:0}),state={status:{years:0},bodies:[]};let stored;
 const storage={setItem:(_,value)=>stored=value};const entries=preserveOriginal(storage,[],replay,state);assert.equal(entries.length,1);assert.ok(stored.includes('Original'));assert.equal(preserveOriginal(storage,entries,replay,state),entries);
 assert.throws(()=>preserveOriginal(null,[],replay,state),/storage/);
 const full=Array.from({length:12},(_,i)=>entry('x',replay+' ',state,String(i)));assert.throws(()=>preserveOriginal(storage,full,replay,state),/12 experiments/);
});
