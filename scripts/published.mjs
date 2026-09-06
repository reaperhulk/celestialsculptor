import assert from 'node:assert/strict';
import {digest} from './integrity.mjs';
export async function verifyPublished(root,expected,fetchAsset=fetch){
 assert.ok(root&&expected,'SITE_URL and EXPECTED_SHA are required');
 const url=new URL(root.endsWith('/')?root:root+'/');
 const get=async path=>{const response=await fetchAsset(new URL(path,url),{signal:AbortSignal.timeout(10000)});assert.ok(response.ok,`${path}: HTTP ${response.status}`);return response;};
 const info=await (await get(`build-info.json?revision=${expected}`)).json();
 assert.equal(info.revision,expected,'CDN has not reached the deployed revision');
 for(const path of ['index.html','app.js','worker.js','recipes.json','pkg/celestial_wasm_bg.wasm'])assert.ok(info.assets?.[path],`Missing manifest asset: ${path}`);
 const assets=Object.entries(info.assets);assert.ok(assets.length<=128,'Unexpected asset count');
 for(let i=0;i<assets.length;i+=4)await Promise.all(assets.slice(i,i+4).map(async([path,entry])=>{
  assert.ok(/^[a-zA-Z0-9_./-]+$/.test(path)&&!path.startsWith('/')&&!path.split('/').includes('..'),'Invalid asset path');
  const response=await get(path),bytes=new Uint8Array(await response.arrayBuffer());
  assert.equal(bytes.length,entry.bytes,`${path}: size mismatch`);assert.equal(digest(bytes),entry.sha256,`${path}: hash mismatch`);
  if(path.endsWith('.wasm')){assert.match(response.headers.get('content-type')||'',/application\/wasm/i);assert.deepEqual([...bytes.slice(0,4)],[0,97,115,109]);}
 }));
 return {url:String(url),assets:assets.length};
}
