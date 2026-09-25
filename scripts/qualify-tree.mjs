import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { readRaw } from './merge-raw.mjs';
// One raw file with both solvers, or one per solver from separate machines;
// the tree run comes first and the exact reference second.
const raw = await readRaw(process.argv.slice(2), (run) => String(run.exact));
raw.runs.sort((a, b) => Number(a.exact) - Number(b.exact));
assert.deepEqual(
  raw.runs.map((run) => run.exact),
  [false, true],
  'Both the tree and the exact reference must be qualified',
);
const initial = raw.initial_balances,
  failures = [];
const rows = raw.runs.map((run) => ({
  exact: run.exact,
  years: run.samples.at(-1).year,
  maxRelativeEnergy: Math.max(
    ...run.samples.map((s) => Math.abs((s.balances[0] - initial[0]) / initial[0])),
  ),
  maxAngularResidual: Math.max(...run.samples.map((s) => Math.abs(s.balances[1] - initial[1]))),
  maxMomentumResidual: Math.max(
    ...run.samples.map((s) => Math.hypot(s.balances[2] - initial[2], s.balances[3] - initial[3])),
  ),
}));
// Close encounters are physically chaotic: they magnify any difference
// between the runs, whatever its source. Tree accuracy is judged on the
// bodies that have not had one in either run, and few may have had one.
const TICKS_PER_YEAR = 512,
  MAX_ENCOUNTERED = 0.1,
  MAX_RMS_AU = 1e-4;
const firstEncounter = raw.runs[0].first_encounter_tick.map((tick, i) =>
  Math.min(tick ?? Infinity, raw.runs[1].first_encounter_tick[i] ?? Infinity),
);
const trajectory = raw.runs[0].samples.map((sample, index) => {
  const reference = raw.runs[1].samples[index];
  let all = 0,
    calm = 0,
    count = 0;
  for (let b = 1; b < raw.bodies; b++) {
    const i = 5 * b;
    const d2 =
      (sample.state[i] - reference.state[i]) ** 2 +
      (sample.state[i + 1] - reference.state[i + 1]) ** 2;
    all += d2;
    if (firstEncounter[b] > sample.year * TICKS_PER_YEAR) {
      calm += d2;
      count++;
    }
  }
  return {
    year: sample.year,
    rmsPositionAu: Math.sqrt(calm / count),
    encounteredBodies: raw.bodies - 1 - count,
    rmsAllBodiesAu: Math.sqrt(all / (raw.bodies - 1)),
  };
});
const encountered = firstEncounter
  .slice(1)
  .flatMap((tick, i) => (tick === Infinity ? [] : [{ body: i + 1, year: tick / TICKS_PER_YEAR }]));
for (const row of rows)
  if (
    row.years !== 600 ||
    row.maxRelativeEnergy > 2e-5 ||
    row.maxAngularResidual > 1e-9 ||
    row.maxMomentumResidual > 1e-9
  )
    failures.push(`Persistent tree balance gate failed: exact=${row.exact}`);
if (trajectory.some((s) => s.rmsPositionAu > MAX_RMS_AU))
  failures.push(`Tree/direct trajectory RMS exceeds ${MAX_RMS_AU} AU`);
if (encountered.length > MAX_ENCOUNTERED * (raw.bodies - 1))
  failures.push(`${encountered.length} bodies had close encounters; at most 10% may`);
const report = {
  schema: 1,
  physics: raw.physics,
  bodies: raw.bodies,
  debrisEarthMasses: raw.debris_earth_masses,
  scope:
    'Constant 512-body collisionless cold disk; full 600-year tree lifetime, independently summed direct-force comparison at the same timestep. Low debris mass isolates force accumulation from hard encounters. Trajectory RMS covers bodies without a close encounter (inside one mutual Hill radius) in either run so far; at most 10% of bodies may have one.',
  rows,
  encountered,
  trajectory,
  passed: !failures.length,
  failures,
};
await writeFile('tree-qualification.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
