import { spawnSync, execFileSync } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

function run(command, args) {
  const r = spawnSync(command, args, { stdio: 'inherit' });
  if (r.error || r.status !== 0) throw new Error(`${command} failed: ${r.error || r.status}`);
}
run('cargo', ['build', '--release', '--locked', '-p', 'celestial-wasm', '--target', 'wasm32-unknown-unknown']);
await rm('dist', { recursive: true, force: true });
await mkdir('dist/pkg', { recursive: true });
await cp('web', 'dist', { recursive: true });
run('wasm-bindgen', ['target/wasm32-unknown-unknown/release/celestial_wasm.wasm', '--target', 'web', '--out-dir', 'dist/pkg', '--out-name', 'celestial_wasm']);
await writeFile('dist/.nojekyll', '');
await writeFile('dist/build-info.json',JSON.stringify({revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),saveVersion:1}));
console.log('Built static WebAssembly application in dist/');
