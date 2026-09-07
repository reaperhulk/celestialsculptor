# Ten development cycles

Requested after the review at `4eab867`. A cycle means implementing its whole
review list, checking the result, and recording the next analysis. Commits are
smaller delivery units and do not count as cycles.

## Cycle 1 — implement the existing review

Status: in progress.

- [x] Host-relative moon controls, accurate readings, membership, resonance and touch fixes.
- [ ] Encounter timeline, bounded histories, automatic branch preservation and equal-age comparisons.
- [ ] Garden, gravity-assist and resonance challenge decisions, hints and mastery.
- [ ] Varied generators with measured outcome and timing expectations.
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
