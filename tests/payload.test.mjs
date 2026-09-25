import test from 'node:test';
import assert from 'node:assert/strict';
import { measurePayload } from '../scripts/payload.mjs';
test('payload sizes are measured by kind and targets only warn', () => {
  const targets = { wasmBytes: 50, javaScriptBytes: 20, totalBytes: 80 };
  assert.deepEqual(
    measurePayload({ 'sim.wasm': { bytes: 50 }, 'app.js': { bytes: 20 } }, targets),
    { total: 70, wasm: 50, javascript: 20, overTargets: [] },
  );
  const over = measurePayload(
    { 'sim.wasm': { bytes: 51 }, 'app.js': { bytes: 21 }, 'data.json': { bytes: 10 } },
    targets,
  ).overTargets;
  assert.equal(over.length, 3);
  assert.match(over[0], /WebAssembly 51 bytes/);
  assert.match(over[1], /JavaScript 21 bytes/);
  assert.match(over[2], /Total payload 82 bytes/);
});
