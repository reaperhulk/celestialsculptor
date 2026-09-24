// Release qualification: `node scripts/qualify-numerics.mjs [numerics] [tree] [split]`
// runs the named parts (all three by default). Every long run is its own
// process and they run concurrently; CI instead runs each on its own machine
// and merges their raw outputs in the gate job.
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
function run(command, args, output) {
  const fd = output ? openSync(output, 'w') : null;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', fd ?? 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('exit', (status) => {
      if (fd !== null) closeSync(fd);
      if (status === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed (${status})`));
    });
  });
}
const example = (name, ...args) => [
  'cargo',
  ['run', '--release', '--locked', '-p', 'celestial-sim', '--example', name, '--', ...args],
];
const parts = new Set(
  process.argv.slice(2).length ? process.argv.slice(2) : ['numerics', 'tree', 'split'],
);
for (const part of parts)
  if (!['numerics', 'tree', 'split'].includes(part)) throw new Error(`Unknown part ${part}`);
// Build once, so the concurrent runs do not race to compile.
await run('cargo', ['build', '--release', '--locked', '-p', 'celestial-sim', '--examples']);
const runs = [];
if (parts.has('numerics')) runs.push(run(...example('qualify'), 'numerical-raw.json'));
if (parts.has('tree'))
  for (const solver of ['tree', 'exact'])
    runs.push(run(...example('qualify-tree', solver), `tree-raw-${solver}.json`));
if (parts.has('split'))
  for (const plan of ['split-tree', 'split-direct', 'uniform-tree'])
    runs.push(run(...example('qualify-split', '600', plan), `split-raw-${plan}.json`));
await Promise.all(runs);
if (parts.has('numerics'))
  await run(process.env.QUALIFICATION_PYTHON || 'python3', [
    'scripts/qualify-numerics.py',
    'numerical-raw.json',
  ]);
if (parts.has('tree'))
  await run(process.execPath, [
    'scripts/qualify-tree.mjs',
    'tree-raw-tree.json',
    'tree-raw-exact.json',
  ]);
if (parts.has('split'))
  await run(process.execPath, [
    'scripts/qualify-split.mjs',
    'split-raw-split-tree.json',
    'split-raw-split-direct.json',
    'split-raw-uniform-tree.json',
  ]);
