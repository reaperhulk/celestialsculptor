import test from 'node:test';
import assert from 'node:assert/strict';
import {PreviewCache} from '../web/preview.js';
test('unchanged launch conditions reuse preview geometry across status updates',()=>{
 const cache=new PreviewCache(),draft={radius:1,angle:0,speed:1},path=cache.update(draft);assert.ok(path.length>10);
 for(let i=0;i<1000;i++)assert.equal(cache.update({...draft,kind:i%2?'ice':'rocky'}),path);
 assert.notEqual(cache.update({...draft,radius:2}),path);assert.deepEqual(cache.update(null),[]);
 assert.notEqual(cache.update(draft),path);
});
