import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../playwright.config.js';
test('Chromium launch settings cannot leak through global defaults into other engines',()=>{
 assert.equal(config.use.channel,undefined);assert.equal(config.use.launchOptions,undefined);
 const engines=new Set();for(const project of config.projects){engines.add(project.use.browserName);if(project.use.browserName==='chromium')assert.equal(project.use.channel,'chromium');else{assert.equal(project.use.channel,undefined);assert.equal(project.use.launchOptions,undefined);}}
 assert.deepEqual([...engines].sort(),['chromium','firefox','webkit']);
});
