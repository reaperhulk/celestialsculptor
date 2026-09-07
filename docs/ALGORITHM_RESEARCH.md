# Algorithms for large, long-lived solar systems

The objective is lower complete-workload cost at a stated long-run accuracy,
including state movement, encounters, observations and rendering. Kernel speed,
energy conservation, and visual plausibility are each insufficient alone.

## Literature and implementation decisions

| Approach | Primary evidence | Decision for this simulator |
|---|---|---|
| Symmetric mutual tree and SIMD direct leaves | [Dehnen 2000](https://arxiv.org/abs/astro-ph/0003209) describes mutual cell interactions that preserve momentum. | Retain f64 SIMD and the existing symmetric second-order tree. Measure tree construction, traversal and exact leaf pairs together. Keep stellar recoil direct. |
| Force-error-controlled FMM | [Dehnen 2014](https://arxiv.org/abs/1405.2255) estimates expansion error and controls its distribution. Its reported crossover above roughly 100,000 particles on a 16-core host is not a browser crossover prediction. | Added a bounded mutual acceptance experiment using acceleration scales and a geometric error estimate. It improves force accuracy but is slower in this sweep. This prototype is **not** a complete high-order FMM or a rigorous implementation of the paper's error bound. |
| P3T and individual cutoffs | [Oshino, Funato & Makino 2011](https://arxiv.org/abs/1101.5504), [GPLUM 2021](https://arxiv.org/abs/2007.15432) split short- and long-range interactions, with accurate local integration and tree forces farther away. | This is the strongest next integrator architecture for crowded systems. A production version needs a differentiable force/potential split, deterministic neighbor construction and encounter tests. The mixed GPU prototype explores the precision split, but does not claim to implement P3T's Hermite integration or GPLUM's individual cutoffs. |
| Kepler maps and secular accuracy | [WHFast](https://arxiv.org/abs/1506.01084), [Rein, Brown & Tamayo 2019](https://arxiv.org/abs/1908.03468) separate dominant Kepler motion and show that improved energy error need not improve secular frequencies. | Useful for well-separated planets, not a drop-in replacement for softened close encounters and changing body counts. A Kepler map would require a compatible softening correction and encounter policy. Added apsidal and phase diagnostics before adopting such a change. |
| Encounter-aware reversible hybrids | [TRACE 2024](https://arxiv.org/html/2405.03800v2) targets close encounters using an almost time-reversible switching scheme. | A good reference for future encounter switching. It is not an exactly symplectic universal solution, and irreversible collisions remain a separate problem. Frame-dependent or casually adaptive steps are excluded. |
| Wide-vector specialized Kepler integration | [WHFast512](https://arxiv.org/abs/2307.05683) specializes AVX-512 integration for small planetary systems. | Its speedups cannot be transferred directly to browser SIMD128 or thousands of mutually interacting particles. Current f64x2 direct leaves remain portable; scalar/SIMD parity and workload benchmarks are retained. |
| Selective precision on GPUs | [Grimm et al. 2023, GENGA](https://arxiv.org/abs/2309.08217) evaluates single precision for selected interactions while retaining double precision for Kepler motion. | Added a prototype with f64 state, direct stellar and close forces, and f32 distant forces. Upload/dispatch/readback at every force step dominates the measured benefit. It remains disabled in live simulation. |
| Test particles / semi-active populations | [REBOUND test particles](https://rebound.hanno-rein.de/ipython_examples/Testparticles/) separates active, passive and semi-active interaction models. | Added a native semi-active experiment with fixed mutual active/passive forces and no passive/passive gravity. It retains stellar recoil and has a well-defined changed Hamiltonian. It is unsuitable as a silent replacement for a self-gravitating accretion disk. |

## Experiments delivered

`npm run bench:tuning` now reports RMS, p99 and maximum force error, excluding the
dominating star, along with force/torque residuals and timing. It covers leaf sizes,
opening angles and two error-estimator tolerances on diffuse and clustered inputs.
The production acceptance rule is unchanged. A tighter error distribution without
a complete-workload improvement is not a reason to ship an optimization.

The WebGPU experiments cover tiled all-pairs force evaluation, GPU-resident f32
KDK evolution, and selective f32 distant forces with f64 integration and close
forces. They report transfers and readback. Returned masses now reflect the GPU's
actual f32 masses; energy accounting uses matching initial quantization. The
resident GPU moon comparison uses the same sixteen substeps as the CPU reference.
`gpu-lifetime.js` tests a pure moon family out to 600 years or the first sampled
accuracy failure, using matching quantized initial conditions to isolate
accumulated arithmetic error. None of these prototypes implements the complete
collision/migration/history/rendering pipeline on the GPU.

WGSL's runtime floating types do not provide ordinary f64, and its permitted
floating-point transformations matter for compensated arithmetic. A pair of f32
numbers is not automatically a portable double-precision substitute. Any future
compensated implementation must test its transformations and cross-adapter
results explicitly. [WGSL specification](https://www.w3.org/TR/WGSL/)

`cargo run --release --locked -p celestial-sim --example qualify-active` compares
1,024–8,192 particles under the full and semi-active collisionless models, then
measures 600 years of the changed model's own energy. Large speedups there come
from **omitted physical interactions**, not a faster implementation of the same
system. Collisions, accretion and long-term morphology require separate validation
before considering a clearly labeled optional mode.

The fixed satellite/disk resolution policy intentionally spends more computation
on the cases where reference checks found accumulated error. Ordinary massive
swarms retain their previous timestep. A future near/far integrator should recover
that extra cost while preserving the new orbital accuracy, not relax the accuracy
gates to regain throughput.
