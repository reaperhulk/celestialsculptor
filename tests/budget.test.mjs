import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyAssetBudget} from '../scripts/budget.mjs';
test('payload gates distinguish WASM JavaScript and complete release growth',()=>{
 const budget={maxWasmBytes:50,maxJavaScriptBytes:20,maxTotalBytes:80};
 assert.deepEqual(verifyAssetBudget({'sim.wasm':{bytes:50},'app.js':{bytes:20}},budget),{total:70,wasm:50,javascript:20});
 assert.throws(()=>verifyAssetBudget({'sim.wasm':{bytes:51}},budget),/WASM/);
 assert.throws(()=>verifyAssetBudget({'app.js':{bytes:21}},budget),/JavaScript/);
 assert.throws(()=>verifyAssetBudget({'data.json':{bytes:81}},budget),/Total/);
});
