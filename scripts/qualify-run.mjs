// One qualification run of the shipped physics: the example built as SIMD
// WebAssembly for WASI and run under V8, the engine behind Chrome.
// `node scripts/qualify-run.mjs <example> [args...] > raw.json`
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const EXAMPLES = ['qualify', 'qualify-tree', 'qualify-split'];
export function buildExamples() {
  const r = spawnSync(
    'cargo',
    [
      'build',
      '--release',
      '--locked',
      '-p',
      'celestial-sim',
      '--target',
      'wasm32-wasip1',
      ...EXAMPLES.flatMap((name) => ['--example', name]),
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (r.error || r.status !== 0) throw new Error('Building the WebAssembly examples failed');
}
export function runExample(name, args, stdout = 'inherit') {
  const wasm = `target/wasm32-wasip1/release/examples/${name}.wasm`;
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--no-warnings', fileURLToPath(new URL('./wasi.mjs', import.meta.url)), wasm, ...args],
      { stdio: ['ignore', stdout, 'inherit'] },
    );
    child.on('error', reject);
    child.on('exit', (status) =>
      status === 0 ? resolve() : reject(new Error(`${name} ${args.join(' ')} failed (${status})`)),
    );
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [name, ...args] = process.argv.slice(2);
  if (!EXAMPLES.includes(name)) throw new Error(`Choose one of ${EXAMPLES.join(', ')}`);
  buildExamples();
  await runExample(name, args);
}
