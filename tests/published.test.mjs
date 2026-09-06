import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyPublished} from '../scripts/published.mjs';
const info=JSON.parse(await readFile('dist/build-info.json','utf8'));
function fetcher({stale=false,badMime=false,missing=false}={}){return async url=>{
 const path=url.pathname.replace('/celestialsculptor/','');
 if(path==='build-info.json')return Response.json(info);
 if(missing&&path==='worker.js')return new Response('',{status:404});
 const bytes=await readFile('dist/'+path);
 if(stale&&path==='app.js')bytes[0]^=1;
 return new Response(bytes,{headers:{'content-type':path.endsWith('.wasm')&&!badMime?'application/wasm':'text/plain'}});
};}
test('published verification checks every exact asset and the WASM serving type',async()=>{
 const result=await verifyPublished('https://example.test/celestialsculptor/',info.revision,fetcher());assert.equal(result.assets,Object.keys(info.assets).length);
 await assert.rejects(verifyPublished('https://example.test/celestialsculptor/','stale',fetcher()),/deployed revision/);
 await assert.rejects(verifyPublished('https://example.test/celestialsculptor/',info.revision,fetcher({stale:true})),/hash mismatch/);
 await assert.rejects(verifyPublished('https://example.test/celestialsculptor/',info.revision,fetcher({missing:true})),/HTTP 404/);
 await assert.rejects(verifyPublished('https://example.test/celestialsculptor/',info.revision,fetcher({badMime:true})));
});
