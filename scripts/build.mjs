import { spawnSync, execFileSync } from 'node:child_process';
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import {assetManifest} from './integrity.mjs';
import {verifyToolchainContracts} from './contracts.mjs';
import assert from 'node:assert/strict';
const versions=await verifyToolchainContracts();
assert.equal(execFileSync('wasm-bindgen',['--version'],{encoding:'utf8'}).trim(),`wasm-bindgen ${versions.bindgen}`,'Install the binding generator version pinned in crates/wasm/Cargo.toml');

function run(command, args) {
  const r = spawnSync(command, args, { stdio: 'inherit' });
  if (r.error || r.status !== 0) throw new Error(`${command} failed: ${r.error || r.status}`);
}
run('cargo', ['build', '--release', '--locked', '-p', 'celestial-wasm', '--target', 'wasm32-unknown-unknown']);
await rm('dist', { recursive: true, force: true });
await mkdir('dist/pkg', { recursive: true });
await cp('web', 'dist', { recursive: true });
// Keep symbol-bearing output for profiling while shipping only executable data.
run('wasm-bindgen', ['target/wasm32-unknown-unknown/release/celestial_wasm.wasm', '--target', 'web', '--out-dir', 'target/browser-symbols', '--out-name', 'celestial_wasm']);
run('wasm-bindgen', ['target/wasm32-unknown-unknown/release/celestial_wasm.wasm', '--target', 'web', '--out-dir', 'dist/pkg', '--out-name', 'celestial_wasm', '--remove-name-section']);
await writeFile('dist/.nojekyll', '');
const {default:init,save_version}=await import('../dist/pkg/celestial_wasm.js');
await init({module_or_path:await readFile('dist/pkg/celestial_wasm_bg.wasm')});
await writeFile('dist/build-info.json',JSON.stringify({revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),saveVersion:save_version(),dirty:execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim()!=='',assets:await assetManifest('dist')}));
console.log('Built static WebAssembly application in dist/');
