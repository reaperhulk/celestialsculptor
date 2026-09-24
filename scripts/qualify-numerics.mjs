// Release qualification: `node scripts/qualify-numerics.mjs [numerics] [tree] [split]`
// runs the named parts (all three by default) on the shipped physics: SIMD
// WebAssembly under V8. Every long run is its own process and they run
// concurrently; CI instead runs each on its own machine and merges their raw
// outputs in the gate job.
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { buildExamples, runExample } from './qualify-run.mjs';
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (status) =>
      status === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(' ')} failed (${status})`)),
    );
  });
}
async function example(name, args, output) {
  const fd = openSync(output, 'w');
  try {
    await runExample(name, args, fd);
  } finally {
    closeSync(fd);
  }
}
const parts = new Set(
  process.argv.slice(2).length ? process.argv.slice(2) : ['numerics', 'tree', 'split'],
);
for (const part of parts)
  if (!['numerics', 'tree', 'split'].includes(part)) throw new Error(`Unknown part ${part}`);
// Build once, so the concurrent runs do not race to compile.
buildExamples();
const runs = [];
if (parts.has('numerics')) runs.push(example('qualify', [], 'numerical-raw.json'));
if (parts.has('tree'))
  for (const solver of ['tree', 'exact'])
    runs.push(example('qualify-tree', [solver], `tree-raw-${solver}.json`));
if (parts.has('split'))
  for (const plan of ['split-tree', 'split-direct', 'uniform-tree'])
    runs.push(example('qualify-split', ['600', plan], `split-raw-${plan}.json`));
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
