import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyStyleTokens} from '../scripts/style-contracts.mjs';
test('style tokens must exist unless the declaration provides a fallback',()=>{
 verifyStyleTokens(':root{--amber:#efca88}button{color:var(--amber)}');verifyStyleTokens('p{color:var(--optional,white)}');
 assert.throws(()=>verifyStyleTokens('strong{color:var(--gold)}'),/Undefined CSS token: --gold/);
});
