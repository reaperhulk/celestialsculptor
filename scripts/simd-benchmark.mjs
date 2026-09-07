// Differential correctness and end-to-end timing, without a browser or renderer.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile, appendFile} from 'node:fs/promises';
import {cpus, tmpdir, arch, platform} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as simd from '../dist/pkg/celestial_wasm.js';

const temporary = await mkdtemp(join(tmpdir(), 'celestial-scalar-'));
const run = (command, args, options = {}) => execFileSync(command, args, {
  encoding: 'utf8', maxBuffer: 32_000_000, ...options,
});
const native = command => JSON.parse(run('cargo', [
  'run', '--quiet', '--release', '--locked', '-p', 'celestial-sim', '--bin', 'sculptor', '--', command,
]));
try {
  const env = {...process.env, RUSTFLAGS: '-C target-feature=-simd128', CARGO_TARGET_DIR: resolve('target/simd-reference')};
  delete env.CARGO_ENCODED_RUSTFLAGS;
  run('cargo', ['build', '--release', '--locked', '-p', 'celestial-wasm', '--target', 'wasm32-unknown-unknown'], {env, stdio: 'inherit'});
  run('wasm-bindgen', [join(env.CARGO_TARGET_DIR, 'wasm32-unknown-unknown/release/celestial_wasm.wasm'), '--target', 'web', '--out-dir', temporary, '--out-name', 'scalar'], {stdio: 'inherit'});
  await writeFile(join(temporary, 'package.json'), '{"type":"module"}');
  const scalar = await import(pathToFileURL(join(temporary, 'scalar.js')).href);
  await scalar.default({module_or_path: await readFile(join(temporary, 'scalar_bg.wasm'))});
  await simd.default({module_or_path: await readFile('dist/pkg/celestial_wasm_bg.wasm')});
  assert.equal(scalar.gravity_backend(), 'scalar-f64');
  assert.equal(simd.gravity_backend(), 'wasm-simd-f64x2', 'Build the production SIMD artifact first');

  let checkpoints = 0;
  function equal(a, b, name) {
    for (const field of ['snapshot', 'balances', 'observations', 'export_replay']) {
      assert.equal(a[field](), b[field](), `${name}: scalar/SIMD ${field}`);
    }
    checkpoints++;
  }
  function pair(config, work) {
    const a = new scalar.Simulation(JSON.stringify(config));
    const b = new simd.Simulation(JSON.stringify(config));
    try { return work(a, b); } finally { a.free(); b.free(); }
  }
  const campaign = native('fixtures'), sweep = native('sweep');
  assert.equal(sweep.passed, true);
  for (const example of [...campaign, ...sweep.cases]) {
    pair(example.replay.config, (a, b) => {
      for (const s of [a, b]) s.import_replay(JSON.stringify(example.replay));
      equal(a, b, example.name || `${example.style}/${example.seed}`);
    });
  }
  for (const recipe of JSON.parse(await readFile('web/recipes.json'))) {
    pair(recipe.config, (a, b) => {
      for (const command of recipe.commands) for (const s of [a, b]) s.command(JSON.stringify(command));
      equal(a, b, recipe.id);
      const years = recipe.id === 'resonant-moons' ? 40 : 4;
      for (let year = 0; year < years; year++) {
        for (const s of [a, b]) s.advance(512);
        equal(a, b, `${recipe.id}/${year + 1}`);
      }
    });
  }
  // Empty pair loops, single pairs, both vector tails under current rules.
  const config = {seed: 42, mission: null, star_mass: 1};
  for (const count of [1, 2, 3, 4, 5, 31, 33, 63]) for (const version of [7]) {
    const replay = {version, config, end_tick: 512, commands: Array.from({length: count - 1}, (_, i) => ({
      tick: 0, command: {type: 'launch', kind: 'rocky', radius: .5 + i * .08, angle: i * 2.399963229728653, speed: 1},
    }))};
    pair(config, (a, b) => {
      for (const s of [a, b]) s.import_replay(JSON.stringify(replay));
      equal(a, b, `${count} bodies/rules ${version}`);
    });
  }

  for(const count of [256,512,1024]) pair(config,(a,b)=>{
    for(const s of [a,b])s.command(JSON.stringify({type:'seed_swarm',count:count-1,disorder:.1}));
    equal(a,b,`swarm/${count}/initial`);
    for(const s of [a,b])s.advance(32);
    equal(a,b,`swarm/${count}/advanced`);
  });
  const cases = [];
  for (const fixture of native('bench').cases) {
    const samples = [[], []];
    // Alternate order, discard three warmup rounds, then take nine medians.
    for (let round = 0; round < 12; round++) {
      pair(fixture.replay.config, (a, b) => {
        const worlds = [a, b];
        for (const index of round % 2 ? [1, 0] : [0, 1]) {
          const s = worlds[index]; s.import_replay(JSON.stringify(fixture.replay));
          const start = performance.now();
          for (let batch = 0; batch < 4; batch++) s.advance(512);
          if (round >= 3) samples[index].push(performance.now() - start);
        }
        equal(a, b, `benchmark/${fixture.bodies}/${round}`);
      });
    }
    const [scalarMs, simdMs] = samples.map(values => [...values].sort((a, b) => a - b)[4]);
    cases.push({bodies: fixture.bodies, ticks: 2048, scalarMs, simdMs, speedup: scalarMs / simdMs, samples});
  }
  const report = {
    revision: run('git', ['rev-parse', 'HEAD']).trim(), architecture: arch(), os: platform(),
    dirty: run('git', ['status', '--porcelain', '--untracked-files=no']).trim() !== '',
    cpu: cpus()[0]?.model, node: process.version, rust: run('rustc', ['--version']).trim(),
    backend: simd.gravity_backend(), bitwiseEqualCheckpoints: checkpoints, cases,
    scope: 'Whole simulation ticks at the small-system exact path; host CPU, not device FPS or thousand-body support.',
  };
  await writeFile('simd-benchmark-results.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({...report, cases: cases.map(({samples, ...item}) => item)}, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `## Scalar versus SIMD\n\n${checkpoints} exact state, ledger, history and replay comparisons passed. Timing is informational.\n\n` +
    '| Bodies | Scalar ms / 2048 ticks | SIMD ms / 2048 ticks | Speedup |\n|---:|---:|---:|---:|\n' +
    cases.map(c => `| ${c.bodies} | ${c.scalarMs.toFixed(2)} | ${c.simdMs.toFixed(2)} | ${c.speedup.toFixed(2)}x |`).join('\n') + '\n');
} finally {
  await rm(temporary, {recursive: true, force: true});
}
