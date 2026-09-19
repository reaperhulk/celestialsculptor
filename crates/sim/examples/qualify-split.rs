//! Near/far split qualification: a giant with two authored moons inside a
//! 512-body low-mass disk, 600 years. The production split (tree far field)
//! is compared with the same split on direct far forces, isolating the tree's
//! approximation, and with a uniform sixteen-substep integration of the same
//! tree forces, isolating the integrator. Writes JSON to stdout, progress to
//! stderr.
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
    w.apply(Command::SeedSwarm {
        count: 508,
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
    assert_eq!(
        w.bodies.len(),
        512,
        "the tree and the split must be selected"
    );
    // Low-mass debris (0.016 Earth masses in total) isolates the split's own
    // error from hard encounters, as in the tree lifetime gate.
    let initial: Vec<f64> = w
        .bodies
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
    let host = w.bodies.iter().position(|b| b.id == giant).unwrap();
    let moons: Vec<usize> = w
        .bodies
        .iter()
        .enumerate()
        .filter(|(_, b)| b.parent == Some(giant))
        .map(|(i, _)| i)
        .collect();
    assert_eq!(moons.len(), 2);
    // (name, exact far forces, uniform reference, coarse substeps)
    let plans = [
        ("split-tree", false, false, 4u32),
        ("split-direct", true, false, 4),
        ("uniform-tree", false, true, 16),
    ];
    let runs: Vec<_> = std::thread::scope(|scope| {
        let handles: Vec<_> = plans
            .iter()
            .map(|&(name, exact, uniform, substeps)| {
                let initial = &initial;
                scope.spawn(move || {
                    let mut p = OrbitProbe::new(initial, exact).unwrap();
                    p.set_uniform(uniform);
                    let mut samples = vec![];
                    for year in 1..=600 {
                        p.advance_refined(512, substeps);
                        if year % 25 == 0 {
                            let s = p.state();
                            samples.push(json!({"year":year,"balances":balances(&s),"state":s}));
                            eprintln!("{name}: {year} years");
                        }
                    }
                    json!({"name":name,"exact":exact,"uniform":uniform,"substeps":substeps,"samples":samples})
                })
            })
            .collect();
        handles.into_iter().map(|h| h.join().unwrap()).collect()
    });
    println!(
        "{}",
        json!({"schema":1,"physics":checkpoint::PHYSICS_ID,"bodies":512,"host":host,"moons":moons,"debris_earth_masses":0.016,"initial_balances":balances(&initial),"runs":runs})
    );
}
