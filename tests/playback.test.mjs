import test from 'node:test';import assert from 'node:assert/strict';import {PLAYBACK_SPEEDS,orbitalWatchSpeed} from '../web/playback.js';
test('orbital watching selects readable time scales from supported worker speeds',()=>{
 assert.equal(orbitalWatchSpeed(.03),.0625);assert.equal(orbitalWatchSpeed(.5),.25);assert.equal(orbitalWatchSpeed(2),1);assert.equal(orbitalWatchSpeed(100),16);assert.equal(orbitalWatchSpeed(null),.25);
 for(const period of [.001,.1,.8,8,100])assert.ok(PLAYBACK_SPEEDS.includes(orbitalWatchSpeed(period)));
});
