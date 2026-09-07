# Scaling the orbital simulation

## Current live architecture

Rules 6 supports up to **8,192 physical bodies** in the sandbox. Choose **Large
particle swarm** in the generator; begin with 1,024. All particles both feel and
source gravity. Historical replays and missions retain the 64-body cap and exact
solver. Current systems use exact f64 SIMD below 512 bodies and a symmetric mutual
tree with second-order cell forces and tides above that, at opening 0.25. The star
and nearby leaves remain direct. Four integration substeps are unchanged.

The first whole-engine host sweep sustained 269 ticks/s at 1,024 quiet bodies and
108 at 2,048; 1x requests 102.4 ticks/s. Larger systems slow simulated time. Worker
batches yield at tick boundaries, display cadence is independent, and histories,
trails and menus have memory/work limits. Physical iPhone/iPad FPS is not established
by these host measurements. Ongoing needs are impact-ledger work and snapshot
transport, followed by GPU compute qualification.

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

## Where the work grows

The direct solver visits N(N-1)/2 pairs five times per tick. Collision detection
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

## Ordered implementation plan

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
