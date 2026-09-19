import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import init, { Simulation } from '../dist/pkg/celestial_wasm.js';
import { Runtime } from '../web/runtime.js';
import { ForcePool, assignments, helperCount } from '../web/force-pool.js';
await init({
  module_or_path: await readFile(new URL('../dist/pkg/celestial_wasm_bg.wasm', import.meta.url)),
});
const spawn = () => new Worker(new URL('../dist/force-helper.js', import.meta.url));
const config = { seed: 42, mission: null, star_mass: 1 };
function runtime(pool) {
  const messages = [],
    r = new Runtime(Simulation, (m) => messages.push(m), { forcePool: pool, workBudgetMs: 1e9 });
  r.handle({ type: 'reset', config });
  r.handle({ type: 'command', command: { type: 'seed_swarm', count: 1199, disorder: 0.4 } });
  return { r, messages };
}
async function play(r, ticks) {
  r.handle({ type: 'play', value: true });
  r.handle({ type: 'speed', value: 16 });
  // 16x asks 1638.4 ticks/s; one second of elapsed time covers the debt cap.
  let done = 0;
  while (done < ticks) {
    const turn = r.advanceElapsed(0.05);
    if (turn?.then) await turn;
    done = JSON.parse(r.sim.snapshot()).tick;
  }
  return r.sim.snapshot();
}
test('assignments deal equal-work subtree pairs and helper counts leave a core for the owner', () => {
  assert.deepEqual(assignments(1), [[...Array(16).keys()]]);
  assert.deepEqual(assignments(2)[0], [0, 2, 4, 6, 9, 11, 13, 15]);
  const pool = new ForcePool(() => ({ postMessage() {}, terminate() {} }), 3);
  assert.deepEqual(pool.owned, assignments(4).slice(0, 3));
  assert.deepEqual([...pool.owner], [3, 7, 8, 12]);
  pool.terminate();
  assert.equal(helperCount(1), 0);
  assert.equal(helperCount(4), 3);
  assert.equal(helperCount(64), 8);
});
test('helper workers reproduce the engine tick for tick, for any pool size', async () => {
  const reference = runtime(null);
  const expected = await play(reference.r, 5);
  reference.r.sim.free();
  for (const size of [1, 3]) {
    const pool = new ForcePool(spawn, size);
    try {
      const { r } = runtime(pool);
      assert.ok(r.usesHelpers());
      const actual = await play(r, 5);
      assert.equal(actual, expected, `${size} helpers`);
      r.sim.free();
    } finally {
      pool.terminate();
    }
  }
});
test('messages wait while a tick is in flight and a failing helper falls back to the engine', async () => {
  const pool = new ForcePool(spawn, 2);
  try {
    const { r, messages } = runtime(pool);
    r.handle({ type: 'play', value: true });
    const turn = r.advanceElapsed(0.05);
    assert.ok(turn?.then, 'large systems advance asynchronously');
    r.receive({ type: 'speed', value: 4, id: 7 });
    assert.equal(r.queue.length, 1);
    await turn;
    assert.equal(r.queue.length, 0);
    assert.equal(r.speed, 4);
    assert.ok(messages.some((m) => m.id === 7 && m.type === 'state'));
    const before = JSON.parse(r.sim.snapshot()).tick;
    const next = r.advanceElapsed(0.05);
    pool.workers[0].terminate();
    await next;
    assert.ok(JSON.parse(r.sim.snapshot()).tick > before, 'the engine finished the tick alone');
    assert.equal(pool.size, 0);
    assert.ok(!r.usesHelpers());
    r.sim.free();
  } finally {
    pool.terminate();
  }
});
test('small systems never wait for helpers', () => {
  const pool = new ForcePool(spawn, 1);
  try {
    const messages = [],
      r = new Runtime(Simulation, (m) => messages.push(m), { forcePool: pool });
    r.handle({ type: 'reset', config });
    r.handle({
      type: 'command',
      command: { type: 'launch', kind: 'rocky', radius: 1, angle: 0, speed: 1 },
    });
    r.handle({ type: 'play', value: true });
    assert.equal(r.advanceElapsed(0.1), undefined);
    assert.equal(JSON.parse(r.sim.snapshot()).tick, 10);
    r.sim.free();
  } finally {
    pool.terminate();
  }
});
