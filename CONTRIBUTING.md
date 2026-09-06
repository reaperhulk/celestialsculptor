# Development and release

Install Rust using `rustup` (the checked-in toolchain pins Rust 1.90.0), Node 22,
and the matching WebAssembly binding generator:

```sh
cargo install wasm-bindgen-cli --version 0.2.104 --locked
npm ci --ignore-scripts
cargo test --workspace --release --locked
npm run build
npm test
npm run check
```

The main test loop needs no browser or graphics device. `cargo run --release -p
celestial-sim --bin sculptor -- verify` plays all authored campaign fixtures and
emits JSON. `sculptor replay FILE` reconstructs an exported experiment. For a
regression, add the smallest reproducing replay and its expected behavior before
changing the physics. Compare native and WASM state with the Node parity suite.

## GitHub Actions and Pages

One-time repository setting: **Settings → Pages → Build and deployment → Source:
GitHub Actions**. The workflow token can deploy an enabled Pages site but cannot
enable Pages for a new repository. No personal token is stored in this project.

Every pull request and push to `main` runs Rust format/lint, native tests, all
campaign scenarios, a release WASM build, static web checks, and native/WASM parity.
Only a successful `main` run can deploy. The deployment consumes the exact uploaded
build artifact; it does not rebuild. OIDC grants Pages publishing credentials only
to the deployment job. A post-deployment check verifies the revision and public
HTML, JS, worker, CSS, and WASM entrypoints.

Expected URL: https://reaperhulk.github.io/celestialsculptor/

All assets use relative URLs, so repository-subpath hosting works without a router
or server. No COOP/COEP headers, SharedArrayBuffer, service worker, or CDN dependency
is required. Revert a faulty source commit on `main` to rerun the same test/release
pipeline; generated artifacts are never committed to source.

`DESIGN.md` records the required 100 review/implementation iterations and their
verification evidence. Each numbered commit includes its corresponding entry.
