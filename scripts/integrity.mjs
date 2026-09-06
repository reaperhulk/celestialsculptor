import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function assetManifest(root){
 const assets={};
 for(const path of (await readdir(root,{recursive:true})).sort()){
  if(!/\.(html|js|css|json|wasm|svg|png)$/.test(path)||path==='build-info.json')continue;
  const bytes=await readFile(`${root}/${path}`);assets[path]={sha256:digest(bytes),bytes:bytes.length};
 }
 return assets;
}
