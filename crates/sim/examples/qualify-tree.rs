//! Persistent collisionless population: the solver cannot drop below the tree threshold.
//! Optional arguments `tree` and/or `exact` run only those solvers, so CI can
//! run each on its own machine; `scripts/qualify-tree.mjs` merges the outputs.
//! With neither, both run in turn.
//!
//! Each run also records every body's first close encounter: a separation
//! below `ENCOUNTER_HILL` mutual Hill radii. Such passes are physically
//! chaotic, so the gate judges tree accuracy on the bodies that have not had
//! one (and bounds how many have).
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
/// Close-encounter separation in mutual Hill radii: entering each other's
/// Hill sphere.
const ENCOUNTER_HILL: f64 = 1.0;
/// Marks, for every body without one yet, a separation below its encounter
/// distance at this tick: an x-sorted sweep, since the distances are small.
fn mark_encounters(s: &[f64], tick: u64, first: &mut [Option<u64>]) {
    let n = s.len() / 5;
    let (x0, y0, m0) = (s[0], s[1], s[4]);
    let r = |i: usize| (s[5 * i] - x0).hypot(s[5 * i + 1] - y0);
    let hill = |i: usize, j: usize| {
        ENCOUNTER_HILL * 0.5 * (r(i) + r(j)) * ((s[5 * i + 4] + s[5 * j + 4]) / (3.0 * m0)).cbrt()
    };
    let mut order: Vec<usize> = (1..n).collect();
    order.sort_unstable_by(|&a, &b| s[5 * a].total_cmp(&s[5 * b]));
    let (r_max, m_max) = (1..n).fold((0.0f64, 0.0f64), |(a, b), i| {
        (a.max(r(i)), b.max(s[5 * i + 4]))
    });
    let window = ENCOUNTER_HILL * r_max * (2.0 * m_max / (3.0 * m0)).cbrt();
    for (k, &i) in order.iter().enumerate() {
        for &j in &order[k + 1..] {
            if s[5 * j] - s[5 * i] > window {
                break;
            }
            let d = (s[5 * j] - s[5 * i]).hypot(s[5 * j + 1] - s[5 * i + 1]);
            if d < hill(i, j) {
                for b in [i, j] {
                    first[b].get_or_insert(tick);
                }
            }
        }
    }
}
fn main() {
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
    // One solver per process in CI and in the release script, which run them
    // concurrently; WebAssembly under WASI has no threads.
    let runs: Vec<_> = solvers
        .iter()
        .map(|&exact| {
            let mut p = OrbitProbe::new(&initial, exact).unwrap();
            let mut samples = vec![];
            let mut first = vec![None; initial.len() / 5];
            for year in 1..=600u64 {
                // One tick at a time is bit-identical to `advance(512)`.
                for tick in 0..512 {
                    p.advance(1);
                    mark_encounters(&p.state(), (year - 1) * 512 + tick + 1, &mut first);
                }
                if year % 25 == 0 {
                    let s = p.state();
                    samples.push(json!({"year":year,"balances":balances(&s),"state":s}));
                    eprintln!("persistent 512, exact={exact}: {year} years");
                }
            }
            json!({"exact":exact,"samples":samples,"first_encounter_tick":first})
        })
        .collect();
    println!(
        "{}",
        json!({"schema":1,"physics":checkpoint::PHYSICS_ID,"bodies":512,"debris_earth_masses":0.016,"initial_balances":balances(&initial),"runs":runs})
    );
}
