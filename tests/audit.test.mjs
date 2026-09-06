import test from 'node:test';
import assert from 'node:assert/strict';
import {auditIterations} from '../scripts/audit-design.mjs';
const entry=n=>`### ${n} — Improvement\nReview needs: A concrete issue.\nImplemented: Its resolution.\nValidation: Relevant evidence.\n\n`;
test('iteration audit rejects missing duplicated and unverified records',()=>{
 assert.equal(auditIterations(entry(1)+entry(2),2),2);
 assert.throws(()=>auditIterations(entry(1),2),/Expected at least/);
 assert.throws(()=>auditIterations(entry(1)+entry(1),2),/unique and continuous/);
 assert.throws(()=>auditIterations(entry(1)+entry(3),2),/unique and continuous/);
 assert.throws(()=>auditIterations(entry(1).replace('Validation: Relevant evidence.',''),1),/lacks Validation/);
});
