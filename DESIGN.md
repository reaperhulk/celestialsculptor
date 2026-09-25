# Celestial Sculptor — living design

## Agreed direction

Grounded but forgiving orbital physics. Ten authored challenges plus sandbox.
2.5D orbital plane with a tiltable view. Desktop, tablet, and phone controls.
Rust → WebAssembly, WebGL 2, GitHub Actions, and GitHub Pages. Work is pushed to
`main` continuously. The initial 100 iterations are followed by the development
cycles recorded in [docs/DEVELOPMENT_CYCLES.md](docs/DEVELOPMENT_CYCLES.md).

Current policy (iteration 168): assume no existing saves. Ship one current physics
implementation. Remove historical rule branches and duplicated old-rule tests;
all authored scenarios use the current format. Format 7 identifies the accepted
replay schema, not a runtime physics selector. Earlier compatibility plans below
are historical records and are superseded by this decision.

## Player loop

Read a concrete goal → choose stellar and orbital conditions → launch worlds or
seed debris → run / pause / accelerate → inspect collisions, escapes, and stable
orbits → earn discoveries → retry with revised conditions or unlock the next goal.
The sandbox is accessible from the beginning. Progress and experiments stay local
to the device, with explicit portable exports. No accounts or server are required.

## Architecture

- `crates/sim`: authoritative physics, commands, budgets, unlock rules, goals,
  event history, replay serialization, diagnostics, and native scenario runner.
- `crates/wasm`: thin `wasm-bindgen` API for the same simulation code.
- `web`: DOM controls and WebGL 2 view; dedicated worker owns WASM and time.
- `tests`: renderer-independent WASM parity plus browser integration checks.
- `.github/workflows`: native rules and scenarios → WASM and web build → browser
  smoke / viewport tests → publish the exact tested artifact to Pages on `main`.

The simulation never reads elapsed real time. A tick is 1/512 year, with four
fixed kick-drift-kick substeps below 512 bodies and a Wisdom–Holman splitting
(exact Kepler drifts about the star) above. UI speed changes tick throughput only. The star
moves, collisions preserve mass and momenta, and escape accounting is explicit.
The current simulation supports 8,192 mutually gravitating sandbox bodies.
Missions use a 64-body capacity limit. Below 512 bodies gravity is exact; larger
systems use a symmetric mutual tree. The WASM release uses double-precision SIMD
with a scalar differential test build. [The scaling scorecard](docs/SCALING.md)
records measured gains and remaining costs. Rendering is independent; losing a graphics context must never
corrupt the experiment. No SharedArrayBuffer or cross-origin isolation required.

## Testing contract

Native tests cover conservation between external edits, including collision,
escape and disk-transfer ledgers, plus analytic orbital
behavior, commands, budgets, unlocks, progress hold timers, seeded generation,
replay/save validation, and authored winning/losing scenarios. Property tests
exercise bounded random systems and malformed inputs. A CLI exposes machine-readable
scenarios, state, and benchmarks for agents without graphics. WASM runs the same
fixtures and compares against native results with explicit tolerances. Browser
tests verify loading, worker wiring, controls, saves, and standard viewport fit.
Screenshots cannot prove the rules correct; passing headless scenarios is mandatory.

## Scope and scientific limits

Newtonian gravity in AU / years / solar masses, softened at 0.0001 AU. Contact
radii are enlarged to make formation visible on game timescales. The current rules
distinguish gentle accretion, grazing survival and bounded disruption of solids;
stars and giants accrete. Unresolved spin accounts for angular momentum.
[Collision thresholds and limits](docs/COLLISIONS.md) are explicit gameplay
simplifications. Only the current replay version is accepted; older files are rejected rather than silently reinterpreted. Habitability checks entire osculating orbits against a stellar-mass
scaled zone, without simulating atmospheres or life. Fixed steps limit close-pass
accuracy; tests and explicit limits constrain the supported range. Native and
WASM results are tolerance-compared, not assumed bit-identical across platforms.

## Current implementation decisions

Campaigns use exact pairwise gravity with a 64-body cap, and the sandbox scales
to 8,192 bodies with a symmetric mutual tree beyond 512, without a heavyweight
game engine. Rust keeps physics, mission predicates and replay
validation in one native-testable implementation; a thin WASM bridge puts that
same code in the worker. DOM controls provide accessible forms, dialogs and a
body inspector. WebGL 2 draws the tilted plane, procedural bodies, trails and
analytic launch previews. A missing GPU does not prevent form-driven experiments.

Players can launch four body kinds, seed belts or configurable disks, apply
budgeted radial/tangential burns, adjust stellar mass and seed, inspect orbital
periods and extrema, and undo or rewind. Ten sequential discoveries coexist with
an always-open sandbox, eleven editable starting points and five seeded generator styles. Outcomes and saves are
local. Backups and bug reports are portable, importable, and directly reproducible
with the native CLI. Matter is a gameplay budget; burns are external interventions
and are excluded from conservation claims across edits.

A replay is versioned configuration plus ordered tick-stamped commands. A replay
supports 2,048 edits and 600 years regardless of system density. Reconstruction
never trusts serialized scores or body state. Exact reproduction is scoped to the
same executable; cross-target comparisons use tolerances. Future physics changes
must explicitly consider saved-replay compatibility rather than silently promising
that chaotic trajectories survive engine changes.

Tests use analytic invariants, real measured orbital returns, stateful generated
histories, winning and losing fixtures, actual WASM parity and bounded memory/work
checks. Browser screenshots supplement these tests and are reviewed as release
artifacts. CI pins toolchains/actions, uploads one tested artifact, and verifies
its public byte hashes after Pages deployment. Timing is reported, while payload
size and correctness are deterministic gates.

## History

[docs/ITERATIONS.md](docs/ITERATIONS.md) keeps every numbered review, implementation
and validation record, the historical release plans and review targets.
