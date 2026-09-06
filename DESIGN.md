# Celestial Sculptor — living design

## Agreed direction

Grounded but forgiving orbital physics. Ten authored challenges plus sandbox.
2.5D orbital plane with a tiltable view. Desktop, tablet, and phone controls.
Rust → WebAssembly, WebGL 2, GitHub Actions, and GitHub Pages. Work is pushed to
`main` in 100 completed review / implement / verify / commit iterations.

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
fixed kick-drift-kick substeps. UI speed changes tick throughput only. The star
moves, collisions preserve mass and momenta, and escape accounting is explicit.
Body count is capped at 64. Small N favors exact pairwise gravity over an
approximate tree. Rendering is independent; losing a graphics context must never
corrupt the experiment. No SharedArrayBuffer or cross-origin isolation required.

## Testing contract

Native tests cover conservation (only between collisions/escapes), analytic orbital
behavior, commands, budgets, unlocks, progress hold timers, seeded generation,
replay/save validation, and authored winning/losing scenarios. Property tests
exercise bounded random systems and malformed inputs. A CLI exposes machine-readable
scenarios, state, and benchmarks for agents without graphics. WASM runs the same
fixtures and compares against native results with explicit tolerances. Browser
tests verify loading, worker wiring, controls, saves, and standard viewport fit.
Screenshots cannot prove the rules correct; passing headless scenarios is mandatory.

## Scope and scientific limits

Newtonian gravity in AU / years / solar masses, softened at 0.002 AU. Contact
radii are enlarged to make formation visible on game timescales. Perfectly
inelastic mergers represent accretion; unresolved spin accounts for angular
momentum. Habitability checks entire osculating orbits against a stellar-mass
scaled zone, without simulating atmospheres or life. Fixed steps limit close-pass
accuracy; tests and explicit limits constrain the supported range. Native and
WASM results are tolerance-compared, not assumed bit-identical across platforms.

## Iteration log

### 01 — Authoritative simulation foundation

Review needs: separate rules from graphics; establish real orbit dynamics; make
player actions replayable; verify conservation and invalid-command behavior.
Implemented: standalone Rust crate, fixed-step leapfrog, reacting star, inelastic
mergers with spin accounting, escape events, ten goal definitions, validated
commands, seed RNG, tick-stamped replays, and physics regression tests.
Validation: all 6 native regression tests pass in release mode, including a
100-year orbit with relative energy drift below 1e-7. Rust format check passes.

### 02 — Bounded, lossless replay

Review needs: reject malformed or resource-heavy imports; ensure generated belts
are reproducible; prevent the running game from exceeding its export limit; retain
floating-point command values through JSON.
Implemented: 600-year experiment cap, explicit exhausted status, exact float JSON
round trips, and replay / atomic belt / seeded RNG / property regression coverage.
Validation: 11 native tests, including 64 generated replay cases, pass.

### 03 — Executable campaign and agent CLI

Review needs: prove each mission is achievable through real player commands;
prevent empty systems from winning; expose tests and replays without a browser.
Implemented: 20 checked-in winning/losing campaign fixtures, continuous-hold and
budget/unlock tests, whole-orbit habitability test, and JSON-emitting `sculptor`
CLI (`verify`, `fixtures`, `replay FILE`). Fixtures are shared with future WASM tests.
Validation: all campaign fixtures and 15 native tests pass in release mode.

### 04 — Real WASM build and cross-target parity

Review needs: verify the deployed physics is the native engine; keep the web build
small and static; test the JS boundary and malformed imports.
Implemented: pinned wasm-bindgen crate/CLI contract, dependency-locked web package,
static build script, native-versus-WASM numerical comparisons for all 20 scenarios,
and bridge error atomicity tests. Native ES modules avoid a runtime framework.
Validation: release WASM builds and 21 Node tests run without a DOM or GPU.

### 05 — Worker lifecycle and bounded playback

Review needs: keep physics off the UI thread; make resets/imports atomic; bound
catch-up after stalls; pause at mission completion; expose errors to the player.
Implemented: dedicated ES-module worker, tested runtime command protocol, bounded
tick accumulator, explicit speed presets, step/rewind/export/import, and completion
pause. Runtime tests instantiate the real compiled WASM engine.
Validation: 24 Node tests pass, including controller lifecycle and backpressure.

### 06 — Orbital WebGL presentation

Review needs: show physical outcomes clearly; preview launch conditions; keep
picking correct under tilt and resizing; avoid external image/network dependencies.
Implemented: WebGL 2 procedural sphere shading, stellar corona, star field,
habitable annulus, AU grid, bounded trails, selection rings, analytic two-body
launch paths, and inverse projection. GPU effects are presentation-only.
Validation: 26 Node tests pass, including projection inverses at desktop/mobile
sizes and circular/escape preview geometry; JavaScript syntax checks pass.

### 07 — First playable interface

Review needs: expose the actual game immediately; connect every primary control to
the worker; keep the canvas visible on phones; handle loading and errors clearly.
Implemented: responsive orbital workspace, creation form, physics-derived counters,
mission explanation, journal, playback controls, help, reset confirmation, sandbox,
and worker request/error handling. Static checks verify DOM IDs and built assets.
Validation: production build, 26 headless Node tests, JS syntax, DOM contracts,
and all local entrypoint references pass. Touch picking follows in the next review.

### 08 — Direct manipulation and keyboard input

Review needs: make the orbital plane interactive on touch and mouse; support
precise keyboard placement; avoid accidental scrolling; revert canceled star edits.
Implemented: world picking, drag-to-position preview, pinch/wheel zoom, keyboard
play/pause/rewind/place/zoom, canvas arrow adjustments, input-focus safeguards, and
transactional star-reset cancellation. Pointer cancellation clears gesture state.
Validation: 28 Node tests pass; placement limits and nearest-body picking are
tested independently of the renderer; build and static web checks pass.

### 09 — Challenge map and persistent discoveries

Review needs: connect all ten challenges into progression; persist earned goals;
prevent skipping prerequisites; let completed challenges be revisited; ensure
pointer-generated values remain valid HTML form inputs.
Implemented: challenge map, sequential unlocks, idempotent discovery awards,
next-goal action, sandbox finale, validated profile storage, and finer numeric steps.
Validation: 30 Node tests pass, including a complete ten-award progression and
corrupt/denied storage. Build and static UI contracts pass.

### 10 — Recoverable experiments and portable replays

Review needs: retain experiments across reloads; recover from corrupt storage;
allow portable export/import; avoid stale autosaves after resets; survive storage
access denial. User increased the requested review loop from 30 to 100 iterations.
Implemented: versioned autosaves with a previous-snapshot fallback, paused resume,
JSON replay export/import, early import limits, save epochs, safe storage access,
and visible save status. Rust still validates and reconstructs imported commands.
Validation: 32 Node tests pass, including corrupt-primary recovery, oversized import
rejection, and unavailable storage. Production build and web contracts pass.

### 11 — Quiet ambience and event feedback

Review needs: make launches, impacts, escapes, and discoveries feel distinct;
respect browser autoplay rules; avoid audible background tabs or unbounded voices.
Implemented: opt-in Web Audio ambience, synthesized event motifs, a 12-voice cap,
node cleanup, visibility suspension, and an accessible mute toggle. No audio assets
or third-party media requests are required.
Validation: module syntax, production build, and the 32-test headless suite pass.
Audio playback remains gesture-gated and is covered by later browser lifecycle QA.

### 12 — Gated GitHub Pages release pipeline

Review needs: build once and deploy only tested output; protect PR runs from
deployment credentials; identify the published revision; document first-time setup.
Implemented: native → WASM/web → Pages job dependencies, artifacts, cache/toolchain
pins, least-privilege deploy permissions, revision metadata, public asset smoke
check, and development/release instructions. Deployment requires the repository's
one-time Pages source setting, which the connected API does not expose.
Validation: local native and WASM gates pass; workflow is pushed for Actions
verification. Public deployment verification waits for Pages enablement.

### 13 — Browser integration gate

Review needs: test actual worker startup and WebGL shader compilation; complete a
goal through UI controls; verify save reload and viewport fit; retain failure traces.
Implemented: production static test server with Pages subpath/MIME behavior,
desktop/phone Playwright scenarios, and a browser gate before artifact upload.
Validation: static checks and the headless logic suite pass. Local Chromium launch
is blocked by the workspace's socket restrictions; the identical browser suite
runs in the authorized GitHub Actions pipeline. Its results drive the next review.

### 14 — Continuous contact detection

Review needs: endpoint-only collision checks can miss fast debris crossing during
a substep; a fix must preserve nearby flybys and existing conservation behavior.
Implemented: closest-approach tests on the relative drift segment, without changing
the fixed timestep or allocating per-pair objects. Merged center-of-mass drift
remains compatible with subsequent contact checks in the same substep.
Validation: fast-impact and near-miss regressions, all 17 native tests, 20 campaign
fixtures, and native/WASM parity pass. GitHub Actions also passed all 8 browser
integration checks from iteration 13.

### 15 — Reproducible performance harness

Review needs: measure the real native/WASM cost before optimizing; exercise small,
medium, and maximum-size systems; separate compilation from measured simulation.
Implemented: deterministic 8/32/64-body fixtures, seven-sample native and WASM
benchmarks, median/max latency and tick throughput, and JSON reports (`npm run bench`).
Validation: the benchmark runs the same 2,048 fixed ticks on both targets. Timing
is reported rather than using flaky absolute shared-runner performance gates.

### 16 — Useful orbital inspection

Review needs: explain why a world satisfies or misses a goal; make all bodies
selectable without precise pointer input; show meaningful stellar information.
Implemented: keyboard-accessible body selector, mass/distance/eccentricity,
periapsis/apoapsis, orbital period, escape status, and stellar habitable-zone bounds.
Orbital period is computed in Rust, with independent Kepler-law regression tests.
Validation: 19 native tests and WASM parity pass; production web contracts pass.
The Pages release from iteration 13 passed its public revision and asset checks.

### 17 — Add view controls and reduced decorative motion

Review needs: Let players declutter dense systems, hide predictive guides, and honor reduced-motion preferences.
Implemented: Grid, trails, preview and decorative-motion controls, a camera reset, and an explanation of the two-body preview assumption.
Validation: Production build and static DOM/module checks pass; controls only affect presentation.

### 18 — Back up discoveries with portable experiments

Review needs: A replay alone cannot move earned discoveries to another device; imports must keep existing progress and preserve CLI-compatible raw replays.
Implemented: A versioned full backup format, explicit backup download, raw-replay compatibility, and progress merging only after Rust accepts the experiment.
Validation: Archive round-trip and compatibility tests pass with the complete Node suite and web build checks.

### 19 — Bound dense replay reconstruction work

Review needs: The 600-year cap alone still permits slow imports of dense systems and request timeouts.
Implemented: A deterministic 20-million pair-tick work budget, explicit exhausted state, replay work-limit validation, and a player-facing limit explanation.
Validation: Native budget and replay tests, production WASM build, and native/WASM parity pass.

### 20 — Improve control readability and touch targets

Review needs: Several regular labels and journal entries used undersized type, while mobile creation controls needed more vertical room.
Implemented: Fourteen-pixel primary labels, a twelve-pixel secondary floor, larger button targets, and a taller mobile sculpting panel with simplified canvas hints.
Validation: Production build and static web checks pass; the browser viewport suite remains a required release gate.

### 21 — Cover standard viewports and compact landscape layouts

Review needs: The viewport gate covered only two sizes, and short screens could overlap scene overlays or crowd the header.
Implemented: Seven desktop, tablet, phone and landscape configurations; document-height assertions; compact-screen overlay rules; smaller-screen branding and safe-area handling.
Validation: Production/static checks pass. The expanded 28-case browser matrix runs in GitHub Actions.

### 22 — Reduce worker serialization and paused traffic

Review needs: Playback serialized the full world twice per batch merely to inspect completion, and paused worlds emitted redundant snapshots.
Implemented: A compact WASM status flag API, thirty-Hz active snapshot publication, immediate completion updates, and no idle heartbeat traffic.
Validation: A real-WASM runtime regression proves stepping performs no full snapshot reads; native/WASM parity and controller tests pass.

### 23 — Protect active deployments during continuous iteration

Review needs: Canceling every prior main-branch run can interrupt Pages publication while frequent improvements are pushed.
Implemented: PR runs still cancel superseded work, while main-branch releases finish and only the newest pending main run is retained by Actions concurrency.
Validation: Workflow YAML parses and dependency/permission gates are checked; existing simulation and browser jobs remain deployment prerequisites.

### 24 — Cache render metadata and launch geometry

Review needs: Every animation frame repeated uniform lookups, orbital searches, body sorting, and unchanged launch-path trigonometry.
Implemented: Per-context uniform caches, per-snapshot orbit maps and drawing order, and launch geometry recomputed only when starting conditions change.
Validation: Web build, module contracts, and geometry tests pass; the browser gate compiles and exercises the renderer.

### 25 — Pin release actions to verified source revisions

Review needs: Mutable action tags can change the build environment independently of a game commit, undermining reproducibility.
Implemented: Verified immutable SHAs for every external action, readable version comments, and explicit Rust toolchain inputs when using pinned action revisions.
Validation: GitHub source refs were resolved directly; YAML parsing and a complete action-SHA audit pass.

### 26 — Make rewinds faithful and add placement undo

Review needs: Flattening later interventions into tick zero can exceed body limits and does not restore the original setup; experimenting also needs a simple undo.
Implemented: Core-owned rewind retaining only initial commands, atomic undo by replay reconstruction, a placement-undo control, and clearer help text.
Validation: Initial-setup fidelity, undo replay equivalence, empty-undo atomicity, native tests, and WASM/controller tests pass.

### 27 — Resolve collision chains to contact closure

Review needs: A late merger can grow into an earlier body after that pair was already checked, leaving an unresolved overlap at the end of a substep.
Implemented: Bounded repeated contact passes until no bodies merge, plus a last-substep three-body collision regression that checks momentum.
Validation: Collision-chain, near-miss, conservation, campaign, and WASM parity tests pass.

## Next review targets

Replay/import resource limits and deterministic generation; campaign solvability;
native/WASM parity; worker lifecycle; WebGL rendering; touch and keyboard control;
progression and save resilience; CI artifact gating and deployment; performance,
accessibility, edge cases, and regression coverage discovered during play.
