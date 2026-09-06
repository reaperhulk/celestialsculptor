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
an always-open sandbox and four editable starting points. Outcomes and saves are
local. Backups and bug reports are portable, importable, and directly reproducible
with the native CLI. Matter is a gameplay budget; burns are external interventions
and are excluded from conservation claims across edits.

A replay is versioned configuration plus ordered tick-stamped commands. Version 1
supports 2,048 edits, 600 years and 20 million pair-tick work units. Reconstruction
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

## Next review targets

Replay/import resource limits and deterministic generation; campaign solvability;
native/WASM parity; worker lifecycle; WebGL rendering; touch and keyboard control;
progression and save resilience; CI artifact gating and deployment; performance,
accessibility, edge cases, and regression coverage discovered during play.
