//! The native vector kernels batch only independent per-pair arithmetic, so a
//! whole simulation is bit-identical with the one-lane scalar reference: the
//! same contract the WebAssembly SIMD build keeps with scalar WebAssembly.
//! One test per binary: the kernel choice is process-wide.
use celestial_sim::benchmark::OrbitProbe;
use celestial_sim::*;

fn bits(w: &World) -> Vec<u64> {
    w.bodies
        .iter()
        .flat_map(|b| [b.pos.x, b.pos.y, b.vel.x, b.vel.y, b.mass, b.spin])
        .map(f64::to_bits)
        .collect()
}
fn run(build: &dyn Fn() -> World, ticks: u32, scalar: bool) -> (Vec<u64>, u32) {
    set_scalar_kernels(scalar);
    let mut w = build();
    w.advance(ticks);
    (bits(&w), w.collisions)
}
fn probe(initial: &[f64], exact: bool, uniform: bool, scalar: bool) -> Vec<u64> {
    set_scalar_kernels(scalar);
    let mut p = OrbitProbe::new(initial, exact).unwrap();
    p.set_uniform(uniform);
    p.advance_refined(24, if uniform { 16 } else { 4 });
    p.state().into_iter().map(f64::to_bits).collect()
}

#[test]
fn vector_kernels_match_the_scalar_reference_bit_for_bit() {
    let sandbox = || {
        World::new(Config {
            mission: None,
            ..Config::default()
        })
        .unwrap()
    };
    // Direct summation with odd row lengths and a moon.
    let small = move || {
        let mut w = sandbox();
        for k in 0..37 {
            w.apply(Command::Launch {
                kind: if k % 5 == 0 { Kind::Giant } else { Kind::Rocky },
                radius: 0.6 + f64::from(k) * 0.11,
                angle: f64::from(k) * 2.399963229728653,
                speed: 1.0,
            })
            .unwrap();
        }
        w
    };
    // Tree leaves, the near/far split and its cutoffs, and mergers.
    let split = move || {
        let mut w = sandbox();
        w.apply(Command::SeedSwarm {
            count: 700,
            disorder: 0.3,
        })
        .unwrap();
        for (radius, angle) in [(1.2, 0.3), (2.5, 2.1)] {
            w.apply(Command::Launch {
                kind: Kind::Giant,
                radius,
                angle,
                speed: 1.0,
            })
            .unwrap();
        }
        w
    };
    for (name, build, ticks) in [
        ("direct", &small as &dyn Fn() -> World, 256),
        ("split", &split, 24),
    ] {
        let reference = run(build, ticks, true);
        assert_eq!(run(build, ticks, false), reference, "{name}");
    }
    // The qualification probes: exact and tree far fields, and the uniform reference.
    let mut w = split();
    w.advance(1);
    let initial: Vec<f64> = w
        .bodies
        .iter()
        .flat_map(|b| [b.pos.x, b.pos.y, b.vel.x, b.vel.y, b.mass])
        .collect();
    for (exact, uniform) in [(true, false), (false, false), (false, true)] {
        assert_eq!(
            probe(&initial, exact, uniform, false),
            probe(&initial, exact, uniform, true),
            "probe exact={exact} uniform={uniform}"
        );
    }
    set_scalar_kernels(false);
}
