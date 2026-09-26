import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
export async function verifyToolchainContracts() {
  const [cargo, wasm, toolchain, workflow, packageText, lockText, cargoLock] = await Promise.all(
    [
      'Cargo.toml',
      'crates/wasm/Cargo.toml',
      'rust-toolchain.toml',
      '.github/workflows/verify.yml',
      'package.json',
      'package-lock.json',
      'Cargo.lock',
    ].map((path) => readFile(path, 'utf8')),
  );
  const version = cargo.match(/^version = "([^"]+)"/m)?.[1],
    bindgen = wasm.match(/wasm-bindgen = "=([^"]+)"/)?.[1],
    rust = toolchain.match(/channel = "([^"]+)"/)?.[1];
  assert.ok(version && bindgen && rust, 'Tool versions must be explicit');
  assert.equal(
    JSON.parse(packageText).license,
    cargo.match(/^license = "([^"]+)"/m)?.[1],
    'Rust and web license metadata differ',
  );
  assert.equal(
    JSON.parse(packageText).version,
    version,
    'Rust and web application versions differ',
  );
  assert.equal(JSON.parse(lockText).version, version, 'NPM lockfile version differs');
  assert.equal(
    cargoLock.match(/name = "wasm-bindgen"\nversion = "([^"]+)"/)?.[1],
    bindgen,
    'Cargo.lock wasm-bindgen differs from the crate pin',
  );
  // CI reads the pin (scripts/bindgen-version.mjs) rather than repeating it.
  const installs = [
    ...workflow.matchAll(/cargo install wasm-bindgen-cli --version (.+?) --locked/g),
  ];
  assert.ok(installs.length > 0, 'CI must install the binding generator');
  for (const [, pinned] of installs)
    assert.equal(
      pinned,
      '${{ steps.bindgen.outputs.version }}',
      'CI binding generator must follow the crate',
    );
  // The pinned action installs the Rust release its commit is tagged with.
  const pins = [...workflow.matchAll(/uses: dtolnay\/rust-toolchain@[0-9a-f]{40} # ([^\s]+)/g)];
  assert.ok(pins.length > 0, 'CI must install Rust with the pinned toolchain action');
  for (const [, pin] of pins) assert.equal(pin, rust, 'CI Rust differs from rust-toolchain.toml');
  for (const [, action] of workflow.matchAll(/uses: ([^\s#]+)/g))
    assert.match(action, /@[0-9a-f]{40}$/, 'Actions must use immutable commits');
  return { version, bindgen, rust };
}
