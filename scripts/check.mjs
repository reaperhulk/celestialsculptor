import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import {assetManifest} from './integrity.mjs';
import {localReferences} from './references.mjs';
import {verifyToolchainContracts} from './contracts.mjs';
import {verifyStyleTokens} from './style-contracts.mjs';
import {verifyAssetBudget} from './budget.mjs';
import {resolve,dirname} from 'node:path';
for(const name of await readdir('web'))if(name.endsWith('.js')){
  const r=spawnSync(process.execPath,['--check',`web/${name}`],{stdio:'inherit'});
  assert.equal(r.status,0,`Syntax: ${name}`);
}
const html=await readFile('web/index.html','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(ids.length,new Set(ids).size,'Duplicate DOM identifiers');
for(const [,refs] of html.matchAll(/(?:aria-labelledby|aria-describedby|for)="([^"]+)"/g))for(const id of refs.split(/\s+/))assert.ok(ids.includes(id),`Broken accessible label reference: ${id}`);
const app=await readFile('web/app.js','utf8');
for(const [,id] of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(id),`Missing DOM element: ${id}`);
for(const [,path] of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g))await readFile(`dist/${path}`);
assert.ok((await readFile('dist/pkg/celestial_wasm_bg.wasm')).length>8,'WASM artifact is missing');
console.log('Web modules, DOM contracts, and built entrypoints verified.');

const build=JSON.parse(await readFile('dist/build-info.json','utf8'));
assert.deepEqual(await assetManifest('dist'),build.assets,'Built assets differ from their integrity manifest');

for(const name of await readdir('web')){
 const source=await readFile(`web/${name}`);assert.deepEqual(await readFile(`dist/${name}`),source,`Stale build: ${name}; run npm run build`);
 if(name.endsWith('.js'))for(const reference of localReferences(source.toString())){
  const target=resolve(dirname(`dist/${name}`),reference);assert.ok(target.startsWith(resolve('dist')+'/'),`Asset leaves build: ${reference}`);await readFile(target);
 }
}

await verifyToolchainContracts();

verifyStyleTokens(await readFile('web/style.css','utf8'));

console.log('Uncompressed asset bytes:',verifyAssetBudget(build.assets,JSON.parse(await readFile('performance-budget.json','utf8'))));
