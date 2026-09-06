import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import init, { Simulation, missions } from '../dist/pkg/celestial_wasm.js';

await init({ module_or_path: await readFile(new URL('../dist/pkg/celestial_wasm_bg.wasm', import.meta.url)) });
const fixtures = JSON.parse(execFileSync('cargo', ['run', '--quiet', '--release', '--locked', '-p', 'celestial-sim', '--bin', 'sculptor', '--', 'fixtures'], { maxBuffer: 10_000_000, encoding: 'utf8' }));

for (const fixture of fixtures) {
  test(`native / WASM parity: ${fixture.name}`, () => {
    const sim = new Simulation(JSON.stringify(fixture.replay.config));
    sim.import_replay(JSON.stringify(fixture.replay));
    const state = JSON.parse(sim.snapshot());
    assert.equal(state.status.completed, fixture.status.completed);
    assert.equal(state.tick, fixture.replay.end_tick);
    assert.equal(state.bodies.length, fixture.bodies.length);
    for (let i = 0; i < state.bodies.length; i++) {
      const a = state.bodies[i], b = fixture.bodies[i];
      assert.equal(a.id, b.id); assert.equal(a.kind, b.kind);
      for (const field of ['pos', 'vel']) for (const axis of ['x', 'y']) {
        assert.ok(Math.abs(a[field][axis] - b[field][axis]) < 1e-8, `${a.id}.${field}.${axis}`);
      }
      assert.ok(Math.abs(a.mass - b.mass) < 1e-12);
    }
    assert.deepEqual(state.events, fixture.events);
    sim.free();
  });
}

test('WASM rejects bad commands and imports without damaging the running state', () => {
  const sim = new Simulation(JSON.stringify({seed: 42, mission: null, star_mass: 1}));
  sim.command(JSON.stringify({type: 'launch', kind: 'rocky', radius: 1, angle: 0, speed: 1}));
  const before = sim.snapshot();
  assert.throws(() => sim.command('{"type":"launch"}'));
  assert.throws(() => sim.import_replay('{"version":999}'));
  assert.throws(() => sim.advance(513));
  assert.equal(sim.snapshot(), before);
  assert.equal(JSON.parse(missions()).length, 10);
  sim.free();
});
test('disk creation crosses the real WASM command boundary and evolves finite state',()=>{
 const sim=new Simulation(JSON.stringify({seed:71,mission:null,star_mass:1}));
 sim.command(JSON.stringify({type:'seed_disk',radius:2.5,spread:1,disorder:.25,count:24}));
 assert.equal(JSON.parse(sim.snapshot()).bodies.length,25);sim.advance(512);
 const state=JSON.parse(sim.snapshot());assert.equal(state.tick,512);
 for(const b of state.bodies)assert.ok(Number.isFinite(b.pos.x)&&Number.isFinite(b.vel.y));
 assert.equal(JSON.parse(sim.export_replay()).commands[0].command.type,'seed_disk');sim.free();
});
