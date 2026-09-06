import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export function auditIterations(text,minimum=100){
 const entries=[...text.matchAll(/^### (\d+) — .+$/gm)];
 assert.ok(entries.length>=minimum,`Expected at least ${minimum} completed iterations, found ${entries.length}`);
 entries.forEach((entry,index)=>{
  assert.equal(Number(entry[1]),index+1,'Iteration numbers must be unique and continuous');
  const section=text.slice(entry.index,entries[index+1]?.index??text.length);
  for(const field of ['Review needs','Implemented','Validation'])assert.match(section,new RegExp(`^${field}:\\s*\\S`,'m'),`Iteration ${entry[1]} lacks ${field}`);
 });
 return entries.length;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(`Audited ${auditIterations(await readFile('DESIGN.md','utf8'))} completed review / implementation / verification records.`);
