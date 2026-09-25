//! Near/far split qualification: a giant with two authored moons inside a
//! 512-body low-mass disk, 600 years. The production Wisdom–Holman split
//! (tree far field) is compared with the same split on direct far forces,
//! isolating the tree's approximation, and with an independent integrator: a
//! uniform eight-substep kick-drift-kick of the same tree forces. The disk leaves a gap around the
//! giant's orbit: the probe is collisionless, and a grain diving inside what
//! would be the giant's contact radius is an unresolved encounter in any
//! scheme, not a property of the split. Writes JSON to stdout, progress to
//! stderr. Arguments: an optional horizon in years (shorter for quick checks),
//! then optional plan names to run only those, so CI can run each plan on
//! its own machine; `scripts/qualify-split.mjs` merges the outputs.
use celestial_sim::{benchmark::OrbitProbe, *};
use serde_json::json;
fn balances(s: &[f64]) -> [f64; 4] {
    let mut out = [0.; 4];
    for (i, a) in s.chunks_exact(5).enumerate() {
        out[0] += 0.5 * a[4] * (a[2] * a[2] + a[3] * a[3]);
        out[1] += a[4] * (a[0] * a[3] - a[1] * a[2]);
        out[2] += a[4] * a[2];
        out[3] += a[4] * a[3];
        for b in s.chunks_exact(5).skip(i + 1) {
            out[0] -=
                G * a[4] * b[4] / ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + 1e-8).sqrt();
        }
    }
    out
}
fn main() {
    let mut w = World::new(Config {
        mission: None,
        ..Default::default()
    })
    .unwrap();
    let years: u32 = std::env::args()
        .nth(1)
        .and_then(|a| a.parse().ok())
        .unwrap_or(600);
    w.apply(Command::SeedSwarm {
        count: 800,
        disorder: 0.,
    })
    .unwrap();
    w.apply(Command::LaunchMass {
        kind: Kind::Giant,
        mass: 318.,
        radius: 3.,
        angle: 0.,
        speed: 1.,
    })
    .unwrap();
    let giant = w.bodies.last().unwrap().id;
    for (distance, speed) in [(0.05, 1.), (0.075, -1.)] {
        w.apply(Command::LaunchMoon {
            parent: giant,
            kind: Kind::Rocky,
            mass: 0.003,
            distance,
            angle: 1.,
            speed,
        })
        .unwrap();
    }
    // Keep the star, the giant, its moons and the first 508 grains outside a
    // gap of four Hill radii around the giant's orbit: 512 bodies, so the tree
    // and the split are selected. Low debris mass (16 Earth masses scaled by
    // a thousandth) isolates the split's own error, as in the tree lifetime gate.
    let star = w.bodies[0].pos;
    let mut kept = vec![];
    let mut grains = 0;
    for b in &w.bodies {
        if b.kind == Kind::Dust {
            let r = b.pos.minus(star).norm();
            if (2.2..=3.8).contains(&r) || grains >= 508 {
                continue;
            }
            grains += 1;
        }
        kept.push(b);
    }
    assert_eq!(kept.len(), 512, "the tree and the split must be selected");
    let initial: Vec<f64> = kept
        .iter()
        .flat_map(|b| {
            [
                b.pos.x,
                b.pos.y,
                b.vel.x,
                b.vel.y,
                if b.kind == Kind::Dust {
                    b.mass * 0.001
                } else {
                    b.mass
                },
            ]
        })
        .collect();
    let host = kept.iter().position(|b| b.id == giant).unwrap();
    let moons: Vec<usize> = kept
        .iter()
        .enumerate()
        .filter(|(_, b)| b.parent == Some(giant))
        .map(|(i, _)| i)
        .collect();
    assert_eq!(moons.len(), 2);
    // (name, exact far forces, uniform reference, reference substeps)
    let selected: Vec<String> = std::env::args().skip(2).collect();
    let plans: Vec<_> = [
        ("split-tree", false, false, 0u32),
        ("split-direct", true, false, 0),
        ("uniform-tree", false, true, 8),
    ]
    .into_iter()
    .filter(|(name, ..)| selected.is_empty() || selected.iter().any(|s| s == name))
    .collect();
    assert!(!plans.is_empty(), "unknown plan: {selected:?}");
    // One plan per process in CI and in the release script, which run them
    // concurrently; WebAssembly under WASI has no threads.
    let runs: Vec<_> = plans
        .iter()
        .map(|&(name, exact, uniform, substeps)| {
            let mut p = OrbitProbe::new(&initial, exact).unwrap();
            p.set_uniform(uniform);
            let mut samples = vec![];
            for year in 1..=years {
                if uniform {
                    p.advance_refined(512, substeps);
                } else {
                    p.advance(512);
                }
                if year % 25 == 0 || year == years {
                    let s = p.state();
                    samples.push(json!({"year":year,"balances":balances(&s),"state":s}));
                    eprintln!("{name}: {year} years");
                }
            }
            json!({"name":name,"exact":exact,"uniform":uniform,"substeps":substeps,"samples":samples})
        })
        .collect();
    println!(
        "{}",
        json!({"schema":1,"physics":checkpoint::PHYSICS_ID,"bodies":512,"years":years,"host":host,"moons":moons,"debris_earth_masses":0.016,"initial_balances":balances(&initial),"runs":runs})
    );
}
