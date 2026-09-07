# Scaling the orbital simulation

## Current live architecture

Rules 7 supports up to **8,192 physical bodies** in the sandbox. Choose **Large
particle swarm** in the generator; begin with 1,024. All particles both feel and
source gravity. Historical replays and missions retain the 64-body cap and exact
solver. Current systems use exact f64 SIMD below 512 bodies and a symmetric mutual
tree with second-order cell forces and tides above that, at opening 0.35. Saved
rules-6 experiments retain opening 0.25. The star
and nearby leaves remain direct. Four integration substeps are unchanged.

The first whole-engine host sweep sustained 269 ticks/s at 1,024 quiet bodies and
108 at 2,048; 1x requests 102.4 ticks/s. Larger systems slow simulated time. Worker
batches yield at tick boundaries, display cadence is independent, and histories,
trails and menus have memory/work limits. Physical iPhone/iPad FPS is not established
by these host measurements. Impact-ledger updates now touch only affected bodies;
large display frames use packed transferable f64 arrays with pooled decoding.
The optional GPU comparison measures real compute without changing live physics.

## Hill-climb results through iteration 163

Keep candidates based on complete workloads and independent correctness checks.
The following x64 host comparisons describe different stages and must not be
multiplied together as one claimed speedup:

| Change | Measured workload | Before → after | Decision |
|---|---|---|---|
| Swept collision candidates | 64 bodies, 2,048 complete ticks | 170.29 → 88.89 ms | Ship |
| SoA and unchanged-force reuse | Same 64-body tick workload | 89.87 → 84.69 ms | Ship |
| Local impact-energy accounting | 8,192 disordered bodies, ms/tick | 99.59 → 43.56 ms | Ship; same impacts |
| Packed display transport | 8,192 bodies, encode/decode | 32.07 → 1.52 ms | Ship |
| Extra vector output accumulation | 8,192 bodies, tree force only | 10.61 → 10.65 ms | Reject; whole-engine gains inconsistent |

The rejected output-accumulation candidate improved the 1,024-body force-only
probe by 14%, but whole-engine samples stayed around 3.7 ms/tick and the larger
force workloads did not improve consistently. Retain the existing tested SIMD
kernel without that additional unsafe output layout. All 419 scalar/SIMD and
405 legacy comparison checkpoints passed, so this rejection is about benefit.

Apple Silicon Actions run [34096762676](https://github.com/reaperhulk/celestialsculptor/actions/runs/34096762676)
measured the production solver on an M1 hosted runner: approximately 180 ticks/s
at 1,024 bodies, 72–82 at 2,048, 32–34 at 4,096, and 15 at 8,192.
These short full-physics sweeps include both quiet and disordered swarms. The
1x demand is 102.4 ticks/s; supporting 8,192 bodies does **not** mean sustaining
1x at that population. Rendering and simulated time have separate budgets.

That runner exposed an Apple WebGPU adapter. The 1,024-body GPU round trip took
9.4 ms versus 2.5 ms for the CPU tree in that browser, with RMS relative force
error 3.8e-6. This straightforward readback design loses at that count. GPU
integration stays experimental. The next sweep includes 4,096 and 8,192 on Metal;
short CPU measurements aggregate calls to avoid zero-duration timer samples.

## Next measured climbs

Iteration 165 qualifies rules 7 at opening 0.35 and retains eight-body leaves.
The disordered whole-tick comparison improves 1,024 bodies by 1.46x, 4,096 by
1.59x, and 8,192 by 1.50x on the local host. Direct-reference orbit convergence,
moon stability, conservation and a forty-year 1,024-body run pass. Existing rules-6
files preserve their old physical trajectory, backed by reference hashes from
the deployed engine. `npm run bench:tree-rules` reproduces the versioned comparison
and records both CPU and wall samples in CI. Results across the two openings are
qualified by physical invariants and convergence, rather than exact trajectory equality.

The continuation starts with a repeatable profile: `npm run build && npm run
profile:scaling -- 8192 256` writes `scaling.cpuprofile` using the matching named
WASM artifact. Sampled timings include profiler overhead. The iteration-163
8,192-body profile assigns 53% of self time to leaf pairs, 22% to tree traversal,
9% to tree building, and roughly 10% to sorting.

Preserve a release's `dist/pkg`, build a candidate, then run `npm run
compare:scaling -- /absolute/reference/pkg`. Optional body-count and tick arguments
allow longer samples on noisy hosts, for example `8192 128`. Every pair must match
state, balances, observations and replay exactly. CPU and wall time are both
recorded; these comparisons measure simulation throughput, not FPS.

`npm run bench:tuning` sweeps compile-time leaf sizes and opening tolerances,
including the historical 0.25 and current 0.35 production settings. It checks forces against exact
summation without the dominating star and measures momentum/torque residuals.
The first sweep rejected smaller leaves as a universal improvement. Openings
0.30–0.35 show a better speed/error tradeoff; the 0.35 candidate has now passed
trajectory qualification and is selected only for new rules-7 worlds.

1. Use View → Device performance test to record the 1,024/4,096/8,192-body
   workloads at requested 1x for five active minutes on real iPhone and iPad.
   Judge FPS and achieved ticks/s together; inspect and navigate while recording.
2. Profile the retained tree at the largest counts: tune leaf size, opening/error
   curves and construction cost with the existing exact force and orbit gates.
   Keep replay rules explicit for changes that alter arithmetic or approximation.
3. If GPU readback still loses at larger counts, prototype device-resident
   integration and collision handling as a separate qualified backend. Include
   conservation, close encounters, resonance and replay portability in acceptance.
4. Evaluate deterministic shared-memory workers only after verifying the hosting
   requirements and measuring synchronization overhead against the remaining CPU
   bottleneck. No live multithreaded or GPU physics backend is claimed today.

Run `npm run bench:gravity` for force/error curves through 8,192 bodies and
`npm run bench:scaling` for complete simulation and snapshot workloads. Actions runs
both on x64 and Apple Silicon and archives raw samples. The force probe is compiled
separately so benchmark-only code does not increase the live download.

## Initial SIMD measurements (iteration 150)

The release build enables WASM SIMD128. Gravity processes two independent pairs
with `f64x2` arithmetic, retaining double precision, the existing summation order,
and both sides of every gravitational interaction. Native and reference WASM
builds retain the scalar solver. No relaxed SIMD, approximate reciprocal square
root, timestep change, or distant-force approximation is introduced.

The first alternating, warmed host benchmark measured 2,048 complete simulation
ticks as follows. These are end-to-end simulation timings, not an isolated force
kernel or an iPhone measurement. The prototype was based on iteration 149,
using Rust 1.90.0 and Node 24 on an AMD EPYC 9V74 Linux host:

| Bodies | Scalar ms | Explicit SIMD ms | Throughput gain |
|---:|---:|---:|---:|
| 8 | 4.05 | 3.84 | 1.06x |
| 32 | 53.52 | 45.03 | 1.19x |
| 64 | 202.67 | 164.07 | 1.24x |

Enabling the compiler flag alone without rewriting the force loop did not give a
meaningful gain (64 bodies: 202.76 versus 205.63 ms). Keep measuring the complete
engine: collisions, diagnostics, and history also consume time.

Run `npm run build && npm run bench:simd`. The comparison builds a separate
scalar WASM module without changing `dist`, checks campaign and seeded scenarios,
every recipe, forty years of resonant moons, odd/even body counts and legacy
replay versions, then times alternating runs after warmup. Snapshots, conservation
ledgers, observation histories, and exported replays must match exactly. Actions
runs this gate and retains `simd-benchmark-results.json` with raw samples, host,
toolchain, and commit. Native/WASM tolerance checks and browser engine tests remain.

**At this baseline the cap was 64.** The iterations below measure the subsequent
scaling work. Do not equate a smooth renderer with the worker
keeping up at the requested speed.

## Baseline cost model before the scaling changes

The original direct solver visited N(N-1)/2 pairs five times per tick. Collision detection
also scans pairs at the initial contact pass and each of four substeps, repeating
after mergers where necessary. The current tick rate requested at 1x is 102.4/s;
16x asks for 1,638.4/s while retaining the same physical timestep.

| Bodies | Gravity pairs per force evaluation | Relative to 64 |
|---:|---:|---:|
| 64 | 2,016 | 1x |
| 256 | 32,640 | 16.2x |
| 1,024 | 523,776 | 259.8x |
| 2,048 | 2,096,128 | 1,039.7x |

At 1,000 bodies, direct gravity alone requests about 256 million pair evaluations
per wall-clock second at 1x, or 4.09 billion at 16x. A modest SIMD speedup cannot
remove that growth. These are operation counts, not measured supported workloads.

## Original implementation plan (retained for review history)

1. **Establish a scaling harness and remove fixed storage assumptions.** Add
   headless 64/128/256/512/1,024/2,048-body fixtures for separated orbits, clumps,
   debris disks, collision storms, and host/moon systems. Measure force time,
   collision time, diagnostics, snapshot encoding/transfer/decoding, allocations,
   and complete tick throughput separately. Use reusable capacity-bounded storage
   instead of fixed 64-element force, render, and sizing buffers. Keep live limits
   conservative until each milestone passes; test maximum imported/generated counts.

2. **Make the exact solver and collisions suitable for hundreds.** Split hot
   position, velocity, mass, radius and acceleration arrays from names, materials
   and histories (structure of arrays). Benchmark direct SIMD over contiguous
   pairs against today's implementation. Add swept bounding boxes and benchmark
   a plane sweep versus a tree for collision candidates; keep the current swept
   narrow phase and stable pair ordering. Compare candidates and outcomes against
   exhaustive detection, including fast crossings, coincident bodies, giant/dust
   size ratios, grazing contacts, fragments, and collision cascades. Dense genuine
   contact sets can still be quadratic. Gate a 256-body release on measurements.

3. **Add controlled distant-gravity approximation for thousands.** Use a 2D
   quadtree with a conservative opening criterion; nearby bodies are evaluated
   directly while distant groups contribute through their aggregate gravity.
   Explicit star/planet/moon neighborhoods retain direct interactions, with no
   double counting. All bodies, including debris, still contribute gravity. Keep
   exact direct summation for small systems and as the test oracle. Prototype
   Barnes-Hut to measure the error/cost curve, but assess symmetric mutual cell
   interactions before adopting it: ordinary one-sided tree traversal can add
   momentum drift. A tree is usually O(N log N), not a guarantee in pathological
   distributions. Do not promise a fixed accuracy or speedup before measuring it.

4. **Preserve the game's orbital behavior.** Test force-error distributions
   against the exact solver with absolute and normalized errors (near-zero net
   forces need care). Measure energy, linear and angular momentum drift, orbital
   period/eccentricity, retrograde moon stability, resonance-angle libration and
   capture outcomes over long runs. Sweep opening tolerances and require tighter
   tolerances to converge toward the reference. Separately assert deterministic
   replays, exact mass accounting, and finite states. Record solver version and
   accuracy settings in replay rules; retain legacy reconstruction. Approximate
   chaotic trajectories are not expected to match direct trajectories bit for bit.

5. **Keep transport and graphics within the device budget.** Transfer pooled
   typed-array render snapshots instead of serializing the full body catalog
   every display update. Send detailed telemetry for selected bodies at a lower
   cadence. Budget trail vertices, labels, diagnostic histories and rings by
   visible importance. Use a screen-space neighbor index for adaptive body sizing,
   whose present 64-body pass is also quadratic. Preserve click targets and actual
   physical contact geometry while reducing distant decorative detail. Retain
   instanced WebGL2 drawing and interpolation between authoritative snapshots.

6. **Qualify 1,024, then 2,048 on real devices.** Extend the existing device
   recorder with these fixtures. Record five active minutes on modern iPhone and
   iPad at High, including pan, pinch, follow and inspection. Report frame spacing,
   input latency, simulated years/second, achieved/requested warp, memory and
   sustained thermal behavior. Target 60 rendered FPS plus sustained 1x progress
   first. Qualify higher warps separately; reducing graphics detail must never
   silently lower simulation accuracy. Publish results per body count and scenario.

## Parallelism and compatibility

SIMD executes multiple arithmetic lanes on one CPU core. It works in the current
dedicated worker and does not need SharedArrayBuffer or cross-origin isolation.
The release now requires a SIMD-capable browser: Safari 16.4+, or current Chrome,
Edge and Firefox. Scalar WASM remains available through the differential build
for testing; it is not a second downloaded runtime.

On ARM64, the browser's WASM compiler lowers vector arithmetic to NEON / Advanced
SIMD. The Rust browser target remains `wasm32`; it must not select
`core::arch::aarch64` based on the player's device. Those intrinsics would belong
to a separate native ARM application. The existing f64x2 kernel expresses the
portable operations that the ARM64 engine can lower to its vector instructions.

Actions requires an Apple Silicon macOS job before deployment. It asserts native
ARM64 Node execution, runs native and WASM physics checks, compares scalar/SIMD
results and throughput, and executes every recipe in ARM64 WebKit. Reports include
the actual CPU/architecture. This exercises the ARM browser compilation path;
desktop M1 measurements do not establish phone battery, thermal or frame behavior.
The physical iPhone/iPad protocol remains the performance acceptance criterion.

Consider multiple workers/shared-memory WASM only after profiling the tree and
transport path. Shared WASM memory requires cross-origin isolation, which must be
verified against the deployed host and response headers. Threads also need
deterministic reduction, synchronization and replay tests. They are not necessary
to start the algorithmic work. GPU compute is a later experiment, with precision,
readback, compatibility and reproducibility evaluated before choosing it over Rust.

## References

- [Rust WASM SIMD intrinsics and build flags](https://doc.rust-lang.org/core/arch/wasm32/index.html).
- [WASM SIMD browser support](https://emscripten.org/docs/porting/simd.html).
- [REBOUND direct and tree gravity](https://rebound.hanno-rein.de/gravity/).
- [REBOUND swept and spatial collision searches](https://rebound.hanno-rein.de/collisions/).
- [Dehnen: symmetric, momentum-conserving tree interactions](https://arxiv.org/abs/astro-ph/0003209).
- [Shared WASM memory requirements](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer).

## Measured climb: swept collision search

Iteration 153 replaces exhaustive collision narrow-phase work with sorted swept
AABB candidates, retaining collision order and bitwise replay results. The whole
64-body WASM workload improved from 170.29 to 88.89 ms / 2,048 ticks on the local
x64 host. Reproduce a before/after comparison by preserving the older `dist/pkg`
directory and running `node scripts/compare-physics.mjs /absolute/reference/pkg`
after building the candidate. The report includes raw warmed alternating samples
and checks 380 exact state/history/ledger/replay checkpoints.

## GPU compute experiment

View settings now offer **CPU and GPU compute comparison**. It runs dedicated
swarm and moon workloads and downloads adapter details, warmed CPU/direct/tree
and GPU upload/dispatch/readback timings, force errors, and momentum residuals.
The shader uses 64-lane tiles in shared workgroup memory. Buffers are reused.
It does not change the current world's physics. Shader correctness runs against
an independent double-precision WASM oracle in CI; software adapters and unavailable
hosted Metal devices are identified explicitly.

WGSL's standard arithmetic is f32 (with optional f16), so this candidate is not a
replacement for the tested f64 orbital solver without further qualification.
A fast shader alone does not establish a faster integrator: transferring each
force field back across four substeps can dominate. The next GPU decision must
include long-run conservation, close encounters, moon/resonance behavior and
portable replay behavior as well as real-device end-to-end speed.
See the [WGSL numerical specification](https://www.w3.org/TR/WGSL/) and
[WebGPU buffer mapping specification](https://www.w3.org/TR/webgpu/).


## GPU-resident orbital qualification (166)

The device comparison now also measures moving particles, with positions,
velocities and accelerations retained on the GPU across all four KDK substeps.
Only the final state is mapped back after eight complete ticks. The f64 CPU
reference uses the production direct/tree selection. Alternating samples exclude
pipeline compilation and include dispatch plus final readback. `gpu-orbits.json`
is archived by software and Apple GPU CI alongside the existing force report.

A separate one-year, 64-body prograde/retrograde moon fixture checks position and
velocity error, moon phase, energy drift, momentum drift and exact batch invariance.
The Rust oracle is checked against collision-free gameplay independently of any
renderer. This is a **collisionless qualification prototype**, not a new live
backend or a full-engine throughput claim. Collision detection, migration,
escapes, observation history and deterministic cross-device replay remain required
before a GPU backend can advance a playable system.
