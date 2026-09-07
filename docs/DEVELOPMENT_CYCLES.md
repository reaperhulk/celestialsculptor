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
