use crate::{Command, Config, Kind, World};
pub fn system(bodies: usize) -> World {
    assert!((1..=64).contains(&bodies));
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    for i in 1..bodies {
        w.apply(Command::Launch {
            kind: Kind::Rocky,
            radius: 0.5 + i as f64 * 0.08,
            angle: i as f64 * 2.399_963_229_728_653,
            speed: 1.0,
        })
        .unwrap();
    }
    w
}

/// Graphics-independent candidate comparison. Does not alter gameplay rules.
pub struct ForceProbe {
    pub x: Vec<f64>,
    pub y: Vec<f64>,
    pub mass: Vec<f64>,
    pub output: Vec<crate::V2>,
    tree: crate::gravity_tree::Tree,
}
impl ForceProbe {
    pub fn new(count: usize, seed: u32, cluster: bool, star_mass: f64) -> Self {
        assert!((2..=8192).contains(&count));
        let mut state = u64::from(seed);
        let mut random = || {
            state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
            (state >> 11) as f64 / (1_u64 << 53) as f64
        };
        let mut p = Self {
            x: vec![0.],
            y: vec![0.],
            mass: vec![star_mass],
            output: vec![crate::V2::default(); count],
            tree: crate::gravity_tree::Tree::default(),
        };
        for i in 1..count {
            let r = if cluster {
                0.1 * random().sqrt()
            } else {
                0.5 + 4.5 * random().sqrt()
            };
            let angle = random() * std::f64::consts::TAU;
            let offset = if cluster { (i % 4) as f64 } else { 0. };
            p.x.push(r * libm::cos(angle) + offset);
            p.y.push(r * libm::sin(angle) + offset * 0.7);
            p.mass.push(crate::EARTH * (0.02 + random() * 0.98));
        }
        p
    }
    pub fn run(&mut self, theta: f64, repeats: u32) -> f64 {
        self.evaluate(theta, repeats, true)
    }
    /// One evaluation that may keep the tree partition from `prepare`.
    fn evaluate(&mut self, theta: f64, repeats: u32, rebuild: bool) -> f64 {
        // Keep benchmark-only leaf specializations out of the live/orbit build.
        for _ in 0..repeats {
            self.output.fill(crate::V2::default());
            if theta > 0. {
                self.tree.compute(
                    &self.x,
                    &self.y,
                    &self.mass,
                    1e-8,
                    theta,
                    &mut self.output,
                    rebuild,
                );
            } else {
                #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
                if theta == 0. {
                    crate::gravity_simd::accelerations(
                        &self.x,
                        &self.y,
                        &self.mass,
                        1e-8,
                        &mut self.output,
                    );
                } else {
                    crate::gravity::direct(&self.x, &self.y, &self.mass, 1e-8, &mut self.output);
                }
                #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
                crate::gravity::direct(&self.x, &self.y, &self.mass, 1e-8, &mut self.output);
            }
            std::hint::black_box(&self.output);
        }
        self.output[1].x
    }
    pub fn run_config(&mut self, theta: f64, leaf_size: usize, repeats: u32) -> f64 {
        assert!([2, 4, 8, 16, 32].contains(&leaf_size));
        for _ in 0..repeats {
            self.output.fill(crate::V2::default());
            if theta > 0. {
                self.tree.compute_with_leaf_size(
                    &self.x,
                    &self.y,
                    &self.mass,
                    1e-8,
                    theta,
                    &mut self.output,
                    leaf_size,
                );
            } else {
                #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
                if theta == 0. {
                    crate::gravity_simd::accelerations(
                        &self.x,
                        &self.y,
                        &self.mass,
                        1e-8,
                        &mut self.output,
                    );
                } else {
                    crate::gravity::direct(&self.x, &self.y, &self.mass, 1e-8, &mut self.output);
                }
                #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
                crate::gravity::direct(&self.x, &self.y, &self.mass, 1e-8, &mut self.output);
            }
            std::hint::black_box(&self.output);
        }
        self.output[1].x
    }
    pub fn run_error_controlled(&mut self, theta: f64, tolerance: f64, repeats: u32) {
        if self.output.iter().all(|a| a.norm2() == 0.) {
            self.run(-1., 1);
        }
        for _ in 0..repeats {
            let reference: Vec<_> = self.output.iter().map(|a| a.norm()).collect();
            self.output.fill(crate::V2::default());
            self.tree.compute_error_controlled(
                &self.x,
                &self.y,
                &self.mass,
                1e-8,
                theta,
                tolerance,
                &reference,
                &mut self.output,
            );
        }
    }
    pub fn statistics(&self) -> serde_json::Value {
        serde_json::json!({"direct_pairs":self.tree.direct_pairs,"cell_pairs":self.tree.cell_pairs})
    }
}

/// Whole-engine reference for convergence tests, never selected by UI cadence.
pub fn advance_exact(world: &mut World, ticks: u32) {
    for _ in 0..ticks {
        world.integrate_tick_with_solver(world.substeps(), false);
    }
}

/// Collisionless orbital qualification oracle. Same force law and four KDK
/// substeps as gameplay, without collisions, migration, escape or observations.
pub struct OrbitProbe {
    field: ForceProbe,
    velocity: Vec<crate::V2>,
    theta: f64,
    ready: bool,
    active_bodies: Option<usize>,
    /// Completed ticks, so batching an interval never changes the rebuild schedule.
    ticks: u64,
}
impl OrbitProbe {
    pub fn new(state: &[f64], exact: bool) -> Result<Self, &'static str> {
        if !state.len().is_multiple_of(5)
            || !(2..=8192).contains(&(state.len() / 5))
            || state.iter().any(|x| !x.is_finite())
            || state.chunks_exact(5).any(|p| p[4] <= 0.)
        {
            return Err("Use 2–8192 finite [x, y, vx, vy, positive mass] particles");
        }
        let n = state.len() / 5;
        Ok(Self {
            field: ForceProbe {
                x: state.chunks_exact(5).map(|p| p[0]).collect(),
                y: state.chunks_exact(5).map(|p| p[1]).collect(),
                mass: state.chunks_exact(5).map(|p| p[4]).collect(),
                output: vec![crate::V2::default(); n],
                tree: crate::gravity_tree::Tree::default(),
            },
            velocity: state
                .chunks_exact(5)
                .map(|p| crate::V2::new(p[2], p[3]))
                .collect(),
            theta: if exact || n < 512 { 0. } else { 0.35 },
            ready: false,
            active_bodies: None,
            ticks: 0,
        })
    }
    /// Experimental fixed interaction graph: all pairs involving an active body
    /// remain mutual, while passive/passive gravity is omitted. Different physics.
    pub fn set_active_bodies(&mut self, count: usize) {
        assert!((1..=self.velocity.len()).contains(&count));
        self.active_bodies = Some(count);
        self.ready = false;
    }
    fn update_probe_forces(&mut self, rebuild: bool) {
        if let Some(active) = self.active_bodies {
            let p = &mut self.field;
            p.output.fill(crate::V2::default());
            for i in 0..active {
                for j in i + 1..p.x.len() {
                    let d = crate::V2::new(p.x[j] - p.x[i], p.y[j] - p.y[i]);
                    let r2 = d.norm2() + 1e-8;
                    let f = d.scale(crate::G / (r2 * r2.sqrt()));
                    p.output[i] = p.output[i].plus(f.scale(p.mass[j]));
                    p.output[j] = p.output[j].minus(f.scale(p.mass[i]));
                }
            }
        } else {
            self.field.evaluate(self.theta, 1, rebuild);
        }
    }
    /// Gameplay cadence: the same substep policy as a live world of this size.
    pub fn advance(&mut self, ticks: u32) {
        let substeps = if self.velocity.len() >= 512 { 2 } else { 4 };
        self.advance_refined(ticks, substeps);
    }
    /// Qualification only: refine a fixed physical interval, independent of rendering.
    pub fn advance_refined(&mut self, ticks: u32, substeps: u32) {
        assert!([2, 4, 8, 16, 32, 64].contains(&substeps));
        if ticks == 0 {
            return;
        }
        let h = crate::DT / f64::from(substeps);
        if !self.ready {
            self.update_probe_forces(true);
            self.ready = true;
        }
        for _ in 0..ticks {
            for substep in 0..substeps {
                for (i, v) in self.velocity.iter_mut().enumerate() {
                    *v = v.plus(self.field.output[i].scale(h / 2.));
                    self.field.x[i] += v.x * h;
                    self.field.y[i] += v.y * h;
                }
                // Like a live tick: the first evaluation inside a tick re-partitions
                // (the opening forces are reused), later ones refresh moments. The
                // very first tick already partitioned when it evaluated its opening
                // forces, exactly as a live world does after an edit.
                self.update_probe_forces(substep == 0 && self.ticks > 0);
                for (v, a) in self.velocity.iter_mut().zip(&self.field.output) {
                    *v = v.plus(a.scale(h / 2.));
                }
            }
            self.ticks += 1;
        }
    }
    pub fn state(&self) -> Vec<f64> {
        (0..self.velocity.len())
            .flat_map(|i| {
                [
                    self.field.x[i],
                    self.field.y[i],
                    self.velocity[i].x,
                    self.velocity[i].y,
                    self.field.mass[i],
                ]
            })
            .collect()
    }
}

/// Where a large swarm's tick time goes. A diagnostic for scaling work; it
/// measures each phase on a clone so the profiled world is never disturbed.
pub fn phase_profile(count: u32, ticks: u32) -> serde_json::Value {
    use std::time::Instant;
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    w.apply(Command::SeedSwarm {
        count,
        disorder: 0.3,
    })
    .unwrap();
    w.advance(4);
    let ms = |start: Instant| start.elapsed().as_secs_f64() * 1000.;
    let mut total = 0.;
    let mut forces = 0.;
    let mut contacts = 0.;
    let mut history = 0.;
    let mut satellites = 0.;
    let mut resonances = 0.;
    let mut status = 0.;
    for _ in 0..ticks {
        let start = Instant::now();
        w.step();
        total += ms(start);
        // One evaluation per substep: the opening kick reuses the cached forces.
        let evaluations = f64::from(w.substeps());
        let start = Instant::now();
        std::hint::black_box(w.sample_forces(false));
        forces += ms(start) * evaluations;
        let mut c = w.clone();
        let start = Instant::now();
        c.merge_contacts(0.0);
        contacts += ms(start) * evaluations;
        let mut c = w.clone();
        let start = Instant::now();
        c.observe_history(false);
        history += ms(start);
        let mut c = w.clone();
        let start = Instant::now();
        c.refresh_satellites();
        satellites += ms(start) / 8.;
        let mut c = w.clone();
        c.tick = w.tick.next_multiple_of(8);
        let start = Instant::now();
        c.observe_resonances();
        resonances += ms(start) / 8.;
        let start = Instant::now();
        std::hint::black_box(w.status());
        status += ms(start);
    }
    let per = |v: f64| (v / f64::from(ticks) * 1000.).round() / 1000.;
    serde_json::json!({
        "bodies": w.bodies.len(),
        "ticks": ticks,
        "substeps": w.substeps(),
        "ms_per_tick": {
            "total": per(total),
            "forces": per(forces),
            "contacts": per(contacts),
            "history": per(history),
            "satellites_amortised": per(satellites),
            "resonances_amortised": per(resonances),
            "status_if_polled": per(status),
        },
        "ticks_per_second": (f64::from(ticks) / (total / 1000.)).round(),
    })
}

#[cfg(test)]
mod tree_tests {
    use super::*;
    #[test]
    fn tree_force_error_and_conservation_across_distributions() {
        for cluster in [false, true] {
            for seed in [1, 42, 123456] {
                // Exclude the dominating stellar force when measuring approximation error.
                let mut p = ForceProbe::new(1024, seed, cluster, 0.);
                p.run(-1., 1);
                let exact = p.output.clone();
                for theta in [0.2, 0.25, 0.35, 0.5] {
                    p.run(theta, 1);
                    let error = p
                        .output
                        .iter()
                        .zip(&exact)
                        .skip(1)
                        .map(|(a, b)| a.minus(*b).norm2())
                        .sum::<f64>();
                    let scale = exact.iter().skip(1).map(|a| a.norm2()).sum::<f64>();
                    let relative = (error / scale).sqrt();
                    assert!(
                        relative < 0.005,
                        "cluster={cluster} seed={seed} theta={theta}: {relative}"
                    );
                    let mut momentum = crate::V2::default();
                    let mut torque = 0.;
                    let mut norm = 0.;
                    let mut torque_norm = 0.;
                    for i in 0..p.mass.len() {
                        let force = p.output[i].scale(p.mass[i]);
                        momentum = momentum.plus(force);
                        torque += crate::V2::new(p.x[i], p.y[i]).cross(force);
                        norm += force.norm();
                        torque_norm += crate::V2::new(p.x[i], p.y[i]).norm() * force.norm();
                    }
                    assert!(momentum.norm() / norm < 1e-12);
                    assert!(torque.abs() / torque_norm < 1e-12);
                    let first = p.output.clone();
                    p.run(theta, 1);
                    assert_eq!(first, p.output);
                }
            }
        }
    }
    #[test]
    fn coincident_and_collinear_bodies_terminate_with_finite_forces() {
        let mut p = ForceProbe::new(1024, 42, true, 1.);
        for collinear in [false, true] {
            for i in 1..p.x.len() {
                p.x[i] = if collinear { i as f64 * 0.01 } else { 1. };
                p.y[i] = 0.;
            }
            p.run(0.35, 1);
            assert!(p.output.iter().all(|a| a.x.is_finite() && a.y.is_finite()));
        }
    }
}
