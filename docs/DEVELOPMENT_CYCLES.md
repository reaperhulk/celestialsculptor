# Ten development cycles

Requested after the review at `4eab867`. A cycle means implementing its whole
review list, checking the result, and recording the next analysis. Commits are
smaller delivery units and do not count as cycles.

## Cycle 1 — implement the existing review

Status: in progress.

- [x] Host-relative moon controls, accurate readings, membership, resonance and touch fixes.
- [x] Encounter timeline, bounded histories, automatic branch preservation and equal-age comparisons.
- [x] Garden, gravity-assist and resonance challenge decisions, hints and mastery.
- [x] Varied generators with measured outcome and timing expectations.
- [ ] Bounded collision outcomes with headless conservation and convergence checks.
- [ ] Sustained device scenarios and native/WASM/browser release gates.

The detailed requirements and acceptance criteria are in DESIGN.md under
“Review after iteration 110”. Record evidence and the next analysis here as work
lands; do not mark a cycle complete merely because its implementation was pushed.

## Remaining cycles

Cycles 2–10 are pending. Each begins with an analysis of the preceding completed
release, including its tests and available rendered/device evidence. Their work
lists will be recorded when that evidence exists.


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
