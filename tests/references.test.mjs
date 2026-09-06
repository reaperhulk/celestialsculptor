import test from 'node:test';
import assert from 'node:assert/strict';
import {localReferences} from '../scripts/references.mjs';
test('static asset contracts include modules workers and fetched recipe data',()=>{
 const source=`import {x} from './x.js'; new Worker(new URL('./worker.js',import.meta.url)); fetch('./recipes.json'); import('./lazy.js'); fetch(remote); import x from 'package';`;
 assert.deepEqual(localReferences(source),['./x.js','./worker.js','./recipes.json','./lazy.js']);
});
