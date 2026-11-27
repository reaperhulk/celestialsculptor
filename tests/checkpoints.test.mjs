import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init, { Simulation } from '../dist/pkg/celestial_wasm.js';
import {
  CheckpointCache,
  MemoryCheckpointStore,
  matchesCheckpoint,
  SessionSnapshots,
} from '../web/checkpoints.js';
import { Runtime } from '../web/runtime.js';
await init({ module_or_path: await readFile('dist/pkg/celestial_wasm_bg.wasm') });
test('persistent restart selects the nearest matching prefix and rejects altered cache bytes', async () => {
  const store = new MemoryCheckpointStore(),
    cache = new CheckpointCache({ provenance: 'build-A', store }),
    sim = new Simulation(JSON.stringify({ seed: 42, mission: null, star_mass: 1 }));
  try {
    sim.command(JSON.stringify({ type: 'seed_swarm', count: 511, disorder: 0.4 }));
    sim.advance(64);
    await cache.capture(sim, { force: true });
    sim.advance(64);
    await cache.capture(sim, { force: true });
    const replay = JSON.parse(sim.export_replay()),
      nearest = await new CheckpointCache({ provenance: 'build-A', store }).nearest(replay);
    assert.equal(nearest.tick, 128);
    assert.equal(await new CheckpointCache({ provenance: 'build-B', store }).nearest(replay), null);
    const metadata = (await store.list()).find((e) => e.replay.end_tick === 128);
    store.records.get(metadata.key).text += 'bad';
    assert.equal((await cache.nearest(replay)).tick, 64);
    assert.equal(matchesCheckpoint(metadata, { ...replay, commands: [] }, 'build-A'), false);
  } finally {
    sim.free();
  }
});
test('worker reconstructs a branch from restart state with the same result as full replay', async () => {
  const store = new MemoryCheckpointStore(),
    checkpoints = new CheckpointCache({ provenance: 'build', store }),
    messages = [],
    r = new Runtime(Simulation, (m) => messages.push(m), { checkpoints });
  try {
    r.receive({ type: 'reset', config: { seed: 42, mission: null, star_mass: 1 } });
    r.receive({ type: 'command', command: { type: 'seed_swarm', count: 511, disorder: 0 } });
    await checkpoints.pending;
    r.sim.advance(128);
    await checkpoints.capture(r.sim, { force: true });
    const replay = r.sim.export_replay(),
      snapshot = r.sim.snapshot();
    await r.receive({ type: 'import', id: 91, replay });
    assert.equal(r.sim.snapshot(), snapshot);
    assert.ok(messages.some((m) => m.id === 91 && m.from_checkpoint && m.tick === 128));
  } finally {
    await checkpoints.pending;
    r.sim.free();
  }
});

test('a newer comparison supersedes an in-flight age without replacing the active world', async () => {
  const messages = [],
    r = new Runtime(Simulation, (m) => messages.push(m));
  r.receive({ type: 'reset', config: { mission: null, seed: 42, star_mass: 1 } });
  try {
    r.receive({
      type: 'command',
      command: { type: 'launch', kind: 'rocky', radius: 1, speed: 1, angle: 0 },
    });
    const current = r.sim.export_replay(),
      replay = JSON.stringify({ ...JSON.parse(current), end_tick: 512 * 600 });
    const first = r.receive({ type: 'compare', id: 1, replays: [replay, replay], tick: 512 * 600 }),
      second = r.receive({ type: 'compare', id: 2, replays: [replay, replay], tick: 16 });
    await Promise.all([first, second]);
    assert.ok(
      messages.some((m) => m.id === 1 && m.type === 'error' && m.message.includes('cancelled')),
    );
    assert.ok(messages.some((m) => m.id === 2 && m.type === 'comparison' && m.tick === 16));
    assert.equal(r.sim.export_replay(), current);
  } finally {
    r.sim.free();
  }
});

test('500-year autosave reloads the exact sandbox state without advancing a replay tick', async () => {
  const store = new MemoryCheckpointStore(),
    sessions = new SessionSnapshots(store);
  const messages = [],
    r = new Runtime(Simulation, (m) => messages.push(m), { sessions });
  r.receive({ type: 'reset', config: { seed: 43, mission: null, star_mass: 1 } });
  r.receive({ type: 'command', command: { type: 'seed_belt', radius: 2.5 } });
  for (let year = 0; year < 500; year++) r.sim.advance(512);
  const saved = r.sim.session_checkpoint();
  await r.receive({ type: 'autosave', id: 10 });
  const reply = messages.at(-1);
  assert.equal(reply.snapshot_saved, true);
  r.sim.advance(15);
  const later = r.sim.snapshot();
  // A new runtime and storage reader model a page reload.
  const incoming = [],
    next = new Runtime(Simulation, (m) => incoming.push(m), {
      sessions: new SessionSnapshots(store),
    });
  try {
    next.receive({ type: 'reset', config: { seed: 42, mission: 0, star_mass: 1 } });
    await next.receive({ type: 'import', id: 11, replay: reply.replay, restore_session: true });
    assert.equal(next.sim.tick(), 500 * 512);
    assert.ok(next.sim.session_checkpoint() === saved);
    assert.ok(!incoming.some((m) => m.type === 'progress'));
    next.sim.advance(15);
    assert.ok(next.sim.snapshot() === later);
    const full = new Simulation(JSON.stringify({ seed: 43, mission: null, star_mass: 1 }));
    try {
      full.begin_import(reply.replay);
      while (!full.advance_import(512));
      assert.ok(full.session_checkpoint() === saved);
    } finally {
      full.free();
    }
  } finally {
    next.sim.free();
    r.sim.free();
  }
});
test('campaign reload accepts only its exact local session and falls back on damaged storage', async () => {
  const config = { seed: 42, mission: 0, star_mass: 1 },
    sim = new Simulation(JSON.stringify(config)),
    store = new MemoryCheckpointStore(),
    sessions = new SessionSnapshots(store);
  try {
    sim.command(JSON.stringify({ type: 'launch', kind: 'rocky', radius: 1, angle: 0, speed: 1 }));
    sim.advance(9);
    const replay = sim.export_replay();
    assert.ok(await sessions.save(sim, replay));
    const state = await sessions.load(replay);
    sim.advance(1);
    assert.throws(() => sim.restore_session(state, sim.export_replay()));
    sim.restore_session(state, replay);
    assert.equal(sim.tick(), 9);
    const stored = [...store.records.values()][0];
    stored.text.text += 'broken';
    assert.equal(await sessions.load(replay), null);
  } finally {
    sim.free();
  }
});
