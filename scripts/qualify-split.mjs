// Gate for the near/far split: a giant with two authored moons inside a
// 512-body low-mass disk, integrated for 600 years by the production scheme
// (mutual tree far field at four coarse substeps, direct near field at eight
// fine steps each). Two comparisons: the same split with direct far forces
// isolates the tree's approximation, and a uniform sixteen-substep integration
// of the same tree forces isolates the integrator. The moons' elements are
// measured relative to their host with the same budgets as the small moon
// family; balances use the tree budgets.
import { readFile, writeFile } from 'node:fs/promises';
const raw = JSON.parse(await readFile(process.argv[2], 'utf8')),
  budgets = {
    axis_relative: 2e-3,
    eccentricity: 2e-3,
    phase_radians: 0.2,
    apsis_radians: 0.1,
    relative_energy: 2e-5,
    angular_residual: 1e-9,
    momentum_residual: 1e-9,
  },
  G = 39.47841760435743,
  failures = [];
function bodies(state) {
  const out = [];
  for (let i = 0; i < state.length; i += 5) out.push(state.slice(i, i + 5));
  return out;
}
function elements(body, host) {
  const rx = body[0] - host[0],
    ry = body[1] - host[1],
    vx = body[2] - host[2],
    vy = body[3] - host[3],
    d = Math.hypot(rx, ry),
    v2 = vx * vx + vy * vy,
    mu = G * (body[4] + host[4]),
    dot = rx * vx + ry * vy,
    ex = ((v2 - mu / d) * rx - dot * vx) / mu,
    ey = ((v2 - mu / d) * ry - dot * vy) / mu;
  return {
    axis: 1 / (2 / d - v2 / mu),
    eccentricity: Math.hypot(ex, ey),
    phase: Math.atan2(ry, rx),
    apsis: Math.atan2(ey, ex),
  };
}
const wrap = (a) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
function moonErrors(candidate, reference) {
  const c = bodies(candidate),
    r = bodies(reference),
    worst = { axis_relative: 0, eccentricity: 0, phase_radians: 0, apsis_radians: 0 };
  for (const index of raw.moons) {
    const a = elements(c[index], c[raw.host]),
      b = elements(r[index], r[raw.host]);
    worst.axis_relative = Math.max(
      worst.axis_relative,
      Math.abs(a.axis - b.axis) / Math.abs(b.axis),
    );
    worst.eccentricity = Math.max(worst.eccentricity, Math.abs(a.eccentricity - b.eccentricity));
    worst.phase_radians = Math.max(worst.phase_radians, wrap(a.phase - b.phase));
    if (a.eccentricity >= 1e-4 && b.eccentricity >= 1e-4)
      worst.apsis_radians = Math.max(worst.apsis_radians, wrap(a.apsis - b.apsis));
  }
  return worst;
}
const initial = raw.initial_balances,
  reference = raw.runs.find((run) => run.name === 'uniform-tree'),
  production = raw.runs.find((run) => run.name === 'split-tree');
const rows = raw.runs.map((run) => {
  const row = {
    name: run.name,
    years: run.samples.at(-1).year,
    relative_energy: Math.max(
      ...run.samples.map((s) => Math.abs((s.balances[0] - initial[0]) / initial[0])),
    ),
    angular_residual: Math.max(...run.samples.map((s) => Math.abs(s.balances[1] - initial[1]))),
    momentum_residual: Math.max(
      ...run.samples.map((s) => Math.hypot(s.balances[2] - initial[2], s.balances[3] - initial[3])),
    ),
    moonsBound: run.samples.every((s) => {
      const b = bodies(s.state);
      return raw.moons.every((index) => elements(b[index], b[raw.host]).axis > 0);
    }),
  };
  const against = run === production ? reference : production;
  const errors = run.samples.map((s, k) => moonErrors(s.state, against.samples[k].state));
  row.compared_with = against.name;
  row.moon_errors = Object.fromEntries(
    Object.keys(errors[0]).map((key) => [key, Math.max(...errors.map((e) => e[key]))]),
  );
  return row;
});
for (const row of rows) {
  if (row.years !== 600) failures.push(`${row.name}: incomplete horizon`);
  for (const key of ['relative_energy', 'angular_residual', 'momentum_residual'])
    if (row[key] > budgets[key]) failures.push(`${row.name}: ${key} ${row[key]} > ${budgets[key]}`);
  if (!row.moonsBound) failures.push(`${row.name}: a moon left its host`);
  for (const [key, value] of Object.entries(row.moon_errors))
    if (value > budgets[key])
      failures.push(`${row.name} vs ${row.compared_with}: moon ${key} ${value} > ${budgets[key]}`);
}
const report = {
  schema: 1,
  physics: raw.physics,
  bodies: raw.bodies,
  scope:
    'Giant with two authored moons inside a 512-body low-mass disk for 600 years: the production near/far split with the mutual tree, compared with the same split on direct far forces (tree approximation) and with a uniform sixteen-substep integration of the same tree forces (integrator). Moon elements are relative to the host.',
  budgets,
  rows,
  passed: !failures.length,
  failures,
};
await writeFile('split-qualification.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
