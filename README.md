# Celestial Sculptor

A browser orbital laboratory and ten-challenge campaign. Sculpt initial conditions,
run the universe, and discover what survives. Rust runs the physics and game rules;
WebAssembly runs in a dedicated worker; WebGL 2 presents a tiltable orbital plane.

## Product direction

Grounded but forgiving physics, challenges plus an unrestricted sandbox, desktop
and touch controls. Solar-system formation is compressed into playable experiments.
Gravity is real N-body gravity; contact radii are deliberately enlarged, collisions
merge inelastically, and the habitable zone is a simplified potential-life indicator.
No claim of geological, atmospheric, or biological simulation.

## Core contract

`celestial-sim` has no browser, renderer, wall clock, or OS randomness. Every action
goes through `World::apply`, including those used by the UI and scenario tests.
World time advances by 1/512 year per tick using four fixed leapfrog substeps.
The star responds to gravity. Mergers conserve mass, linear momentum, and angular
momentum (unresolved spin stores collision angular momentum); kinetic energy is
deliberately dissipated. Escapes are accounted for separately.

Seed + versioned configuration + tick-stamped commands reproduce a run. Exact
replays are guaranteed within the same executable/toolchain; native/WASM parity
uses numerical tolerances, not a promise of bit-identical chaotic trajectories.
Mission conditions and continuous hold timers are evaluated in Rust. The renderer
cannot complete a mission. All dimensions use AU, years, and solar masses internally.

Implementation and test pipeline are being built incrementally on `main`.
