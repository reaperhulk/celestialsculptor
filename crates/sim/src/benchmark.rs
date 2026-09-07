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
        self.run_config(theta, 8, repeats)
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
    pub fn statistics(&self) -> serde_json::Value {
        serde_json::json!({"direct_pairs":self.tree.direct_pairs,"cell_pairs":self.tree.cell_pairs})
    }
}

/// Whole-engine reference for convergence tests, never selected by UI cadence.
pub fn advance_exact(world: &mut World, ticks: u32) {
    for _ in 0..ticks {
        world.integrate_tick_with_solver(4, false);
    }
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
