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

Every pull request and push to `main` runs these gates in order:

1. Rust format, warning-free Clippy, native physics/property/CLI tests and all 20
   winning/losing campaign scenarios.
2. Locked release WASM build, DOM/module/toolchain/style/payload contracts, and
   Node tests of actual WASM, native parity, replay, memory and worker behavior.
3. Chromium integration at seven viewports, Firefox and WebKit engine tests,
   graphics fallback/recovery, keyboard and touch-related controls, persistence,
   and representative desktop/phone screenshots.
4. A release inventory and upload of the exact tested Pages artifact.
5. On a successful `main` build, OIDC Pages deployment and verification of the
   public directory entrypoint, revision, every asset hash and WASM MIME type.

PRs never deploy. Main builds finish once active; newer pending main commits
replace older pending builds. This keeps continuous pushes from interrupting an
active release. Superseded PR builds are cancelled. Failed gates keep the last
successful Pages release available.

Run the browser layer locally on a machine that supports browser processes:

```sh
npm run build
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
```

Artifacts in the Actions run include `simulation-results`, `performance-results`,
`ui-previews`, `release-report`, and failure traces/screenshots when relevant.
`npm run report` describes the current build. Local builds record whether their
source had uncommitted changes, so bug reports distinguish them from a clean
release. `npm run verify` is the complete graphics-independent development gate.

The Pages URL redirects to the owner's configured domain:
[Play the game](https://langui.sh/celestialsculptor/).
All assets are relative, including module workers and WASM, so repository-subpath
hosting works without a router, backend, COOP/COEP headers or external CDN assets.

For a bad release, identify the offending source commit in Actions and create a
normal `git revert` commit on `main`. The same gates build and deploy the revert;
never force-push shared history or manually patch `dist`. To investigate first,
use **Help → Export bug report**, then run `sculptor replay FILE`. The JSON output
includes orbits, energy, momenta, mass accounting and work usage. Preserve the
smallest reproducing replay as a regression before changing physics.

`DESIGN.md` records all 100 review/implementation iterations and their verification
evidence. Every numbered iteration is committed and pushed with its corresponding
entry. The campaign and sandbox run entirely locally; exports stay on the player's
device unless they choose to share a file.

## Payload and runtime budgets

`performance-budget.json` caps uncompressed runtime assets at 1 MB, WASM at 512 KB,
and all JavaScript at 256 KB. The static gate checks these deterministic sizes.
A deliberate budget change should explain its player benefit and expected loading
cost. Timing benchmarks remain informational because CI runners vary: compare
8/32/64-body stepping and snapshot costs in the Actions summary and downloaded
`performance-results` artifact. The game separately bounds bodies, ticks, commands,
work units, trail vertices, request lifetime and audio voices.
