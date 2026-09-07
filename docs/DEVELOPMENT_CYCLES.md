# Ten development cycles

Requested after the review at `4eab867`. A cycle means implementing its whole
review list, checking the result, and recording the next analysis. Commits are
smaller delivery units and do not count as cycles.

## Cycle 1 — implement the existing review

Status: all ten review lists implemented. The combined release is validated by
[GitHub Actions](https://github.com/reaperhulk/celestialsculptor/actions/workflows/verify.yml?query=branch%3Amain)
and publishes only after its native, WASM and browser gates pass.

- [x] Host-relative moon controls, accurate readings, membership, resonance and touch fixes.
- [x] Encounter timeline, bounded histories, automatic branch preservation and equal-age comparisons.
- [x] Garden, gravity-assist and resonance challenge decisions, hints and mastery.
- [x] Varied generators with measured outcome and timing expectations.
- [x] Bounded collision outcomes with headless conservation and convergence checks.
- [x] Sustained device scenarios and native/WASM/browser release gates.

The detailed requirements and acceptance criteria are in DESIGN.md under
“Review after iteration 110”. Record evidence and the next analysis here as work
lands; do not mark a cycle complete merely because its implementation was pushed.

## Remaining cycles

The cycle records below contain each subsequent analysis and implemented list.
Each review used the resulting source, headless checks and latest available CI
evidence. The combined final release gate is recorded at the end.


Cycle 1 delivery evidence: iteration 111 implements the moon/readings/input slice.
Native legacy tests, eight focused satellite/resonance regressions, clippy and
126 Node/WASM checks passed locally; browser/deployment gates run in Actions.

Iteration 112 adds the bounded headless observation/comparison foundation. The
UI portion of the experiment-loop item remains in progress.

Iteration 113 completes the observation UI, automatic original preservation,
equal-age comparisons and current-version campaign parity fixtures. Browser
acceptance and screenshot review remain gates before cycle completion.

Iteration 114 adds challenge-specific recovery/evidence, optional mastery and
three comparative lessons from actual winning and near-miss replays. Current
version fixtures include multiple solutions for garden, assist and resonance.

Iteration 115 completes the new generator population and boundary checks with
120 native/WASM parity cases. Releases 113/114 passed full browser and Pages
verification. Collision diversity and sustained device scenarios remain in cycle 1.

Iterations 116–119 implement the remaining cycle-1 list: conserved grazing /
disruption, current-physics starting points, timestep refinement, filtered chart
transport and sustained device recording. All local headless gates pass; the
latest browser release is pending. Physical five-minute hardware evidence remains
an explicitly documented device measurement, not a claimed automated result.

## Cycle 2 — control and observation consistency

Review of the implemented cycle-1 source, current headless results and available
phone captures found three concrete usability defects: custom-mass launch checks
use fixed kind cost, the stellar habitable-zone key remains visible in a local
moon view, and pair graphs can acquire gaps from an unrelated selected body.
Implement accurate placement validation, frame-aware scene context and independent
pair histories; verify the controls across native/WASM/UI boundaries. Delivery
of cycle 1 remains subject to the pending browser gate.

Cycle 2 implemented in 120–121. Actual-cost, camera-context and graph continuity
checks pass, with production contracts verified. Re-review found that merely
touching a followed body drops tracking before a drag begins, and high warp has
no convenient way to return to a readable local orbital timescale.

## Cycle 3 — readable orbital navigation

Keep follow on taps, release it only when navigation actually begins, and provide
a selected-orbit watching speed with a slower playback option. Verify pointer
state transitions and real worker timing; preserve the fixed physics timestep.

Cycle 3 implemented in 122–123. Pointer transitions and playback timescale tests
pass with the real worker suite. Review of the experiment workflow now shows
that saved comparisons omit grazing/disruption counts and always compare only
at the shorter endpoint, obscuring when two branches begin to differ.

## Cycle 4 — useful branch comparisons

Include new impact outcomes while migrating existing notebook summaries safely.
Allow an explicit shared comparison age and explain differing starting/edit
conditions in readable terms. Test nonmutating equal-age reconstruction and
existing notebook compatibility.

Cycle 4 implemented in 124–125. Legacy notebook migration and real nonmutating
shared-age comparisons pass. The first collision release (116) has now passed
all browser checks and deployed successfully. Review of orbital diagnostics found
that the resonance panel hides its detector requirements and does not explain
why clockwise orbits are absent; axial spin is editable but lacks a reading.

## Cycle 5 — explain orbital and rotational evidence

Expose resonance observation duration, reversal/eccentricity requirements and the
supported prograde first-order scope. Add signed axial spin/period readings so
opposite orbital motion and opposite rotation can be inspected independently.
Keep diagnostic improvements separate from changes to the saved physics rules.

Cycle 5 implemented in 126–127. Resonance evidence and signed rotation controls
pass focused diagnostics/WASM checks. Review of progression reveals that earned
mastery is persisted but disappears from the mission map, while comparative
lessons cannot be opened as a playable starting experiment.

## Cycle 6 — carry learning back into play

Show persisted mastery in challenge selection and the collection count. Let a
player try the currently studied lesson setup, preserving their existing run
before replacing it. Verify persistence and setup reconstruction without granting
unearned completion or applying the lesson's future edits.

Cycle 6 implemented in 128–129. Persisted medals and six playable lesson setups
are covered by profile/WASM checks and new browser flows. Physics re-review found
that conservation reports stop being interpretable after a body escapes: escaped
mass is recorded, but its momentum, angular momentum and resolved energy are not.
Disk torque also lacks an energy ledger despite recording its momentum transfer.

## Cycle 7 — conservation through open-system events

Record escape and disk-energy exchanges without changing trajectories. Expose a
headless balance report and verify conservation across ejection, migration and
collisions. Extend timestep refinement to a gravitational-assist encounter.

Cycle 7 implemented in 130–131. All 120 seed cases now pass momentum and angular
checks including escapes; native refinement reduces the flyby's energy error and
keeps its outcome. The full native suite passes. Review of the device recorder
and live charts found that changing display settings can mix workloads in one
report, and advancing time rebuilds unchanged encounter controls every refresh.

## Cycle 8 — trustworthy performance measurements and stable live controls

End recordings when their workload settings change, identify the actual scenario
and build, and keep fixed-memory reports. Reuse unchanged encounter controls so
live charts preserve focus and avoid unnecessary DOM allocation. Validate both
measurement boundaries and browser control identity while time advances.

Cycle 8 implemented in 132–133. Measurement-boundary and stable-encounter tests
pass. Review of the CI-rendered desktop chart and phone lesson found three visual
needs: three narrow inspector buttons wrap heavily, the creation ghost resembles
an extra world while observing, and small chart axes lack a visible metric title.

## Cycle 9 — clear observation presentation

Make inspector actions readable, show the creation ghost only while placing or
editing a launch, and improve chart labels plus empty-state accessibility. Retain
real screenshot review and browser acceptance for the new presentation states.

Cycle 9 implemented in 134–135. Preview/input and graph tests pass, and the revised
composition is included in CI screenshots. Final source review found that DOM
contracts inspect app.js alone despite new UI controllers in separate modules;
README, help and the design overview still describe merger-only collisions and
manual original preservation.

## Cycle 10 — close validation and documentation gaps

Validate static DOM references across every web controller, update the public
instructions and living architecture to the delivered game, run the complete
native/WASM/browser release gates, inspect new screenshots and verify the deployed
artifact. Resolve failures before marking the ten-cycle request complete.

Cycle 10 delivery: 136–143 close controller-contract, documentation, reviewed
history-cache/preservation and mobile lesson-handoff gaps. The final full local
verification passes 79 native tests; the subsequent corrected runtime passes all
199 Node/WASM tests, including the 120 generated-system matrix. Browser run 123
passed 196 checks with one screenshot navigation failure; run 129 passed 208 with
that known fixture issue and mobile lesson handoff failures. Their fixes are in
130 and 139. The combined browser and Pages result is recorded in the linked Actions release
checks; failed runs do not publish.

| Cycle | Implementation iterations | Completed review list |
|---|---|---|
| 1 | 111–119 | Moon physics/controls, experiments, challenges, generators, collisions, device scenarios |
| 2 | 120–121 | Actual-mass costs and frame-consistent readings |
| 3 | 122–123 | Follow gestures and orbital watching speeds |
| 4 | 124–125 | Complete impact summaries and chosen-age comparisons |
| 5 | 126–127 | Resonance evidence and independent axial rotation |
| 6 | 128–129 | Visible mastery and playable lessons |
| 7 | 130–131 | Open-system conservation and encounter convergence |
| 8 | 132–133 | Consistent device workloads and stable encounter controls |
| 9 | 134–135 | Observation composition and accessible charts |
| 10 | 136–143 | Whole-controller validation, documentation and final release corrections |

Final timing review in 140 also preserves distinct interpolation samples during
slow playback and invalidates orbit caches immediately on selection. Its focused
presentation regressions pass; the current release contains 30 implementation
commits across the ten review cycles.

## Final review

The ten lists are implemented in 32 implementation commits plus the closing
review record. The complete local gate passed 79 native and 199 Node/WASM tests;
a further focused regression verifies distinct slow-playback interpolation samples.
The final CI reruns the whole suite, seven Chromium viewport flows, Firefox/WebKit
recipe execution, screenshots and public asset-hash verification. Its exact result
and revision are available in Actions rather than frozen into a stale status here.

The local 64-body benchmark measured about 9,821 WASM ticks/second and a 42,913-byte
snapshot. These are host CPU measurements, not an iPhone/iPad GPU FPS claim.
Current uncompressed payload is about 663 KB, including 458 KB of WASM, within
the existing release budgets. History frames, encounters, chart transport,
render streams and device-recording histograms remain bounded.

Next milestone candidates are sustained physical-device recordings using the new
protocol, tidal spin/orbit exchange with explicit balance accounting, and a
versioned investigation of late resonance capture after an earlier circulating
angle. The present detector intentionally assesses neighboring prograde first-order
pairs; collision interiors, fine debris and three-dimensional dynamics remain
outside the current model. These are future extensions, not promises of measured
hardware performance or additional physics already implemented.

Screenshot review in 142 corrected the phone Observe landing position, compacted
the metric/subject selectors and aligned the initial inspector with its star
selection. The capture gate now requires the chart to be at least 95% visible.

The 142 browser gate measured only 90.7% phone-chart visibility while the other
238 checks passed. Iteration 143 caps the chart height to fit the panel and keeps
the 95% acceptance threshold unchanged.
