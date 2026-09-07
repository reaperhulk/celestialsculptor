import test from 'node:test';import assert from 'node:assert/strict';import {verifyDomReferences} from '../scripts/dom-contracts.mjs';
test('DOM gates include separate controllers and direct lookups with either quote style',()=>{
 const html='<label for="control">Read</label><button id="control"></button>';assert.equal(verifyDomReferences(html,{'app.js':"$('control')",'guide.js':'this.$("control")'}).modules,2);
 for(const source of ["this.$('missing')",'this.$("missing")',"document.getElementById('missing')"]){assert.throws(()=>verifyDomReferences(html,{'guide.js':source}),/guide.js: missing DOM element/);}
 assert.throws(()=>verifyDomReferences('<label for="absent">Read</label>',{}),/accessible label/);
});
