import test from 'node:test';import assert from 'node:assert/strict';
import {award,normalizeProfile} from '../web/progression.js';import {HINTS} from '../web/challenges.js';
test('mastery remains tied to completed challenges and survives later discoveries',()=>{
 const initial={version:1,completed:[0,1,2,3]};const earned=award(initial,4,['economy','restraint']);assert.deepEqual(earned.mastery,['4:economy','4:restraint']);assert.deepEqual(award(earned,5).mastery,earned.mastery);
 assert.equal(normalizeProfile({...initial,mastery:['4:economy','0:fake']}).mastery,undefined);assert.equal(HINTS[8].length,3);
});
