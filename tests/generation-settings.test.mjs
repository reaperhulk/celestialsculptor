import test from 'node:test';import assert from 'node:assert/strict';import {readGeneration,validSettings} from '../web/generation.js';
test('repeat-generator settings are bounded and reject unrelated commands or invalid conditions',()=>{
 const value={version:4,config:{seed:719,mission:null,star_mass:1},command:{type:'generate_system',style:'moons',count:9,chaos:.6}};
 const read=v=>readGeneration({getItem:()=>JSON.stringify(v)});assert.deepEqual(read(value),value);assert.equal(read({...value,command:{...value.command,type:'spin'}}),null);assert.equal(read({...value,config:{...value.config,seed:-1}}),null);assert.equal(read({...value,command:{...value.command,count:64}}),null);assert.equal(validSettings({style:'unknown',count:12,chaos:0}),false);
});
