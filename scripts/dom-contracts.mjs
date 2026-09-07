import assert from 'node:assert/strict';
export function verifyDomReferences(html,modules){
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,'Duplicate DOM identifiers');
 for(const [,refs] of html.matchAll(/(?:aria-labelledby|aria-describedby|for)="([^"]+)"/g))for(const id of refs.split(/\s+/))assert.ok(ids.includes(id),`Broken accessible label reference: ${id}`);
 for(const [name,source] of Object.entries(modules)){
  for(const [, ,id] of source.matchAll(/\$\((['"])([^'"]+)\1\)/g))assert.ok(ids.includes(id),`${name}: missing DOM element ${id}`);
  for(const [, ,id] of source.matchAll(/getElementById\((['"])([^'"]+)\1\)/g))assert.ok(ids.includes(id),`${name}: missing DOM element ${id}`);
 }
 return {elements:ids.length,modules:Object.keys(modules).length};
}
