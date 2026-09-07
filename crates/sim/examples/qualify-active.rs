//! Optional changed-model experiment, never a live physics setting.
use celestial_sim::{benchmark::OrbitProbe, *};
use serde_json::json;
use std::time::Instant;
fn initial(count: u32) -> Vec<f64> {
    let mut w = World::new(Config {
        mission: None,
        ..Default::default()
    })
    .unwrap();
    w.apply(Command::SeedSwarm {
        count: count - 1,
        disorder: 0.,
    })
    .unwrap();
    w.bodies
        .iter()
        .flat_map(|b| [b.pos.x, b.pos.y, b.vel.x, b.vel.y, b.mass])
        .collect()
}
fn energy(s: &[f64], active: usize) -> f64 {
    let mut e = 0.;
    for (i, a) in s.chunks_exact(5).enumerate() {
        e += 0.5 * a[4] * (a[2] * a[2] + a[3] * a[3]);
        if i < active {
            for b in s.chunks_exact(5).skip(i + 1) {
                e -=
                    G * a[4] * b[4] / ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + 1e-8).sqrt();
            }
        }
    }
    e
}
fn main() {
    let mut timings = vec![];
    for count in [1024, 4096, 8192] {
        let s = initial(count);
        for active in [None, Some(1), Some(8)] {
            let mut samples = vec![];
            for _ in 0..5 {
                let mut p = OrbitProbe::new(&s, false).unwrap();
                if let Some(n) = active {
                    p.set_active_bodies(n);
                }
                let start = Instant::now();
                p.advance(64);
                std::hint::black_box(p.state());
                samples.push(start.elapsed().as_secs_f64() * 1000. / 64.);
            }
            samples.sort_by(f64::total_cmp);
            timings.push(json!({"bodies":count,"active":active,"median_ms_per_tick":samples[2]}));
        }
    }
    let s = initial(1024);
    let mut stability = vec![];
    for active in [1, 8] {
        let mut p = OrbitProbe::new(&s, false).unwrap();
        p.set_active_bodies(active);
        let e0 = energy(&s, active);
        let mut samples = vec![];
        for year in 1..=600 {
            p.advance(512);
            if year % 25 == 0 {
                let state = p.state();
                samples.push(json!({"year":year,"relative_model_energy_error":(energy(&state,active)-e0)/e0}));
            }
        }
        stability.push(json!({"active":active,"bodies":1024,"samples":samples}));
    }
    println!(
        "{}",
        json!({"schema":1,"model":"Semi-active massive particles: star recoil and active/passive reaction retained; passive/passive gravity omitted. This is not the self-gravitating game.","physics":checkpoint::PHYSICS_ID,"live_enabled":false,"timings":timings,"stability":stability})
    );
}
