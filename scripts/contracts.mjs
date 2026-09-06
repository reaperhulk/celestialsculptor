import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export async function verifyToolchainContracts(){
 const [cargo,wasm,toolchain,workflow,packageText,lockText]=await Promise.all(['Cargo.toml','crates/wasm/Cargo.toml','rust-toolchain.toml','.github/workflows/verify.yml','package.json','package-lock.json'].map(path=>readFile(path,'utf8')));
 const version=cargo.match(/^version = "([^"]+)"/m)?.[1],bindgen=wasm.match(/wasm-bindgen = "=([^"]+)"/)?.[1],rust=toolchain.match(/channel = "([^"]+)"/)?.[1];
 assert.ok(version&&bindgen&&rust,'Tool versions must be explicit');
 assert.equal(JSON.parse(packageText).version,version,'Rust and web application versions differ');assert.equal(JSON.parse(lockText).version,version,'NPM lockfile version differs');
 assert.ok(workflow.includes(`cargo install wasm-bindgen-cli --version ${bindgen} --locked`),'CI binding generator differs from the crate');
 for(const [,pin] of workflow.matchAll(/toolchain: ([^\n]+)/g))assert.equal(pin,rust,'CI Rust differs from rust-toolchain.toml');
 for(const [,action] of workflow.matchAll(/uses: ([^\s#]+)/g))assert.match(action,/@[0-9a-f]{40}$/,'Actions must use immutable commits');
 return {version,bindgen,rust};
}
