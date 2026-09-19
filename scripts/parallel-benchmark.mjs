// Whole-tick throughput with gravity helpers: engine alone versus a pool of
// Node worker threads, each pair verified to produce identical snapshots.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { cpus, arch } from 'node:os';
import { execFileSync } from 'node:child_process';
import init, { Simulation } from '../dist/pkg/celestial_wasm.js';
import { Runtime } from '../web/runtime.js';
import { ForcePool } from '../web/force-pool.js';
await init({ module_or_path: await readFile('dist/pkg/celestial_wasm_bg.wasm') });
const spawn = () => new Worker(new URL('../dist/force-helper.js', import.meta.url));
const counts = (process.argv[2] || '1024,2048,4096,8192').split(',').map(Number);
const sizes = (process.argv[3] || `0,1,2,${Math.max(1, cpus().length - 1)}`).split(',').map(Number);
const ticks = Number(process.argv[4] || 12);
const config = { seed: 42, mission: null, star_mass: 1 };
async function measure(bodies, pool) {
  const r = new Runtime(Simulation, () => {}, { forcePool: pool, workBudgetMs: 1e9 });
  r.handle({ type: 'reset', config });
  r.handle({ type: 'command', command: { type: 'seed_swarm', count: bodies - 1, disorder: 0.3 } });
  r.handle({ type: 'play', value: true });
  r.handle({ type: 'speed', value: 16 });
  const warm = r.advanceElapsed(0.002);
  if (warm?.then) await warm;
  const start = performance.now();
  let done = JSON.parse(r.sim.snapshot()).tick;
  const target = done + ticks;
  while (done < target) {
    const turn = r.advanceElapsed(0.05);
    if (turn?.then) await turn;
    done = JSON.parse(r.sim.snapshot()).tick;
  }
  const ms = (performance.now() - start) / (done - (target - ticks));
  const snapshot = r.sim.snapshot();
  r.sim.free();
  return { ms, snapshot };
}
const results = [];
for (const bodies of counts) {
  let reference = null;
  for (const size of sizes) {
    const pool = size ? new ForcePool(spawn, size) : null;
    try {
      const { ms, snapshot } = await measure(bodies, pool);
      if (reference === null) reference = snapshot;
      else assert.equal(snapshot, reference, `${bodies} bodies / ${size} helpers diverged`);
      const row = {
        bodies,
        helpers: size,
        msPerTick: Number(ms.toFixed(2)),
        ticksPerSecond: Math.round(1000 / ms),
      };
      results.push(row);
      console.log(JSON.stringify(row));
    } finally {
      pool?.terminate();
    }
  }
}
await writeFile(
  'parallel-benchmark-results.json',
  JSON.stringify(
    {
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      architecture: arch(),
      cpu: cpus()[0]?.model,
      cores: cpus().length,
      node: process.version,
      scope:
        'Complete WASM ticks driven through the worker runtime; every helper count produced identical snapshots.',
      results,
    },
    null,
    2,
  ) + '\n',
);
