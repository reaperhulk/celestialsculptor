import test from 'node:test';
import assert from 'node:assert/strict';
import {readViewSettings,writeViewSettings} from '../web/preferences.js';
test('view preferences preserve valid fields and respect system motion defaults',()=>{
 assert.equal(readViewSettings(null,true).reduceMotion,true);
 const storage={getItem:()=>JSON.stringify({version:1,reduceMotion:false,showGrid:false,maxDpr:99,showTrails:'no'})};
 const settings=readViewSettings(storage,true);assert.equal(settings.reduceMotion,false);assert.equal(settings.showGrid,false);assert.equal(settings.maxDpr,2);assert.equal(settings.showTrails,true);
 let saved;assert.ok(writeViewSettings({setItem:(_,text)=>saved=text},{...settings,maxDpr:1}));assert.equal(readViewSettings({getItem:()=>saved}).maxDpr,1);
 assert.equal(writeViewSettings(null,settings),false);
});

test('volume preferences reject malformed gains without enabling audio',()=>{
 for(const volume of [-1,2,'1',null])assert.equal(readViewSettings({getItem:()=>JSON.stringify({version:1,volume})}).volume,.7);
 assert.equal(readViewSettings({getItem:()=>JSON.stringify({version:1,volume:0})}).volume,0);
});
