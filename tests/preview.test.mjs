import test from 'node:test';
import assert from 'node:assert/strict';
import {PreviewCache} from '../web/preview.js';
test('unchanged launch conditions reuse preview geometry across status updates',()=>{
 const cache=new PreviewCache(),draft={radius:1,angle:0,speed:1},path=cache.update(draft);assert.ok(path.length>10);
 for(let i=0;i<1000;i++)assert.equal(cache.update({...draft,kind:i%2?'ice':'rocky'}),path);
 assert.notEqual(cache.update({...draft,radius:2}),path);assert.deepEqual(cache.update(null),[]);
 assert.notEqual(cache.update(draft),path);
});

test('launch sites outside the usable canvas are revealed without disturbing visible sites',async()=>{
 const {draftOutsideView}=await import('../web/preview.js');
 assert.equal(draftOutsideView([195,180],390,360),false);
 for(const p of [[-20,180],[400,180],[195,-1],[195,360]])assert.equal(draftOutsideView(p,390,360),true);
});
