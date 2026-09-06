import assert from 'node:assert/strict';
export function verifyAssetBudget(assets,budget){
 const total=Object.values(assets).reduce((sum,asset)=>sum+asset.bytes,0);
 const wasm=Object.entries(assets).filter(([path])=>path.endsWith('.wasm')).reduce((sum,[,asset])=>sum+asset.bytes,0);
 const javascript=Object.entries(assets).filter(([path])=>path.endsWith('.js')).reduce((sum,[,asset])=>sum+asset.bytes,0);
 assert.ok(wasm<=budget.maxWasmBytes,`WASM payload ${wasm} exceeds ${budget.maxWasmBytes} bytes`);
 assert.ok(javascript<=budget.maxJavaScriptBytes,`JavaScript payload ${javascript} exceeds ${budget.maxJavaScriptBytes} bytes`);
 assert.ok(total<=budget.maxTotalBytes,`Total payload ${total} exceeds ${budget.maxTotalBytes} bytes`);
 return {total,wasm,javascript};
}
