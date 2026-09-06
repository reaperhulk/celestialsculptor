import assert from 'node:assert/strict';
export function verifyStyleTokens(css){
 const defined=new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(match=>match[1]));
 for(const [,name,separator] of css.matchAll(/var\((--[\w-]+)\s*([,)])/g))if(separator!==',')assert.ok(defined.has(name),`Undefined CSS token: ${name}`);
}
