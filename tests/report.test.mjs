import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticReport} from '../web/report.js';
import {parseArchive} from '../web/storage.js';
test('bug reports carry reproduction context and remain ordinary importable backups',()=>{
 const replay=JSON.stringify({version:1,config:{seed:7,mission:null,star_mass:1},commands:[],end_tick:0});
 const text=diagnosticReport(replay,{version:1,completed:[0]},{revision:'abc',saveVersion:1},{webgl:false});
 const report=JSON.parse(text);assert.equal(report.diagnostics.revision,'abc');assert.equal(report.diagnostics.environment.webgl,false);
 const restored=parseArchive(text);assert.equal(restored.replay,replay);assert.deepEqual(restored.profile.completed,[0]);
});
