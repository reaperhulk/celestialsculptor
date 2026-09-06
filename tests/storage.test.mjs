import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReplay,saveExperiment,savedExperiments,SAVE_KEY,BACKUP_KEY,archiveExperiment,parseArchive} from '../web/storage.js';
const replay=JSON.stringify({version:1,config:{seed:42,mission:null,star_mass:1},commands:[],end_tick:0});
function memory(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};}
test('autosave preserves a previous experiment and recovers corrupt primary',()=>{
 const s=memory(),next=replay.replace('"end_tick":0','"end_tick":8');
 assert.ok(saveExperiment(s,replay));assert.ok(saveExperiment(s,next));assert.equal(s.getItem(BACKUP_KEY),replay);
 s.setItem(SAVE_KEY,'broken');assert.deepEqual(savedExperiments(s),[replay]);
});
test('invalid and oversized imports fail before simulation work',()=>{
 for(const text of ['{','{}','x'.repeat(512001),replay.replace('"end_tick":0','"end_tick":307201')])assert.throws(()=>parseReplay(text));
 assert.equal(saveExperiment(null,replay),false);assert.deepEqual(savedExperiments(null),[]);
});
test('portable backup includes normalized progress and preserves raw replay compatibility',()=>{
 const archive=parseArchive(archiveExperiment(replay,{version:1,completed:[0,1,1]}));
 assert.deepEqual(archive.profile.completed,[0,1]);assert.deepEqual(JSON.parse(archive.replay),JSON.parse(replay));
 assert.equal(parseArchive(replay).profile,null);
 assert.throws(()=>parseArchive('{"format":"celestial-archive","version":99}'));
});
