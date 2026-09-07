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
test('pair histories are independent of an unrelated body changing its host',()=>{
 const frames=[null,3,null].map((parent,i)=>({tick:i*64,bodies:[{id:8,parent}],resonances:[{inner:1,outer:2,ratio:2+i*.01,angle:.2+i*.01}]}));
 for(const metric of ['ratio','angle'])assert.equal(chartGeometry(series({frames},8,metric,'1:2'),metric).paths.length,1);
});
test('encounter controls remain stable as time advances but refresh when availability or details change',async()=>{
 const {encounterSignature}=await import('../web/observatory.js');const state={generation:1,timeline_end:10},events=[{id:1,tick:5,text:'Impact',impact:{mass:1}}];assert.equal(encounterSignature(state,events),encounterSignature({...state,timeline_end:100},events));assert.notEqual(encounterSignature({...state,timeline_end:5},events),encounterSignature(state,events));assert.notEqual(encounterSignature(state,events),encounterSignature(state,[{...events[0],impact:{mass:2}}]));
});
