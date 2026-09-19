import { GpuOrbitProbe } from './gpu-orbit-probe.js';
import { orbitState, orbitError, orbitBalances } from './gpu-orbit-metrics.js';

function fixture(Simulation, count, moons = false) {
  const sim = new Simulation(JSON.stringify({ seed: 42, mission: null, star_mass: 1 }));
  try {
    if (moons) {
      sim.command(
        JSON.stringify({
          type: 'launch_mass',
          kind: 'giant',
          mass: 318,
          radius: 3,
          angle: 0,
          speed: 1,
        }),
      );
      for (const [distance, speed] of [
        [0.035, 1],
        [0.075, -1],
      ])
        sim.command(
          JSON.stringify({
            type: 'launch_moon',
            parent: 1,
            kind: 'rocky',
            mass: 0.003,
            distance,
            angle: 1,
            speed,
          }),
        );
    }
    sim.command(
      JSON.stringify({ type: 'seed_swarm', count: count - (moons ? 4 : 1), disorder: 0 }),
    );
    return orbitState(sim.body_frame());
  } finally {
    sim.free();
  }
}
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

export async function runGpuOrbitBenchmark({
  counts = [65, 1024, 4096, 8192],
  rounds = 3,
  fallback = false,
  progress = () => {},
} = {}) {
  const gpu = await GpuOrbitProbe.create({ fallback });
  if (!gpu) return { supported: false, reason: 'WebGPU compute is unavailable' };
  try {
    const { default: init, Simulation, OrbitProbe } = await import('./pkg/celestial_wasm.js');
    await init();
    const cases = [];
    for (const count of counts) {
      progress(`Measuring GPU-resident orbits · ${count.toLocaleString()} bodies…`);
      const initial = fixture(Simulation, count),
        ticks = 8,
        samples = { cpu: [], gpu: [] };
      let reference, candidate;
      for (let round = 0; round < rounds + 2; round++) {
        for (const mode of round % 2 ? ['gpu', 'cpu'] : ['cpu', 'gpu']) {
          // Accumulate enough measured work to exceed the browser's timer quantum.
          // Each repeat starts from the same state and excludes reset/allocation.
          let elapsed = 0,
            repetitions = 0;
          do {
            if (mode === 'gpu') {
              gpu.reset(initial);
              const start = performance.now();
              candidate = await gpu.advance(ticks);
              elapsed += performance.now() - start;
            } else {
              const cpu = new OrbitProbe(initial, false);
              try {
                const start = performance.now();
                cpu.advance(ticks);
                reference = cpu.state();
                elapsed += performance.now() - start;
              } finally {
                cpu.free();
              }
            }
            repetitions++;
          } while (elapsed < 5);
          if (round >= 2) samples[mode].push(elapsed / (ticks * repetitions));
        }
      }
      const cpuMsPerTick = median(samples.cpu),
        gpuMsPerTick = median(samples.gpu);
      cases.push({
        bodies: count,
        ticks,
        cpuMsPerTick,
        gpuMsPerTick,
        speedup: cpuMsPerTick / gpuMsPerTick,
        ...orbitError(reference, candidate),
        samples,
      });
    }
    progress('Checking one year of prograde and retrograde moon trajectories…');
    const initial = fixture(Simulation, 64, true),
      cpu = new OrbitProbe(initial, true);
    let reference, candidate;
    try {
      cpu.advance_refined(512, 16);
      reference = cpu.state();
    } finally {
      cpu.free();
    }
    gpu.reset(initial, 16);
    for (let i = 0; i < 16; i++) candidate = await gpu.advance(32);
    const effectiveInitial = Float64Array.from(initial, Math.fround);
    const before = orbitBalances(effectiveInitial),
      after = orbitBalances(candidate),
      cpuAfter = orbitBalances(reference);
    const phaseErrors = [2, 3].map((i) => {
      const angle = (s) => Math.atan2(s[i * 5 + 1] - s[6], s[i * 5] - s[5]);
      const d = angle(candidate) - angle(reference);
      return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    });
    const trajectory = {
      bodies: 64,
      ticks: 512,
      substeps: 16,
      ...orbitError(reference, candidate),
      moonPhaseErrorsRadians: phaseErrors,
      relativeEnergyDrift: (after.energy - before.energy) / Math.abs(before.energy),
      cpuRelativeEnergyDrift:
        (cpuAfter.energy - orbitBalances(initial).energy) / Math.abs(orbitBalances(initial).energy),
      momentumResidual:
        Math.hypot(after.px - before.px, after.py - before.py) / before.momentumScale,
    };
    // Readback must not affect integration. Two dispatch batches must match one.
    gpu.reset(initial);
    const whole = await gpu.advance(32);
    gpu.reset(initial);
    await gpu.advance(16);
    const split = await gpu.advance(16);
    const batchInvariant = whole.every((x, i) => Object.is(x, split[i]));
    return {
      supported: true,
      adapter: gpu.gravity.info,
      browser: navigator.userAgent,
      cases,
      trajectory,
      batchInvariant,
      livePhysicsEnabled: false,
      scope:
        'Collisionless moving-orbit qualification. Four KDK substeps per swarm tick and sixteen in the moon qualification; positions, velocities and acceleration stay on the GPU between steps. One state readback per batch. CPU uses production f64 SIMD/tree forces; GPU uses tiled direct f32. Collisions, migration, escapes, histories, rendering and cross-device replay are not implemented by this prototype.',
    };
  } finally {
    gpu.dispose();
  }
}
