# Long-run qualification and experiment records

The release gate is `npm run qualify:numerics`. It exercises the entire 600-year
sandbox horizon, a longer collisionless orbit, timestep refinement and an
independently implemented force/integration reference. It is a required deployment
job. Passing these fixtures does not certify arbitrary close encounters, all
possible moons, or a scientifically exact history of the actual Solar System.

## Physics contract

Ticks remain 1/512 year. Ordinary worlds use four fixed KDK substeps per tick.
Adding an authored moon raises the experiment's fixed resolution to sixteen;
applying disk migration raises it to thirty-two. Resolution never drops later
and never depends on display speed, frame time or hardware. Commands reproduce
these changes, including moons created by the generator. Naturally captured
satellites do not automatically change the resolution.

Disk torque tapers smoothly between 0.35 and 0.25 AU and vanishes inside that
inner edge. Disk impulses are split symmetrically around the gravitational step,
and every impulse updates the mass/momentum/angular/energy accounting as
appropriate. Newtonian gravity, softening and the mutual tree opening remain
unchanged. This is an intentional disk-model change: unrestricted migration
previously forced unresolved stellar-skimming trajectories.

The 600-year review exposed two shortcomings in the previous settings. In the
migration/escape fixture, the relative energy-balance error reached 0.154. A
four-substep moon fixture differed from the independent reference by up to
0.248 radians in sampled moon phase despite tiny system-energy error. The new
resolution policy and disk edge address these failures. Detailed measured
results are in [the review evidence](review-evidence/README.md).

## Reproduce

```sh
python3 -m venv .qualification-env
.qualification-env/bin/pip install -r scripts/qualification-requirements.txt
QUALIFICATION_PYTHON=.qualification-env/bin/python npm run qualify:numerics
```

The pinned [SciPy DOP853](https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.DOP853.html) reference evaluates the same softened all-pairs force
law in separate Python/NumPy code. Two tight tolerances establish reference
uncertainty; the reference does not share the Rust leapfrog implementation.
The Rust collisionless probes also compare a fixed timestep with half and
quarter steps. The approximate Newtonian osculating elements are diagnostics:
softening and perturbations can produce physical precession, so the comparison
uses the same softened force law, rather than requiring zero precession.

The report includes sampled energy/momentum/angular residuals, orbital size,
eccentricity, phase, apsidal error and its fitted slope, nominal orbit counts,
and refinement convergence. The isolated eccentric orbit runs 4,096 years,
roughly 5,317 initial orbital periods. Reference integration covers 600 years.
The prograde/retrograde moon family, resonant giant pair, migration/escape case,
and 1,024-body massive swarm each run 600 years with the actual world engine.
Collision, unresolved-disk and escape transfers are included in the balance.

A separate collisionless 512-body disk keeps the tree selected for all 600 years
and compares it with direct summation at the same timestep. Its debris mass is
0.016 Earth masses to isolate accumulated force approximation from unresolved
hard encounters. The full-world swarm uses 16 Earth masses and collisions;
mergers eventually reduce that case below the tree threshold. These are distinct
claims, not interchangeable proofs of large-N accuracy.

Accuracy budgets are explicit in `scripts/qualify-numerics.py`; changing one
requires a documented scientific justification. Small energy error alone is
insufficient. Candidate GPU lifetime tests stop on the first sampled failure
and report rejection as an experimental result; they do not enable live GPU
physics. The production release must pass its numerical gates independently.

## Restart state and observation limits

Portable experiments remain seed/configuration/tick-stamped command records,
now with an explicit physics identifier. Current physics only is supported.
Campaign imports always reconstruct commands and re-evaluate earned results.
Sandbox restart states contain physical state, RNG state, identifiers, transfer
ledgers, observations, command prefix and fixed resolution. Import validates
sizes, finite values, identifiers and membership in the requested replay.

The worker matches the exact WASM asset hash and build revision, checks the
restart payload's SHA-256, and chooses the nearest eligible cached tick. Invalid,
missing or unavailable storage falls back to command reconstruction. This is
local integrity protection, not authentication of sandbox state. IndexedDB and
the in-memory implementation retain at most twelve states and 48 MB. A named
save waits for the state cache and the active portable autosave before reporting
completion. Cached states are optional accelerators, not portable truth.

Observations retain at most 65,536 full-system body readings, 256 coarse frames,
256 detailed frames for 32 priority bodies, and 128 recent detailed frames.
Eight explicitly chosen bodies take precedence in priority selection. Pinning
is a recorded observation command and does not reset resonance or mastery hold
progress. Population summaries have an independent bounded sampling schedule.

Flyby recording samples pairs among the priority bodies every eight ticks,
retains at most 64 active approaches and 64 completed flybys, and skips parent/moon
pairs and intervals with physical contacts. The reported minimum is a sampled
minimum, not an exact closest-approach solution. The record includes participants,
start/minimum/end ticks and before/after osculating elements. Very fast passes
between samples and untracked debris encounters can be missed.

Body comparisons share age, plot scale and star-relative orbit overlays; the
history of a moon is relative to its host. IDs are local to each experiment.
The retained encounter journal provides ancestry evidence, rather than assuming
identical IDs across different generated seeds represent identical bodies.
One-condition sweeps run up to three variants from a saved sandbox and preserve
the original. They are small controlled experiments, not statistical population
studies.

Validated restart deserialization adds WASM code. The WASM budget increases from
512 KB to 740 KB and the complete uncompressed payload ceiling from 1.0 MB to
1.1 MB. The JavaScript ceiling remains 256 KB. Payload hashes and ceilings remain
release checks; this increase buys restorable scientific state rather than an
unbounded observation archive.
