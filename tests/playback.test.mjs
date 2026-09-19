import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYBACK_SPEEDS, orbitalWatchSpeed } from '../web/playback.js';
test('orbital watching selects readable time scales from supported worker speeds', () => {
  assert.equal(orbitalWatchSpeed(0.03), 0.0625);
  assert.equal(orbitalWatchSpeed(0.5), 0.25);
  assert.equal(orbitalWatchSpeed(2), 1);
  assert.equal(orbitalWatchSpeed(100), 16);
  assert.equal(orbitalWatchSpeed(null), 0.25);
  for (const period of [0.001, 0.1, 0.8, 8, 100])
    assert.ok(PLAYBACK_SPEEDS.includes(orbitalWatchSpeed(period)));
});
