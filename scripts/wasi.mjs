// Run a WASI build of a qualification example under Node's V8, the engine
// behind Chrome: `node scripts/wasi.mjs example.wasm [args...]`. Standard
// output and error pass through, so the example's JSON can be redirected.
import { readFile } from 'node:fs/promises';
import { WASI } from 'node:wasi';
const [path, ...args] = process.argv.slice(2);
if (!path) throw new Error('Usage: node scripts/wasi.mjs example.wasm [args...]');
const wasi = new WASI({ version: 'preview1', args: [path, ...args], env: {}, returnOnExit: true });
const module = await WebAssembly.compile(await readFile(path));
const instance = await WebAssembly.instantiate(module, wasi.getImportObject());
process.exitCode = wasi.start(instance);
