//! Persistent collisionless population: the solver cannot drop below the tree threshold.
//! Optional arguments `tree` and/or `exact` run only those solvers, so CI can
//! run each on its own machine; `scripts/qualify-tree.mjs` merges the outputs.
//! With neither, both run concurrently.
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
    eprintln!("gravity kernel: {}", selected_kernel());
    let mut w = World::new(Config {
        mission: None,
        ..Default::default()
    })
    .unwrap();
    w.apply(Command::SeedSwarm {
        count: 511,
        disorder: 0.,
    })
    .unwrap();
    // Cold low-mass disk isolates accumulation of tree error from unresolved hard encounters.
    let initial: Vec<f64> = w
        .bodies
        .iter()
        .flat_map(|b| {
            [
                b.pos.x,
                b.pos.y,
                b.vel.x,
                b.vel.y,
                if b.id == 0 { b.mass } else { b.mass * 0.001 },
            ]
        })
        .collect();
    let selected: Vec<String> = std::env::args().skip(1).collect();
    let solvers: Vec<bool> = [false, true]
        .into_iter()
        .filter(|&exact| {
            let name = if exact { "exact" } else { "tree" };
            selected.is_empty() || selected.iter().any(|s| s == name)
        })
        .collect();
    assert!(!solvers.is_empty(), "unknown solver: {selected:?}");
    let runs: Vec<_> = std::thread::scope(|scope| {
        let handles: Vec<_> = solvers
            .iter()
            .map(|&exact| {
                let initial = &initial;
                scope.spawn(move || {
                    let mut p = OrbitProbe::new(initial, exact).unwrap();
                    let mut samples = vec![];
                    for year in 1..=600 {
                        p.advance(512);
                        if year % 25 == 0 {
                            let s = p.state();
                            samples.push(json!({"year":year,"balances":balances(&s),"state":s}));
                            eprintln!("persistent 512, exact={exact}: {year} years");
                        }
                    }
                    json!({"exact":exact,"samples":samples})
                })
            })
            .collect();
        handles.into_iter().map(|h| h.join().unwrap()).collect()
    });
    println!(
        "{}",
        json!({"schema":1,"physics":checkpoint::PHYSICS_ID,"bodies":512,"debris_earth_masses":0.016,"initial_balances":balances(&initial),"runs":runs})
    );
}
