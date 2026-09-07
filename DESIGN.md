# Celestial Sculptor — living design

## Agreed direction

Grounded but forgiving orbital physics. Ten authored challenges plus sandbox.
2.5D orbital plane with a tiltable view. Desktop, tablet, and phone controls.
Rust → WebAssembly, WebGL 2, GitHub Actions, and GitHub Pages. Work is pushed to
`main` continuously. The initial 100 iterations are followed by the development
cycles recorded in [docs/DEVELOPMENT_CYCLES.md](docs/DEVELOPMENT_CYCLES.md).

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

Newtonian gravity in AU / years / solar masses, softened at 0.0001 AU in current rules (0.002 AU for version 1 replays). Contact
radii are enlarged to make formation visible on game timescales. Rules version 5
distinguishes gentle accretion, grazing survival and bounded disruption of solids;
stars and giants accrete. Unresolved spin accounts for angular momentum.
[Collision thresholds and limits](docs/COLLISIONS.md) are explicit gameplay
simplifications. Earlier replay versions retain their original contact behavior. Habitability checks entire osculating orbits against a stellar-mass
scaled zone, without simulating atmospheres or life. Fixed steps limit close-pass
accuracy; tests and explicit limits constrain the supported range. Native and
WASM results are tolerance-compared, not assumed bit-identical across platforms.

## Current implementation decisions

The shipped foundation uses small exact pairwise systems (64 bodies maximum),
not a heavyweight game engine. Rust keeps physics, mission predicates and replay
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

A replay is versioned configuration plus ordered tick-stamped commands. Versions 1–5
support 2,048 edits, 600 years and 20 million pair-tick work units. Reconstruction
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

## Review after iteration 110 — historical release plan

Implemented by development cycle 1 (iterations 111–119); the review below retains
its original findings and acceptance criteria as historical context.

Reviewed 2026-09-07 against `ff3b125`, which matches `origin/main`. Its GitHub
Actions run 34044553308 passed. The player reports 30 fps at rest and up to 60
while navigating; the supplied overlay shows a paused one-body system at DPR 2.
This supports keeping the present frame cadence and Rust / WASM / WebGL 2 stack.
The next release should help players understand an outcome, make a deliberate
change, and compare the result. This section is a plan, not completed work.

### Findings from source review and headless experiments

- Moon orbit controls mix reference frames. `Nudge` always uses the star's mass,
  position and velocity, even when the inspector shows an orbit around a planet.
  In the real WASM engine, a 0.003-Earth moon at 0.05 AU around a 318-Earth giant
  at 3 AU receives an impulse equal to about 41.8% of its moon orbital speed
  from the button labeled Boost 10%. The direction is also star-relative.
- The same nearly circular moon has eccentricity about 0.000006, but the shared
  `calm` predicate requires periapsis above 0.18 AU. The inspector consequently
  calls it eccentric and rounds its mass to 0.00 Earths. Moon orbital stability
  and stellar habitability need separate readings with appropriate units.
- Every successful command clears resonance observations. A WASM experiment
  with almost 160 years of measured libration loses its entire resonance track
  after changing only axial spin, which currently leaves orbital dynamics alone.
- Moon membership depends on its assigned `parent`. An unbound satellite is no
  longer counted as a moon, but its parent metadata continues to block planet
  tools. Captures by another planet are not classified. History and current
  orbital membership need distinct representations.
- The touch handler ends the entire gesture when one finger leaves a pinch;
  continuing with the remaining finger requires another touch. Mission 8's UI
  can also offer burns that the simulation rejects. These deserve focused
  interaction regressions, beyond viewport fit and successful button clicks.
- The 32-case native generator sweep still passes its finite-state checks.
  At 12 requested bodies, disorder 0.6 and 24 years, 3 of 8 nursery seeds have no
  mergers or ejections; the others yield at most two mergers and one calm formed
  world. Chaos produces zero to three mergers and no ejections in this sample.
  Calm systems remain calm and moon families retain all eight moons, as desired.
  These are measurements of one bounded sample, not universal generator claims.
- Resonance generation uses the same two planet masses, radii, phases and disk
  torque regardless of seed or disorder; seed changes their spin. Its current
  value is an authored demonstration, with limited variation.
- The notebook compares endpoint totals and requires manually saving the old
  run before branching. The resonance panel reports current values without a
  graph. The journal displays five recent events from a 24-event simulation
  buffer. The pieces exist, but following cause and effect takes too much work.
- Contacts always merge. More impact outcomes could add depth, but their value
  depends on players being able to see and compare what happened.

### Recommended delivery order

1. **Make moon observations and interventions trustworthy.** Introduce explicit
   host-relative burns for bound moons, with direction following their actual
   orbital motion. Show the reference body, burn strength and prograde/retrograde
   state. Separate moon orbit labels from stellar habitability, retain useful
   precision for small masses, and use days or local distances where clearer.
   Define loss, transfer and recovery of satellite membership without erasing
   origin history. Preserve resonance observations on purely rotational edits.
   Finish pinch-to-one-finger continuation and align visible controls with
   authoritative mission capabilities.

   Acceptance: renderer-independent prograde and retrograde moon burn cases at
   several phases; a circular moon never mislabeled solely due to small radius;
   escaped and transferred satellite cases; spin preserves an existing resonance
   track; browser checks for control availability and continuous touch gestures.
   Any change to command semantics or recorded outcomes requires a new replay
   rules version, with versions 1–3 retaining their existing behavior.

2. **Make encounters understandable and experiments easy to compare.** Add a
   compact event timeline with jump-to-before/after and optional pause or slow
   playback at major encounters. Preserve an original run automatically before
   branching. Show a selected body's mass, orbital size and eccentricity over
   time; add period-ratio and resonant-angle histories for a selected pair.
   Overlay the pre-encounter and post-encounter orbits in the appropriate frame.
   Compare branches at the same simulated age, with the changed conditions
   visible. On phones, use a compact inspector sheet so these additions leave
   enough room to watch and navigate.

   Acceptance: a player can inspect an impact, return to before it, change one
   condition and compare two preserved runs. Headless tests verify history across
   mergers, removed bodies, seeking and replay import. Histories have explicit
   sample and byte caps; analysis uses the worker and updates charts only when
   needed. Explain measured changes without claiming a definitive cause from
   just the strongest instantaneous gravitational pull.

3. **Build three strong challenge experiences around those tools.** Refine
   protecting a garden during accretion, timing a gravity assist, and keeping a
   moon family or resonant pair together. Give each a visible tradeoff, readable
   failure feedback, staged hints and optional mastery goals such as less matter
   or fewer interventions. Teach period ratio, observation time and libration
   before asking players to discover a resonance from an empty system. Keep the
   first two challenges short introductions.

   Acceptance: each revised challenge has multiple materially different winning
   command sequences, a plausible near miss, and regressions for cheap shortcuts.
   Measure time to first decision, first meaningful event and completion in
   simulated and playback time. Headless solvability is required; it does not by
   itself establish that the experience is understandable or fun.

4. **Make random systems produce varied, watchable stories.** Tune nursery and
   encounter generators using measured outcome distributions. Offer clear calm,
   active-formation and close-encounter choices, with a brief explanation of what
   to watch. Vary resonance starting conditions within tested families and show
   only settings that affect each style. Provide easy same-seed restart, change
   one parameter and save-this-system actions. Optional event-following should
   be interruptible immediately by manual camera input.

   Acceptance: expand the native sweep across star mass, body count, disorder,
   all five styles and longer observation windows. Report event timing, retained
   worlds, formation, escapes and resonance outcomes. Enforce explicit per-style
   expectations on a fixed validation set, with separate seeds to detect tuning
   that only works on the authored examples. Export every failing replay. Calm
   systems should not be forced to have destructive events.

5. **Expand collision outcomes after the observation loop works.** Prototype
   merging, grazing survival and a bounded debris-producing outcome, driven by
   encounter parameters. Begin with isolated headless collisions and tune the
   gameplay model before changing campaign rules. Track mass, material, linear
   and angular momentum, and the energy assigned to heat or dispersal. Define
   what happens at the body cap so fragmentation cannot erase unaccounted mass
   or create unbounded work. Surface the chosen outcome in the event inspector.

   Acceptance: tests cover head-on and grazing encounters, unequal masses,
   opposite orbital directions, replay parity and body-cap saturation. Add
   timestep-convergence checks for close passes and tight moons before extending
   the supported numerical range. Tidal locking and spin-orbit evolution are a
   later, separately tested physics milestone; current spin controls already
   support reversed rotation, but tides would change orbital dynamics and their
   momentum accounting.

### Performance and release requirements throughout

Keep the existing native → WASM → browser → exact-artifact Pages release path.
Add outcome and history checks to native/Node gates, preserving graphics-independent
verification. Grow browser coverage around real touch sequences and the complete
inspect / branch / compare workflow. Retain bounded all-pairs gravity at the
current system size; profile before changing the solver or renderer architecture.

Add reproducible on-device performance scenarios for a 64-body running system,
close moon tracking, simultaneous charts and navigation, and collision bursts.
Record frame-time percentiles and simulation throughput over sustained sessions,
with quality level, viewport, device and scenario seed. The target remains smooth
60 fps at High on modern iPhone/iPad hardware. Software-rendered CI timings should
not become a hardware-FPS gate; use deterministic payload, allocation, body and
history bounds in CI and device traces for frame pacing and thermal behavior.

The immediate implementation slice is item 1, followed by item 2 demonstrated
through one polished garden/encounter challenge. That gives the next changes a
concrete player journey and makes later generator and physics tuning reviewable.

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

### 28 — Fix terminal UI updates and landscape creation access

Review needs: The expanded browser matrix found a missed completion update after worker throttling and a launch button below the landscape panel viewport.
Implemented: Semantic state transitions bypass UI throttling; short landscape layouts place the primary launch action first. The existing failing browser cases remain unchanged.
Validation: Headless presentation regressions reproduce and cover the completion race; all Node tests and production checks pass. Actions reruns the 28 browser cases.

### 29 — Reuse CPU and GPU geometry buffers

Review needs: Dense trails rebuilt large JavaScript and typed arrays and reallocated GPU storage every frame.
Implemented: Fixed-capacity typed vertex streams, direct writes, reusable GPU buffers with subrange uploads, and explicit overflow guards.
Validation: Maximum-body trail/preview capacity and buffer-reuse tests pass, along with production module checks.

### 30 — Expose reproducible experiment seeds and transactional conditions

Review needs: Debris always used seed 42, and live state updates could overwrite a proposed stellar change while its confirmation was open.
Implemented: A validated full-range experiment seed control, seed identity in the scene, and captured condition overrides applied only after confirmation.
Validation: Seed boundary tests, all Node tests, production build, and DOM contracts pass. Thirty review iterations are complete; the requested loop continues to 100.

### 31 — Add seeded debris disks with controllable disorder

Review needs: A single narrow belt limits initial-condition experiments and makes formation outcomes repetitive.
Implemented: An authoritative SeedDisk command with radial width, body count, orbital-speed disorder, deterministic generation, atomic limits, and matter accounting.
Validation: Seeded disk evolution and replay equivalence, invalid-disk atomicity, native regression tests, and WASM parity pass.

### 32 — Expose disk formation controls in the game

Review needs: The new disk simulation needs understandable controls and a clear connection between orbital disorder and accretion.
Implemented: An unlocked disk-formation panel with center, width, fragment count, cost, and speed-disorder controls, plus real-WASM command-boundary coverage.
Validation: The new disk bridge test, complete Node suite, web build, and DOM contracts pass.

### 33 — Repair malformed campaign progress conservatively

Review needs: A corrupted profile could display later discoveries without their prerequisites, and oversized local profile data had no explicit bound.
Implemented: Canonical contiguous completion prefixes, bounded profile reads, duplicate cleanup, and preservation of all valid early achievements.
Validation: Progression, archive compatibility, and corrupt-profile regression tests pass.

### 34 — Record the causes of each experiment in its journal

Review needs: The journal still said the star was waiting after worlds were placed, obscuring the relationship between setup and outcome.
Implemented: Authoritative placement and disk/belt seeding entries with distances and speeds, retained through replay and bounded to 24 events.
Validation: Journal bounds and replay identity tests pass alongside native and WASM scenario suites.

### 35 — Show authoritative progress for each goal requirement

Review needs: Multi-part challenges did not show whether world count, giant count, or habitability was preventing success.
Implemented: A fixed-size Rust objective set used directly to evaluate goals and a live requirement checklist in the mission panel, with no per-tick heap allocation.
Validation: All authored winning/losing scenarios and a three-part final-goal regression pass; WASM parity and web contracts pass.

### 36 — Add budgeted orbital nudges as replayable interventions

Review needs: Players could only add bodies after starting a run; rescuing or deliberately destabilizing an orbit needs a controlled physical intervention.
Implemented: Validated radial/tangential velocity nudges costing one matter, advanced-tool unlocks, body-target checks, motion-direction handling, and journal/replay support.
Validation: Velocity, mass, position, replay, invalid-target and atomicity regressions pass with native and WASM suites.

### 37 — Let players rescue or destabilize inspected orbits

Review needs: Orbital nudges need clear player controls, and simultaneous radial/tangential components should respect the advertised total impulse limit.
Implemented: Contextual speed/inward/outward nudge controls, one-matter cost labels, total-vector impulse validation, and generalized edit undo wording.
Validation: Impulse-boundary native tests pass; browser coverage now nudges a real world and undoes the edit; production and Node checks pass.

### 38 — Preserve recoverable saves under corruption and quota pressure

Review needs: A corrupt primary could overwrite the last good backup, and backup quota failure prevented a fresh primary save.
Implemented: Validate the previous snapshot before rotation and isolate optional backup writes from primary saving.
Validation: Storage regressions verify corrupt-primary recovery and a full backup quota without losing the new primary.

### 39 — Release pending actions immediately when the worker fails

Review needs: Fatal worker errors left actions waiting fifteen seconds and accepted more work after failure.
Implemented: Extract a bounded request channel with synchronous-post error cleanup, out-of-order matching, timeout disposal, and fatal shutdown.
Validation: Three channel tests cover response ordering, worker death, post failures and timeouts; app syntax checked.

### 40 — Compare advanced interventions across native and WebAssembly

Review needs: Existing campaign parity fixtures predated variable-width disks and orbital burns.
Implemented: Replay timed disk formation, burns and giant placement at three stellar masses through both actual engines; verify reimport is exact.
Validation: Three advanced native/WASM parity cases pass, including event equality and position/velocity tolerances.

### 41 — Test gravity against coordinate and moving-frame symmetries

Review needs: Energy tests alone can miss axis-specific forces or accidental use of absolute star coordinates.
Implemented: Add independent rotation and Galilean-invariance tests for evolving three-planet systems and orbital diagnostics.
Validation: Native symmetry tests pass after two years in rotated, translated and uniformly moving frames.

### 42 — Verify stellar recoil and stability at the playable extremes

Review needs: The common one-AU test did not cover the fastest permitted orbit or verify that the star actually reacts.
Implemented: Check barycenter motion against conserved momentum and run circular systems at both stellar-mass and launch-radius limits.
Validation: Eight physics tests pass, including two-orbit stability at 0.25 and 6 AU and an independently predicted moving barycenter.

### 43 — Hide misleading orbit previews while conditions are invalid

Review needs: Clearing a number field silently converted it to zero, drawing an invalid preview during editing.
Implemented: Validate launch fields before unit conversion and show the field-specific correction while suppressing invalid geometry.
Validation: Boundary, empty-field, nonfinite and type tests pass; app syntax checked.

### 44 — Give journal events stable identities within each experiment

Review needs: Tick, event kind and body were insufficient to distinguish repeated edits on a paused world.
Implemented: Assign deterministic monotonic event IDs while retaining only the latest 24 journal entries.
Validation: Fifty same-tick interventions remain distinct, bounded and exactly reproducible through replay.

### 45 — Keep reconstructed history silent and bound event tracking

Review needs: Imports and rewinds could replay old sound effects, while heard-event memory grew with session activity.
Implemented: Version worker timelines and replace the event set with a constant-space cursor; add disk and burn motifs to real event playback.
Validation: Actual-WASM timeline-generation tests and cursor tests cover failed imports, rewinds, duplicate snapshots and new events.

### 46 — Clear visual history when an experiment timeline changes

Review needs: Same-tick undo or import could connect an old path to a different world with the same body ID.
Implemented: Update trail history using timeline generations, prune removed bodies even while paused, and clear vanished selections.
Validation: Trail regressions verify same-tick replacement, deletion, paused duplicates and the 192-point bound.

### 47 — Remember display preferences and offer lower GPU resolution

Review needs: Display choices disappeared on reload and high-density devices always rendered at double resolution.
Implemented: Persist validated display settings and add a battery-saver resolution choice while respecting the initial system motion preference.
Validation: Preference tests cover malformed values, motion overrides, unavailable storage and resolution round trips; static build checks pass.

### 48 — Reduce idle and hidden-tab rendering work

Review needs: The renderer drew every display refresh while paused, including 120-Hz screens, despite a separate fixed-step simulation.
Implemented: Cap active rendering at 60 FPS, battery mode and paused scenes at 30, reduced-motion idle scenes at 15, and skip hidden frames.
Validation: A synthetic 120-Hz clock verifies all four frame budgets and immediate visibility recovery.

### 49 — Add reproducible sandbox starting points with verified outcomes

Review needs: A blank sandbox provided little guidance for discovering formation, stellar escape and giant interactions.
Implemented: Define four data-driven initial-condition recipes and test their promised outcomes directly in native Rust.
Validation: Quiet garden, crowded nursery, distant giant and wanderer recipes exhibit their stated behavior after four simulated years and replay exactly.

### 50 — Make sandbox starting points playable and editable

Review needs: Verified recipe data needed a discoverable in-game entry point and safe replacement of an existing experiment.
Implemented: Add a sandbox recipe picker that imports ordinary editable commands, preserves the chosen seed, confirms replacement, and autosaves.
Validation: Build and DOM checks pass; a real-browser recipe selection regression joins the seven-viewport CI suite.

### 51 — Bound command-line replay reads and clarify invocation errors

Review needs: The headless CLI read an entire file before enforcing its size limit and silently ignored extra arguments.
Implemented: Limit reads to one byte beyond the import cap, reject ambiguous arguments, and provide discoverable help.
Validation: Process-level CLI tests verify help, exit failures, missing and extra arguments, oversized files and malformed replays.

### 52 — Expose authoritative tool costs and remaining editing capacity

Review needs: The interface duplicated unlock thresholds and could only discover budget or capacity errors after submitting an action.
Implemented: Publish fixed-size tool availability plus body and command capacity directly from Rust status.
Validation: Campaign tests verify starting unlocks, giant cost, budget depletion and capacity changes after eight accepted commands.

### 53 — Explain unavailable placements before the player submits them

Review needs: Players could repeatedly attempt unaffordable placements without an explanation until the worker rejected them.
Implemented: Drive launch availability from Rust tool metadata, explain depleted matter or edit/body limits, and disable unaffordable nudges.
Validation: Guidance tests cover each resource limit and unlocked state; DOM and syntax checks pass.

### 54 — Reject malformed playback input without poisoning the worker clock

Review needs: A nonfinite elapsed sample permanently made tick debt NaN, and string playback values were silently coerced to true.
Implemented: Ignore invalid clock samples, require a boolean play state, and report null protocol messages as ordinary errors.
Validation: Actual-WASM runtime tests verify unchanged state after invalid samples and successful advancement afterward.

### 55 — Name dialogs and expose active modes to assistive technology

Review needs: Dialogs relied on visual headings without accessible names, and active mode and panel states were conveyed only by color.
Implemented: Connect dialog labels, expose pressed states for mode and panel controls, and extend the static gate to detect broken accessible references.
Validation: The expanded DOM contract check passes for all labels, descriptions and control targets.

### 56 — Keep body inspection and orbital edits usable without WebGL

Review needs: The body list depended on renderer-owned selection, so graphics failure unnecessarily disabled otherwise independent game interactions.
Implemented: Own selection in the app and provide a clear graphics-failure message while keeping the worker and all form controls available.
Validation: Static checks pass; a CI browser regression disables WebGL and exercises real WASM placement, inspection, nudge and stepping.

### 57 — Fingerprint every deployable application asset

Review needs: Revision metadata identified a build but did not prove that its worker modules and WASM bytes belonged to that build.
Implemented: Emit a sorted SHA-256 and size manifest for all runtime assets, and verify it in the local and CI static gate.
Validation: A fresh WASM build passes complete asset integrity comparison.

### 58 — Verify every published module against the tested artifact

Review needs: A successful HTTP response could still serve a stale worker, mixed release, or wrong WASM MIME type.
Implemented: Verify the deployed revision, required asset set, file sizes, SHA-256 hashes and WASM content type with bounded parallel requests and CDN retries.
Validation: Offline publication tests reject stale revisions, altered module bytes, missing workers and invalid WASM serving types.

### 59 — Track simulation and snapshot costs in every successful CI build

Review needs: Performance measurements were manual and did not expose the cost of preparing worker snapshots.
Implemented: Benchmark serialization and parsing alongside native/WASM stepping, publish machine-readable results, and add a compact Actions summary.
Validation: Eight-, 32- and 64-body benchmark cases produce finite timings and bounded snapshot sizes; performance remains informational rather than a flaky absolute gate.

### 60 — Retain orbit preview geometry across live availability updates

Review needs: Refreshing authoritative placement availability recreated identical preview vertices several times per second.
Implemented: Cache analytic preview paths by distance, angle and speed, independent of body color and live status.
Validation: One thousand unchanged drafts reuse the same geometry; changed and invalid drafts invalidate it correctly.

### 61 — Run the physics engine in Chromium Firefox and WebKit

Review needs: Node and Chromium parity did not exercise the other major browser WebAssembly engines.
Implemented: Add Firefox and WebKit engine projects using real compiled WASM, with all sandbox recipes and exact replay reconstruction.
Validation: Browser configuration and spec syntax pass locally; the expanded Actions gate installs and runs all three browser engines.

### 62 — Save edits promptly and preserve requests arriving during a save

Review needs: A quick reload could lose the latest edit, and save requests made while an export was pending were dropped.
Implemented: Debounce successful edits into a 250-ms save and serialize overlapping save work with one coalesced successor.
Validation: Scheduler tests verify no concurrent writes, bounded coalescing, latest-request preservation and recovery after failure.

### 63 — Expose outcome totals and verify where removed matter goes

Review needs: The bounded journal eventually hid older outcomes, and stellar absorption and escape needed explicit mass-ledger regressions.
Implemented: Publish lifetime collision, escape and absorption totals in status and independently test retained plus escaped mass.
Validation: Native tests confirm an absorbed world increases stellar mass while an escaped world is accounted for separately.

### 64 — Give sandbox play its own guidance and persistent outcome totals

Review needs: Sandbox text asked players to meet a nonexistent goal, while old collisions disappeared from the short journal.
Implemented: Use mode-aware guidance, hide sandbox goal progress, and show lifetime mergers, escapes and stellar impacts.
Validation: Guidance tests cover empty and active sandbox, held conditions, completion and exhaustion; DOM checks pass.

### 65 — Exercise graphics loss and recovery without interrupting physics

Review needs: Context restoration could throw an uncaught shader or allocation error, and recovery had no browser regression.
Implemented: Keep restoration failures contained with an export-first recovery message; exercise live context loss, continued stepping and restoration in CI.
Validation: Renderer and browser spec syntax pass; the real-browser regression verifies world count and time survive loss and recovery.

### 66 — Keep sound state accurate when browser audio activation fails

Review needs: Rejected audio resume left the sound toggle claiming it was enabled, and rapid clicks could overlap transitions.
Implemented: Commit the enabled state only after successful audio activation and serialize UI toggles while testing voice disposal and limits.
Validation: Audio lifecycle tests cover blocked activation, recovery, visibility suspension and the twelve-voice resource cap.

### 67 — Clarify orbital burn strength and test moving-frame directions

Review needs: Burn labels implied a percentage of current speed even though impulses use local circular speed; radial and retrograde cases lacked coverage.
Implemented: Explain the burn reference speed and verify radial direction after orbital motion, retrograde boosts, unlocks and exact budget exhaustion.
Validation: Six native burn tests pass, including atomic rejection after the final matter unit is spent.

### 68 — Provide recovery for failed or stalled worker startup

Review needs: Worker construction errors escaped the app and a stalled WASM download could leave the loading screen indefinitely.
Implemented: Catch startup failure, bound initialization time, release pending requests, disable dead controls, and present a reload action.
Validation: Static checks pass; a browser regression injects worker construction failure and verifies visible recovery without uncaught errors.

### 69 — Export self-contained bug reports for headless reproduction

Review needs: A report of unexpected behavior lacked the exact commands and build context needed to reproduce it independently of graphics.
Implemented: Add an explicit help action exporting an import-compatible backup with revision, browser, viewport and display settings.
Validation: Report tests prove reproduction metadata is retained and the same file still restores the experiment and discoveries.

### 70 — Isolate browser-specific launch configuration after CI feedback

Review needs: CI passed 56 cases but Firefox and WebKit inherited the global Chromium channel; undefined overrides did not clear Playwright defaults.
Implemented: Move Chromium channel and GL options into Chromium projects only and add a configuration regression against cross-engine leakage.
Validation: Configuration regression passes and Playwright discovers the complete matrix without launching a browser locally.

### 71 — Reproduce portable backups and bug reports directly in the CLI

Review needs: The new report carried a replay but required manual JSON extraction before headless reproduction.
Implemented: Teach the CLI to unwrap versioned backups and reports with a bounded 600-KB document read, retaining the raw replay limit.
Validation: Process-level tests execute an exported report and reject unsupported backup versions and oversized documents.

### 72 — Pause experiments while the player decides whether to replace them

Review needs: Time and outcomes continued changing behind replacement confirmations, and asynchronous callback failures were not consistently contained.
Implemented: Pause before confirmation, resume the same visible timeline on cancellation, serialize confirmations and contain callback errors.
Validation: Static checks pass; a browser regression checks a frozen tick during confirmation and resumed playback after cancellation.

### 73 — Normalize wheel units and ignore extra fingers during camera gestures

Review needs: Line-mode mouse wheels zoomed much more slowly than pixel devices, and a third touch could unexpectedly move the launch draft.
Implemented: Normalize wheel deltas before applying bounded zoom and reserve all multi-touch input for the active camera gesture.
Validation: Input tests compare equivalent pixel, line and page gestures, reverse motion, nonfinite samples and large-delta bounds.

### 74 — Commit reset presentation only after the simulation accepts it

Review needs: The app changed mission and control state before reset validation, so a rejected configuration could leave stale presentation.
Implemented: Build reset configuration transactionally, await authoritative acceptance, and restore current controls on failure.
Validation: DOM checks pass; a browser regression submits an invalid stellar mass, verifies control recovery, and then successfully places a world.

### 75 — Catch stale builds and missing module dependencies before browser tests

Review needs: Syntax and entrypoint checks could pass while a newly imported module was absent or dist still contained older source files.
Implemented: Verify every source asset matches the build and resolve literal module, worker and fetched-data references inside the artifact.
Validation: Dependency-reference tests and a fresh complete build pass the strengthened static gate.

### 76 — Verify a dense experiment can reach its real work limit and replay

Review needs: The work-cap regression set the counter manually and did not prove a naturally exhausted run remained exportable.
Implemented: Advance a 64-body system to exhaustion, reconstruct its full replay, reject an extra tick, and verify further stepping is inert.
Validation: The real bounded-work regression passes without modifying simulation counters or relying on wall-clock thresholds.

### 77 — Stop batch advancement immediately at the experiment limit

Review needs: The natural-exhaustion test exposed billions of no-op step calls after the work limit when native callers requested a very large batch.
Implemented: Break the batch loop as soon as the experiment is exhausted, preserving state while bounding actual execution work.
Validation: The unchanged u32::MAX batch and replay regression passes with early termination; all workspace tests pass.

### 78 — Publish representative game screenshots for release review

Review needs: Passing geometry and interaction checks did not give reviewers a convenient view of the actual rendered release.
Implemented: Capture deterministic paused desktop and phone systems through real UI commands and retain the images as CI artifacts.
Validation: Preview test syntax and browser discovery pass; screenshots are captured in the authorized CI browser environment.

### 79 — Let players set and retain a comfortable sound level

Review needs: Opt-in sound had a fixed output level and no way to adjust it independently of device volume.
Implemented: Add a remembered volume control with smooth gain changes, clamped input and no automatic audio activation.
Validation: Audio and preference tests cover pre-activation volume, bounds, malformed gains and muted settings; fresh build checks pass.

### 80 — Preview disk boundaries and explain formation limits

Review needs: Individually valid disk fields could combine into an invalid radial span or exceed remaining body capacity.
Implemented: Show the whole disk range, validate combined conditions before submission, and explain matter, action and body limits from Rust status.
Validation: Disk guidance tests cover edge overlap, empty fields, exact capacity and budget boundaries; build checks pass.

### 81 — Provide one command for the complete graphics-independent verification loop

Review needs: Contributors had to remember several commands and could accidentally skip native rules, WASM parity or artifact checks.
Implemented: Add npm run verify with fail-fast formatting, lint, native tests, build, static contracts and Node tests; document play and local startup.
Validation: The complete documented headless verification command passes from the repository root.

### 82 — Detect toolchain and release metadata drift before building

Review needs: Rust, npm, the binding generator and CI repeated version pins that could diverge during maintenance.
Implemented: Validate application versions, Rust pins, exact wasm-bindgen CLI compatibility and immutable Actions references; lock CI lint dependency resolution.
Validation: The new contract verifier and a fresh build pass with the installed generator and checked-in lockfiles.

### 83 — Generate multi-body histories with timed edits for replay testing

Review needs: The original property test used one launch and did not explore sequences of evolving worlds and orbital interventions.
Implemented: Generate up to nine timed placements and burns across 64 seeded cases, then verify finite outcomes and exact JSON replay reconstruction.
Validation: All generated stateful histories pass; the failing seed would be retained by proptest if a regression is found.

### 84 — Measure actual orbital return times against Kepler predictions

Review needs: The prior period test checked the diagnostic formula but did not independently measure an integrated orbit.
Implemented: Detect interpolated returns across the initial direction for 18 circular and elliptical systems across radii and stellar masses.
Validation: Measured simulation periods agree with independent Kepler predictions within 0.1 percent in every supported case.

### 85 — Check that repeated dense experiments do not keep growing the WASM heap

Review needs: Correct replay outputs did not establish that repeated resets, imports and freed simulations released their allocations.
Implemented: Exercise 160 dense simulation lifecycles with actual WASM and compare heap size after allocator warmup.
Validation: Imports, snapshots, rewinds, undo and free operations remain within one WASM page of the warmed heap size.

### 86 — Serialize worker snapshots directly from borrowed simulation data

Review needs: Snapshot benchmarks showed avoidable allocation and copying from constructing a complete intermediate JSON value tree.
Implemented: Use a typed borrowing snapshot serializer, retaining only the small derived orbit list instead of cloning every body and event into JSON values.
Validation: Actual-WASM parity, lifecycle and full Node suites pass; native/WASM and snapshot benchmarks complete with the new serializer.

### 87 — Prevent structurally valid corrupt saves from poisoning recovery history

Review needs: A primary could pass shallow JSON checks while containing invalid physics configuration and still overwrite the good backup.
Implemented: Rotate only a primary successfully written by this session, leaving the existing recovery snapshot intact when disk contents are untrusted.
Validation: Storage regressions cover semantically invalid JSON, successful subsequent rotation and the earlier quota/corruption cases.

### 88 — Fail browser tests on uncaught errors throughout each interaction

Review needs: The original browser error check inspected only startup, allowing later event-handler failures to pass unnoticed.
Implemented: Use a shared browser fixture that captures and asserts uncaught application errors after the full test, including fallback and cross-engine flows.
Validation: Playwright discovers all tests with the shared fixture; coverage now spans the entire interaction lifetime.

### 89 — Use the exact angular domain in generated histories after lint feedback

Review needs: CI correctly rejected an approximate full-turn constant introduced by the new property generator.
Implemented: Use the standard TAU constant so generated angles cover the exact full circle and satisfy the required lint gate.
Validation: Workspace formatting and warning-free Clippy pass, followed by the generated multi-body replay test.

### 90 — Move notifications away from phone creation controls after visual review

Review needs: Actual CI screenshots showed a narrow toast obscuring the phone placement button and its label.
Implemented: Anchor notifications inside the orbital scene, allow a readable width, keep pointer input available, and wait for transient notices before review screenshots.
Validation: Fresh build and static checks pass; a browser regression checks notification placement against the actual scene bounds.

### 91 — Catch undefined design tokens before they silently lose styling

Review needs: The recipe heading referenced an undefined gold token, silently falling back to ordinary text color.
Implemented: Use the established amber token and add a stylesheet contract that catches missing custom properties while allowing explicit fallbacks.
Validation: Token regression tests and the full static build contract pass.

### 92 — Complete the project license and align package metadata

Review needs: The Rust workspace declared MIT licensing but the public repository lacked the corresponding license file and npm metadata.
Implemented: Add the declared MIT license, align npm and lockfile metadata, and extend the release contract to detect license mismatches.
Validation: The metadata contract passes and the license is linked from the project README.

### 93 — Expose orbital and conservation diagnostics in headless replay output

Review needs: The CLI reproduced body state but required callers to reimplement diagnostics to understand an unexpected orbit.
Implemented: Report per-body orbital elements, tick, energy, momentum, angular momentum, retained/escaped mass and work usage with replay output.
Validation: Process-level CLI tests verify useful orbital classifications and conservation metadata from a real evolved replay.

### 94 — Prevent held shortcuts from spending matter repeatedly

Review needs: Key repeat could place many worlds or toggle playback repeatedly, and scene shortcuts lacked an end-to-end regression.
Implemented: Ignore repeats for placement, playback and rewind while retaining continuous arrow adjustments; document the keyboard controls in help.
Validation: Fresh build checks pass; a browser regression covers focused-field isolation, arrows, placement repeat suppression and playback shortcuts.

### 95 — Verify the public directory URL serves the exact tested game

Review needs: The expanded asset verifier checked index.html directly but no longer proved the user-facing directory URL served the same entrypoint.
Implemented: Hash the public root response as well as individual assets, catching stale default documents or misdirected entrypoints.
Validation: Publication tests now reject an incorrect root page even when every named asset is otherwise correct.

### 96 — Gate release payload growth with explicit performance budgets

Review needs: Runtime benchmarks did not prevent accidental bundle growth from slowing first load on phones.
Implemented: Add deterministic total, WASM and JavaScript byte budgets to the static gate and document how to review deliberate increases.
Validation: Budget boundary tests pass; the current release is approximately 383 KB uncompressed with a 285-KB WASM module.

### 97 — Attach a machine-readable release inventory after the test gates

Review needs: Reviewing a successful build required piecing together its revision, toolchain, content and payload from several logs.
Implemented: Generate a release inventory from the actual WASM mission catalog and built assets, publish it as an artifact, and summarize it in Actions.
Validation: The report command lists the current tested-build metadata, ten challenges, four recipes and verified payload sizes.

### 98 — Document the complete release runbook and distinguish dirty local builds

Review needs: The contributor guide lagged behind the three-browser pipeline and local build reports could be mistaken for exact committed releases.
Implemented: Record dirty-source provenance in builds/reports and update architecture, replay limits, test layers, artifacts, deployment and rollback instructions.
Validation: Fresh build, metadata/static checks and portable-report tests pass with the updated provenance fields.

### 99 — Validate JavaScript numeric and payload boundaries before simulation work

Review needs: The generated u32 bridge silently truncated fractional and nonfinite tick values, while configuration and command JSON lacked their own small input caps.
Implemented: Validate finite integral tick counts explicitly and bound configuration/command payloads before parsing.
Validation: The complete headless verification passes, including atomic rejection of negative, fractional, nonfinite and oversized inputs through actual WASM.

### 100 — Audit the complete 100-iteration foundation and release gates

Review needs: The final handoff needed a machine-checkable record that every requested iteration included review, implementation and verification.
Implemented: Add a continuous numbered-history audit to local verification and CI, record the completed scope and future expansion boundaries, and run the full release checks.
Validation: All 100 review records pass the audit; formatting, Clippy, native tests, actual-WASM/Node tests, artifact contracts and performance benchmarks pass locally. GitHub Actions repeats the browser and deployment gates for this commit.

## Next review targets

The 100-iteration foundation is complete. Optional later expansions include
inclined three-dimensional orbits, an in-game mission editor, and larger systems
with separately benchmarked spatial acceleration.
Future changes should preserve the headless-first verification contract, review
saved-replay compatibility, and retain the exact-artifact Pages release path.

### 101 — Mutual gravity, growing impacts, moons and reversible rotation

Review needs: make mutual gravity consequential and prove it without graphics;
correct order-dependent merger types; support satellites and retrograde motion;
keep existing experiments reproducible as physical contact precision improves.
Implemented: custom bounded Earth masses, conserved rock/ice/gas composition,
impact mass/radius/energy/orbit evidence, moon placement inside a conservative Hill
limit, signed orbital speeds, and independent axial spin. Version 2 uses 0.0001 AU
softening and 0.002 AU Earth reference contact radii so moons fit inside Hill regions.
Every body still attracts every other body, including the reacting star. Version 1
imports retain their original radii, softening and merger classification. Display
sizes remain exaggerated; the model is planar and mergers remain inelastic.
Validation: 55 native tests pass, including 20-year prograde/retrograde moon survival,
causal neighboring-body perturbation, collision volume/momentum/orbit checks and
old-executable replay fixtures. Clippy is clean; actual WASM tests verify impacts,
moons and reverse spin as well as the existing native/WASM parity suite.

### 102 — Readable worlds, close-up navigation and device frame timing

Review needs: show merger growth and changed orbits; replace tiny generic planets;
make navigation deliberate on mouse and touch; inspect moons at their own scale;
measure actual rendered frames on the device instead of assuming 60 fps.
Implemented: radius-proportional bodies, lit procedural terrain/oceans/clouds/ice,
banded ringed giants, star-relative lighting, impact heat and expanding debris,
selected osculating orbits and neighboring-pull readings. Drag pans by default;
placement is explicit. Pointer-anchored wheel zoom, moving pinch centers, inertial
pan, body follow, Fit, keyboard navigation and moon-scale zoom share tested camera
math. Added custom mass, orbital direction, moon and independent spin controls.
The View toggle and ?fps=1 show rendered FPS, p95 interval, draw CPU time and tick
throughput. Rendering interpolates worker snapshots; buffers remain bounded.
Validation: headless camera, radius-growth, orbital geometry and frame-meter tests
pass. Browser tests exercise navigation without accidental edits, moon controls and
the URL flag. Mobile statistics occupy a separate strip; the release browser matrix
and screenshots review real shader compilation and standard viewport control fit.

### 103 — Formation, seeded universes and observable resonance

Review needs: challenges must depend on interaction and history; offer systems to
watch, including moons and resonant capture; preserve old saves; reduce CPU cost
without changing physical outcomes or weakening cross-target verification.
Implemented: a five-mission formation chapter with accretion, an undamaged garden,
a giant's inner nursery, initially bound gravity-assisted escapes and moon survival.
Later missions combine formation/habitability/moons and observed resonant angles.
Near period ratios remain candidates until a bounded angle reverses over at least
eight outer orbits. Sandbox disk migration provides an explicit dissipative path
into resonance; a gas momentum ledger distinguishes this from closed N-body motion.
Added five seeded generator styles, nine recipes, clickable journal events and
condition-specific clues. Version 3 preserves version 1/2 initialization and goals;
shared libm math removes native/WASM trigonometric drift in chaotic seeded fixtures.
Reused gravitational accelerations reduce eight pairwise evaluations to five per
tick; non-moons now avoid unnecessary parent searches.
Validation: 44 winning/losing campaign fixtures pass native/WASM trajectory and exact
event comparisons. Tests distinguish ratio coincidence from libration, cover a
160-year resonant pair and migration capture/control, reject formation stacking and
slingshot exploits, and replay generated systems. A 32-case seeded outcome sweep
runs headlessly in CI. Browser coverage adds generation and formation tool wiring.

Disk migration is a prescribed drag/torque model, not a hydrodynamic gas simulation.
The resonance detector is an observational first-order, coplanar, prograde diagnostic;
it does not prove permanent capture or cover every resonance family. Its resonant
angle convention follows [celmech's numerical resonance models](https://celmech.readthedocs.io/en/latest/numerical_resonance_models.html).

### 104 — Named experiments, timeline checkpoints and outcome comparisons

Review needs: autosave alone cannot preserve experiments for comparison; players
need to revisit earlier conditions and try a variation without losing a saved result.
Implemented: a bounded 12-entry notebook with names, portable replay export, physical
outcome summaries, two-run comparison tables and explicit open/fork actions. Worker
history review reconstructs any recorded tick using authoritative commands, retains
the full source while moving backward/forward, and branches on successful edits or
resumed playback. Storage quota failures give an export path; imports never trust
saved summary values for simulation or progress. Notebook controls pause time.
Validation: actual-WASM history tests verify exact return to the original endpoint,
removal/restoration of later placements, branch commands and atomic rejection of
invalid seeks. Notebook tests cover persistence, physical comparisons, corrupt data
and capacity/storage failures. The browser regression saves, compares, reviews,
forks and reloads checkpoints through the worker and local storage.

### 105 — Smooth close-up cameras and bounded rendering work

Review needs: following used unsmoothed worker positions; large sprites hit hardware
point-size limits; RAF jitter could unnecessarily skip frames; moon guidance and
star selection needed coverage as controls became more capable.
Implemented: camera tracking, planet motion and hit testing share interpolated body
positions. Camera transitions follow moving targets; Fit and zoom animate, manual
navigation cancels old motion. Instanced WebGL 2 quads replace size-limited points
while retaining three scene draw calls and reusable buffers. Tiny distant worlds
skip expensive surface noise. A phase-based render clock tolerates RAF jitter and
supports 60/120-Hz displays. Moon guidance updates with mass/host limits, unsupported
slingshot burns are hidden, star selection is safe and gravity readings use the
correct replay softening. FPS data includes camera/DPR/body counts in bug reports;
returning from the background clears obsolete frame samples.
Validation: 117 headless tests pass, including smooth tracked positions, wrapped
rotation, jittered 60/120-Hz cadence, moon-region validity and safe star inspection.
The 64-body WASM benchmark improved from 289.7 to 191.8 ms per 2,048 ticks on this
x86_64 machine (34% less simulation CPU time); snapshots cost about 259 microseconds.
These are CPU measurements, not an iPhone/iPad GPU frame-rate claim. Browser release
checks compile the new shaders and capture moon-scale and notebook screenshots;
on-device ?fps=1 remains the way to establish actual Apple-device performance.

### 106 — Complete the interaction review and release runbook

Review needs: hiding direct placement also hid Undo in formation missions; the moon
challenge required unnecessary navigation to its own tools; removed bodies left
some journal entries without a location; contributor guidance lagged behind the
expanded scenario and device-performance workflow.
Implemented: Undo remains available independently of placement, the moon challenge
selects/follows its giant and opens moon creation, and resonance generation starts
at 16× so capture can develop within a short watching session. The speed control
tracks worker state. Version 3 journal entries retain positions after escape or
stellar absorption, allowing camera focus on historical outcomes. Updated the
release runbook with 44 campaign fixtures, 32 seeded sweeps and a repeatable real
Apple-device performance procedure.
Validation: the full graphics-independent gate passes: formatting, Clippy, native
physics/campaign/replay tests, release WASM build, artifact checks and 118 Node tests.
The new event regression verifies a removed escaping body's location and exact
reconstruction. Browser coverage verifies Undo through the formation UI; the final
release continues through shader, interaction, viewport and exact-artifact Pages gates.

### 107 — Make satellite resonance directly explorable

Review needs: the resonance detector supports moons, but players lacked an authored
satellite example and moon phase/speed controls for constructing their own variations.
Implemented: Clockwork moons, a 2:1 satellite pair with a focused giant camera;
starting-point metadata selects useful playback speeds and opens resonance readings.
Moon creation now exposes initial angle and speed independently of orbital direction
and axial spin. Existing moon-family starting points also focus their host.
Validation: the satellite pair develops observed libration by four years in actual
WASM and keeps both moons bound with a bounded angle through 40 years in the native
recipe gate. Its saved commands reconstruct the same outcome. Browser engine tests
verify satellite libration in Chromium, Firefox and WebKit using the shared recipe.
The phone browser profile now uses DPR 3 and the tablet DPR 2; the performance
regression checks the high-quality canvas cap of DPR 2. These exercise retina
coordinate/rendering paths without presenting CI emulation as physical hardware.

### 108 — Correct satellite visibility after reviewing rendered artifacts

Review needs: actual close-up screenshots showed the exaggerated giant covering
its inner satellites. Inertial trails also obscure local orbital motion, and the
notebook's expanded timeline pushed saved-checkpoint feedback below the phone fold.
Implemented: smoothly taper radius exaggeration to near physical proportions at
satellite scale while preserving overview styling and collision volume growth.
Following a host uses parent-relative moon trails and up to eight local orbit guides;
individual body focus still offers a detailed globe. All guides fit an explicitly
bounded line allocation. Notebook save feedback appears immediately below Save;
timeline review is expandable. Timing resets on history replacement so imported
years cannot inflate reported tick throughput.
Validation: 123 headless tests pass, including giant-versus-inner-moon screen geometry,
parent-relative trails and parent changes, worst-case guide/impact buffer capacity,
and timing from a restored checkpoint. Release 106 passed the full browser and
Pages gates; its desktop/phone moon and notebook screenshots directly motivated
these corrections. The updated release repeats those screenshots and retina checks.

### 109 — Repair the nested moon-control browser regression

Review needs: release 107's browser run matched both Create a moon and the newly
nested Orbit phase & speed summary, making the existing strict selector ambiguous.
Implemented: target the moon panel's direct summary explicitly, preserving the full
retrograde-moon and independent-spin interaction test across all seven viewports.
Validation: release 107's other 160 browser checks passed, including native-WASM
satellite resonance in all three engines and retina FPS/DPR checks. The failure was
isolated to this duplicate selector in each viewport. The corrected test and the
satellite-visibility changes run through the unchanged full release gates.

### 110 — Keep unresolved satellites visible on retina displays

Review needs: the corrected satellite-scale screenshots exposed the real tiny
moons, but their subpixel shaded disks were difficult to pick out against orbit
lines. Physical proportions should not make moving satellites disappear visually.
Implemented: unresolved bodies use a minimum six-CSS-pixel sprite with brighter
simple shading. Resolved planets retain procedural surfaces and mass-based growth;
physical contact radii, trajectories and all simulation rules are unchanged.
Validation: reviewed the corrected desktop and DPR-3 phone moon/notebook artifacts.
The viewport, gesture, history and resonance checks passed apart from the already
repaired selector. Static artifact checks pass; the final browser run compiles and
captures this small visibility adjustment with the existing graphics gates.


### 111 — Trustworthy moon interventions and observation frames

Review needs: fix star-relative moon burns, false eccentric labels, lost resonance
observations after spin edits, stale satellite membership and pinch continuation.
Implemented: version 4 rules with host-relative prograde/retrograde burns;
separate current and origin parents with release/transfer events; satellite calm
criteria, precise masses, day/km readings; authoritative burn capability; signed
launch previews; continuous one-finger pan after pinch. Version 1–3 replay physics
and command semantics remain available. Ten new development cycles are tracked
in docs/DEVELOPMENT_CYCLES.md, independently of these smaller commits.
Validation: native suite passed before the added regressions; all eight targeted
satellite/resonance tests, clippy, production WASM build, web contracts and 126
Node/WASM checks pass. Browser gates run on the pushed revision in Actions.


### 112 — Bounded scientific histories and comparison reconstruction

Review needs: record orbital changes independently of render cadence, inspect
impacts across time, compare equal ages, and stop playback at important events.
Implemented: tick-based mass/axis/eccentricity/period and resonance observations;
256-sample decimation and 256-event history caps; impact before/after orbit data;
explicit WASM history requests; worker original-run and equal-age comparison
reconstruction; optional pause/slow event policies. Histories are absent from
normal animation snapshots. The next delivery wires these capabilities into UI.
Validation: clippy, 13 interaction/satellite/resonance regressions, two history
conservation/replay/bounds tests, production build and 128 Node/WASM checks pass.


### 113 — Encounter observatory, preserved branches and equal-age comparisons

Review needs: expose the history engine through a usable observation flow; keep
original runs before branching; make comparisons independent of endpoint age.
Implemented: mobile Observe tab; orbital and resonance graphs with gaps for
removed/transferred bodies and wrapped angles; before/after encounter navigation
and orbit overlays; event pause/slow controls; automatic durable original saves;
worker-reconstructed equal-age comparisons and edit differences. Unchanged
history stamps avoid repeated large transfers. Starting-point recipes use current
moon rules, and 24 current-version campaign fixtures supplement legacy coverage.
Validation: full native suite and current campaign/recipe fixtures pass; production
build, web contracts and 154 Node/WASM checks pass. Added a browser workflow that
changes a burn before an impact, preserves the original and compares both runs.
Actions for 111 found two old formatting expectations across seven viewports
(153 browser checks passed); assertions now verify numeric eccentricity and the
new precise mass format. Histories also work for restored older rule versions.


### 114 — Challenge reasoning, comparative lessons and optional mastery

Review needs: show why a challenge is not progressing, teach resonance evidence
before an empty-system puzzle, and reward deliberate efficient solutions.
Implemented: authoritative recovery/observation feedback and optional economy /
restraint mastery for garden, assist, moon and resonance challenges; three staged
hints; real WASM comparisons of winning/near-miss garden, flyby and resonance
examples with graphs and readable starting conditions. Examples preserve the
active challenge. Mastery persists through discoveries and portable backups.
Validation: clippy, both native assessment tests against actual campaign outcomes,
production build, web contracts and 155 Node/WASM checks pass; focused progression
and backup checks also pass after integration. Added a browser example-study flow.


### 115 — Varied seeded systems with population outcome gates

Review needs: improve formation/event timing, vary resonance geometry, retain
same-seed experiments and validate more than finite numbers.
Implemented: a new replayable GenerateSystem command keeps older Generate macros
unchanged; compact nurseries, correlated flyby timing, star-aware moon regions
and variable resonance masses/radii/torques. Style-specific controls expose useful
parameters, remember settings and offer same-seed restart and named saves. Native
sweeps cover all five styles, tuning/regression/fresh validation seeds and star /
count / disorder boundaries; failures retain reproducible reports in Actions.
Validation: 120 native scenarios pass mass, finite-state and history bounds;
all three core seed sets form nursery worlds, preserve calm systems and moons,
and produce chaos escapes. Resonance librates in 12 of 16 core cases after 120
years. The same 120 replays match WASM identities, parents, masses and trajectories
within 1e-8. Both generator tests, clippy, build/contracts and 157 Node/WASM checks
pass. Observatory and lesson browser releases 113 and 114 are deployed successfully.

### 116 — Three impact regimes with conserved remnants

Review needs: make collision geometry and energy change the outcome without
breaking old experiments or awarding formation for smashing an existing planet.
Implemented: rules version 5 adds grazing survival and bounded disruption for
solid bodies, preserves gentle merging and stellar/giant accretion, and records
retained material, orbit/radius changes and remnant identities. Equal-and-opposite
impulses conserve momentum; unresolved spin carries angular momentum; a signed
orbital-energy ledger records the resolved change separately from impact heat.
Versions 1–4 preserve their contact rules. New outcomes appear in encounter pause,
observation details, counters, sound and visual effects. Current campaign fixtures
include the now-failing disordered garden and a second successful protected seed.
Validation: focused tests cover three regimes, unequal masses, saturated capacity,
material/mass/momentum/angular conservation, fast crossings and near misses.
Four/eight/sixteen-substep moon integration converges with bounded position error.
Full native suite, the 120-case native/WASM population matrix, production build,
web contracts and all Node checks pass; browser acceptance remains an Actions gate.

### 117 — Discoverable impact experiments and refinement checks

Review needs: new collisions must be reachable through starting points; examples
must use current physics; a regime must not depend on a lucky integration step.
Implemented: all eleven starting points and comparative lessons now use version 5.
Added a glancing encounter with two surviving rocky worlds and revised the
head-on example to explain fragmentation and falling remnants. Recipe validation
reconstructs the recipe's declared version instead of silently using the default.
Validation: every recipe produces its advertised result and replays exactly;
grazing survival agrees at four, eight and sixteen substeps. Native collision
checks, focused WASM/challenge tests, production build and web contracts pass.

### 118 — Filter history before crossing the worker boundary

Review needs: opening one chart copied every body's historical readings, creating
avoidable serialization and main-thread allocation at the 64-body limit.
Implemented: Rust emits only the selected body/pair series, with a catalogue for
switching subjects. Immutable timeline review uses the equivalent bounded view.
Selection changes request the appropriate series; ordinary snapshots stay small.
Validation: a real 64-body WASM history matches the cached-review projection for
valid, default and missing subjects; each frame contains at most one body/pair,
the message stays below 350 KB and below one fifth of the full history. Clippy,
build/contracts and eleven focused history/runtime tests pass.

### 119 — Sustained device scenarios and portable timing evidence

Review needs: make the mobile performance target reproducible while separating
paused/hidden cadence from running quality and retaining the user's experiment.
Implemented: View offers 64-world, moon-tracking and impact/chart stress scenarios,
a five-minute active-time recorder and JSON export with exact conditions, device,
quality, frame percentiles, draw CPU and tick throughput. Fixed histograms bound
memory; pauses/hidden time are excluded; system replacement ends a recording.
Preparing a scenario saves the original in the notebook before mutation. Added
browser acceptance and representative observation/lesson screenshot captures.
Validation: recorder tests cover five active minutes, hidden gaps, bounded storage
and long-frame overflow. Production build, contracts and the complete Node/WASM
suite pass, including all 120 generated systems. Physical iPhone/iPad sustained
60 FPS remains a device measurement; software CI does not claim to prove it.

### 120 — Actual-mass placement affordability

Review needs: a low-mass world could be rejected by the browser because the
kind's default mass cost exceeded the remaining matter, although Rust accepts it.
Implemented: placement validation uses the chosen mass, authoritative mass limits
and remaining budget. Restored fixed-mass rules retain their original cost path.
Validation: range, actual-cost and legacy-cost regressions pass alongside existing
launch-field tests; production build and web contracts pass.

### 121 — Frame-aware scene and resonance readings

Review needs: close moon views retained a stellar-zone key, mobile moon counts
were hidden in the footer, and unrelated body transfers broke pair graphs.
Implemented: the scene key describes the followed moon family at local scale,
shows the stellar band only when it intersects the view, and otherwise identifies
the system view. Pair histories use their pair as the continuity reference.
Validation: camera-context cases cover local moons, absent and visible stellar
bands; graph regressions retain continuity through unrelated host changes.
Production build/contracts and focused camera/observation tests pass.

### 122 — Preserve tracking through selection taps

Review needs: pointer-down immediately cancelled follow, making inspection while
watching a moon unnecessarily disruptive; a delayed drag could jump backward.
Implemented: taps retain tracking. A real drag or pinch takes camera control,
using the current tracked center when the gesture crosses the movement threshold.
Validation: tap/follow, moving-camera drag and pinch-to-pan regression tests pass;
production syntax, asset and DOM contracts pass.

### 123 — Watch an orbit at a readable pace

Review needs: fast system playback makes small satellite orbits difficult to
inspect, and returning from warp requires several unrelated controls.
Implemented: a shared speed catalogue adds 1/16× playback. Watch this orbit
chooses the fastest supported speed giving about eight seconds per orbit when
possible, follows the selected body and runs. Moon periods use their host frame.
Validation: orbital timescale boundaries and supported-speed selection pass with
real worker regression tests; production contracts verify the new controls.
Physics timestep and replay format are unchanged.

### 124 — Compare all impact outcomes without losing old notebooks

Review needs: experiment summaries still counted mergers alone after introducing
grazing and disruption, hiding meaningful differences between two runs.
Implemented: notebook cards and comparison tables include grazes and disruptions.
Existing saved summaries migrate missing counters to zero while preserving replays
and the validation of their existing fields.
Validation: portable checkpoint round-trips, old-summary migration and impact
comparison regressions pass; browser row expectations and production contracts
match the eleven displayed metrics.

### 125 — Compare branches at a chosen shared age

Review needs: endpoint-only comparisons obscure the onset of divergence and a
bare edit count does not explain which conditions changed.
Implemented: a shared-age slider reconstructs both experiments at the requested
tick. A readable difference list shows starting conditions and recorded edits up
to that age, with bounded output. Stale replies remain guarded by request order.
Validation: real WASM comparisons omit future placements, reject invalid ages and
leave the active experiment unchanged. Difference-list tests, build and web
contracts pass alongside the existing observation and notebook checks.

### 126 — Show the evidence needed for resonance

Review needs: the panel reported a near ratio without explaining remaining
observation requirements or why reversed orbital directions are absent.
Implemented: pair readings expose duration in outer-period units, angle reversals,
eccentricity and bounded-swing requirements, plus the detector's neighboring
prograde 2:1 / 3:2 / 4:3 scope. Detection is described as evidence, with the
existing authoritative criteria and saved simulation results preserved.
Validation: near-ratio cases cannot display capture evidence; missing duration,
eccentricity and reversals are explained. Focused tests and build/contracts pass.

### 127 — Independent axial rotation controls and readings

Review needs: reversed orbital motion and reversed spin were easy to confuse,
and the two spin buttons gave no numerical indication of the result.
Implemented: the inspector shows axial direction, rotation period and its sense
relative to the orbit. Players choose turns per year, spin either way or stop
rotation using the existing conserved-spin command.
Validation: clockwise orbital cases distinguish same/opposite axial sense; zero,
invalid and boundary rates are covered. Reading tests and build/contracts pass.

### 128 — Make earned mastery visible across sessions

Review needs: optional mastery survived in the profile but players could not see
which completed challenges had earned it after moving to another challenge.
Implemented: challenge selection displays named Economy / Restraint medals and
the collection includes the total. Existing completion/unlock rules are retained.
Validation: profile/backup regressions and production contracts pass. Added a
browser persistence flow covering the collection and challenge map after reload.

### 129 — Turn a studied lesson into a playable experiment

Review needs: lesson comparisons ended at explanation, with no direct route to
try changing their starting conditions.
Implemented: Try this setup reconstructs the selected arrangement at year zero
under its actual challenge rules. It preserves the current run in the notebook
before import; future edits/completion are excluded, and unlocks are checked.
Validation: all six real WASM lesson setups start incomplete at tick zero with
their intended bodies. Future edits are excluded without mutating the example.
Build/contracts pass; added browser original-preservation and playable-setup flow.

### 130 — Account for escaped bodies and disk energy

Review needs: ejections made conservation reports incomplete, and the population
sweep exempted escaped systems from its momentum check.
Implemented: escape momentum/angular/energy ledgers and a disk-energy ledger feed
a native/WASM balance report, also included in exported bug reports. Sweep gates
now require momentum and angular conservation for every case, including escapes.
Balances describe intervals between external edits; older contact ledgers are
explicitly marked incomplete. Trajectory rules remain unchanged.
Validation: native escape/migration balances conserve mass, momentum and angular
momentum, with bounded resolved-energy error and exact replay reconstruction.
All 120 native/WASM population cases pass the stronger gates. Build/contracts and
clippy pass. Browser run 123 passed 196 checks; its sole failure was the new phone
screenshot fixture clicking a hidden Sculpt control. The fixture now opens that tab.

### 131 — Refine close-encounter integration, not only isolated orbits

Review needs: timestep checks covered moon orbits and impacts but not the
strong gravitational encounter at the center of the slingshot challenge.
Implemented: the authored gravity-assist fixture now runs with four, eight and
sixteen substeps. Its escaping outcome, momentum/angular balance and resolved
energy are checked independently of rendering and playback batching.
Validation: all three resolutions produce the assisted escape; relative energy
error stays below 0.001 and the finest run reduces it below 40% of the production
step's error. The complete native workspace suite passes with the new ledgers.

### 132 — Keep device recordings tied to one workload

Review needs: changing speed, quality or viewport silently mixed unlike workloads;
a previously prepared scenario could mislabel a later current-system recording.
Implemented: reports include the exact build and playback speed, scenario identity
is tied to its simulation generation, and workload-setting changes finish a clear
partial report. Preparing a stress scenario clears event auto-pausing. Navigation
and observation remain part of the intended test; paused time stays excluded.
Validation: finished reports remain immutable under later frames. Added browser
quality-change coverage; device/worker tests and production contracts pass.

### 133 — Preserve encounter controls during live observation

Review needs: advancing the timeline rebuilt unchanged encounter buttons each
second, allocating DOM nodes and potentially losing keyboard focus mid-inspection.
Implemented: the encounter list refreshes only when events, timeline generation
or Before/After availability change. Event detail changes still invalidate it.
Validation: signature regressions cover time progression, boundary availability
and changed impact details. Added a browser DOM-identity check spanning the real
refresh interval; observation tests and production contracts pass.

### 134 — Separate creation previews from observation

Review needs: the rendered chart view showed a creation ghost beside one actual
world, while three narrow inspector buttons wrapped into crowded columns.
Implemented: launch ghosts and dashed paths appear while placing or editing launch
fields. Observation views show actual bodies. Inspector actions use readable
labels in two columns, retain explicit accessible names and disable unavailable
actions until an appropriate body is selected.
Validation: build/DOM/style contracts and existing input/preview tests pass.
Representative chart screenshots will verify the resulting composition in CI.

### 135 — Readable chart units and honest empty states

Review needs: the screenshot review found tiny axis labels and no visible metric
title; clearing a graph left its previous accessible range description in place.
Implemented: larger labels, a visible metric/unit title and additional chart
padding improve small-panel reading. Empty charts display an observation prompt
and replace the accessible description instead of retaining stale measurements.
Validation: graph geometry/continuity tests and production contracts pass. Browser
checks now cover empty accessible descriptions and populated chart metric labels;
CI captures both desktop and phone scientific-reading layouts.

### 136 — Cover every UI controller in headless DOM contracts

Review needs: static DOM validation still inspected app.js alone after observation,
lesson and generator controls moved into their own modules.
Implemented: the build gate checks static lookups in every web module, supports
both quote styles and direct getElementById calls, and names the offending module.
Duplicate IDs and accessible label references remain required gates.
Validation: mutation cases with a missing separate-controller element fail as
expected; the actual production DOM and all controller references pass.

### 137 — Synchronize the public guide and release design

Review needs: README, in-game help and the design overview still described only
mergers and manual original preservation, despite the completed feature work.
Implemented: documentation now covers current collision regimes and limits,
automatic branching, histories, shared-age comparisons, playable lessons, mastery,
moon/spin navigation, device recording and strengthened headless validation. The
old iteration-110 plan is explicitly retained as historical review evidence.
Validation: the complete verification command passes 79 native and 198 Node/WASM
tests, including the 120-system outcome/parity sweep, formatting, clippy and web
contracts. Actions browser acceptance, screenshot review and published hash
verification remain final release gates.

### 138 — Preserve reviewed histories through pause and Undo

Review needs: final source review found a missing block around playback cache
invalidation; pausing while reviewing cleared observations while retaining the
original replay. Undo/Rewind from that point also bypassed automatic preservation.
Implemented: only resuming playback invalidates the cached future. Reviewed Undo
and Rewind save the original before editing, using the same durable branch path.
Validation: a new real-WASM regression first reproduced the lost cache, then
passed after the fix, including filtered history and return to the endpoint.
Added browser reviewed-Undo preservation; full Node/WASM suite and web contracts
are rerun for this release correction.

### 139 — Return playable lessons to the mobile editing controls

Review needs: browser run 129 passed 208 checks but its phone lesson flows could
not reach the notebook because they remained on the challenge tab after Try setup.
Its separate screenshot-tab failure was already corrected in iteration 130.
Implemented: trying an example now opens Sculpt, making its conditions and saved
original immediately reachable on phones. The browser flow asserts this state.
Validation: all 199 Node/WASM tests passed after the timeline correction. Build
and all-controller DOM contracts pass for this mobile handoff. The final Actions
run remains responsible for full browser and deployed-artifact verification.

### 140 — Keep slow orbital playback visually continuous

Review needs: final timing review found that 1/16× produces fewer physics ticks
than worker snapshots; repeated snapshots reset the interpolation endpoints and
could make slow orbital watching appear to step. Selection also retained a cached
orbit path until another simulation snapshot arrived.
Implemented: rendering retains two distinct physics samples and skips redundant
geometry/trail work between them. Edits, pause and timeline replacement still
refresh samples. Selecting a body immediately invalidates its orbit/gravity caches.
Validation: a headless slow-playback sequence with repeated transport snapshots
retains the correct intermediate position and reacts to edits and replacement.
Motion/input/geometry tests and production contracts pass; no physics rules change.
