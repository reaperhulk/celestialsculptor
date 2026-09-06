# Celestial Sculptor

A browser orbital laboratory and ten-challenge campaign. Sculpt initial conditions,
run the universe, and discover what survives. Rust runs the physics and game rules;
WebAssembly runs in a dedicated worker; WebGL 2 presents a tiltable orbital plane.

## Product direction

Grounded but forgiving physics, challenges plus an unrestricted sandbox, desktop
and touch controls. Solar-system formation is compressed into playable experiments.
Gravity is real N-body gravity; contact radii are deliberately enlarged, collisions
merge inelastically, and the habitable zone is a simplified potential-life indicator.
No claim of geological, atmospheric, or biological simulation.

## Core contract

`celestial-sim` has no browser, renderer, wall clock, or OS randomness. Every action
goes through `World::apply`, including those used by the UI and scenario tests.
World time advances by 1/512 year per tick using four fixed leapfrog substeps.
The star responds to gravity. Mergers conserve mass, linear momentum, and angular
momentum (unresolved spin stores collision angular momentum); kinetic energy is
deliberately dissipated. Escapes are accounted for separately.

Seed + versioned configuration + tick-stamped commands reproduce a run. Exact
replays are guaranteed within the same executable/toolchain; native/WASM parity
uses numerical tolerances, not a promise of bit-identical chaotic trajectories.
Mission conditions and continuous hold timers are evaluated in Rust. The renderer
cannot complete a mission. All dimensions use AU, years, and solar masses internally.

## Play

[Open Celestial Sculptor](https://langui.sh/celestialsculptor/). Start with the first
challenge or open the sandbox and choose a starting point. Place a world at 1 AU
and 100% speed, then Run. Select worlds to inspect their entire orbit. Later tools
include debris disks and budgeted orbital burns. Rewind restores the initial setup;
Undo removes the latest edit and reconstructs the experiment.

## Build and verify

Install Node 22 or newer and Rust through rustup. The repository pins Rust 1.90.0
and its WASM target. Install the matching binding generator and dependencies:

```sh
cargo install wasm-bindgen-cli --version 0.2.104 --locked
npm ci --ignore-scripts
npm run verify
npm run serve
```

Open `http://localhost:4173/celestialsculptor/`. The complete `verify` command runs
formatting, lint, native physics and campaign tests, a release WASM build, artifact
checks, and Node tests of the actual WASM engine. It needs no browser or GPU.
Use `npm run bench` for an informational performance report. See
[CONTRIBUTING.md](CONTRIBUTING.md) for browser tests and publishing.

To reproduce a downloaded experiment, backup or bug report:

```sh
cargo run --release --locked -p celestial-sim --bin sculptor -- replay celestial-experiment.json
```

[DESIGN.md](DESIGN.md) records architecture, scientific limits and every review iteration.

Project source is available under the [MIT license](LICENSE).
