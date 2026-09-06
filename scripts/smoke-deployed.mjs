import assert from 'node:assert/strict';
import {setTimeout} from 'node:timers/promises';
const root=process.env.SITE_URL;
assert.ok(root,'SITE_URL is required');
let last;
for(let attempt=0;attempt<10;attempt++){
 try{
  const url=new URL(root.endsWith('/')?root:root+'/');
  const info=await fetch(new URL(`build-info.json?revision=${process.env.EXPECTED_SHA}`,url),{signal:AbortSignal.timeout(10000)});
  assert.ok(info.ok,'Build metadata is unavailable');
  assert.equal((await info.json()).revision,process.env.EXPECTED_SHA,'CDN has not reached the deployed revision');
  const html=await fetch(url,{signal:AbortSignal.timeout(10000)});assert.ok(html.ok);
  assert.match(await html.text(),/Celestial Sculptor/);
  for(const path of ['app.js','worker.js','style.css','pkg/celestial_wasm.js','pkg/celestial_wasm_bg.wasm']){
   const response=await fetch(new URL(path,url),{signal:AbortSignal.timeout(10000)});assert.ok(response.ok,`${path}: ${response.status}`);
   if(path.endsWith('.wasm'))assert.deepEqual([...new Uint8Array(await response.arrayBuffer()).slice(0,4)],[0,97,115,109]);
  }
  console.log(`Published revision ${process.env.EXPECTED_SHA} verified at ${url}`);process.exit(0);
 }catch(error){last=error;if(attempt<9)await setTimeout(3000);}
}
throw last;
