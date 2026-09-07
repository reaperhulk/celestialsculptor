//! Reusable hot force data, independent of display metadata and serialized rules.
use crate::{Body, G, V2};
#[derive(Clone, Debug, Default)]
pub(crate) struct Forces {
    pub x: Vec<f64>,
    pub y: Vec<f64>,
    pub mass: Vec<f64>,
    pub output: Vec<V2>,
    softening2: f64,
    use_tree: bool,
    opening: f64,
    tree: crate::gravity_tree::Tree,
}
// Cache contents do not change the meaning of a physical state.
impl PartialEq for Forces {
    fn eq(&self, _: &Self) -> bool {
        true
    }
}
impl Forces {
    pub fn update(&mut self, bodies: &[Body], softening2: f64, tree_allowed: bool, opening: f64) {
        let use_tree = tree_allowed && bodies.len() >= 512;
        if self.use_tree == use_tree
            && self.opening.to_bits() == opening.to_bits()
            && self.x.len() == bodies.len()
            && self.softening2.to_bits() == softening2.to_bits()
            && bodies.iter().enumerate().all(|(i, b)| {
                self.x[i].to_bits() == b.pos.x.to_bits()
                    && self.y[i].to_bits() == b.pos.y.to_bits()
                    && self.mass[i].to_bits() == b.mass.to_bits()
            })
        {
            return;
        }
        self.softening2 = softening2;
        self.use_tree = use_tree;
        self.opening = opening;
        self.x.clear();
        self.y.clear();
        self.mass.clear();
        for b in bodies {
            self.x.push(b.pos.x);
            self.y.push(b.pos.y);
            self.mass.push(b.mass);
        }
        self.output.resize(bodies.len(), V2::default());
        self.output.fill(V2::default());
        if use_tree {
            self.tree.compute(
                &self.x,
                &self.y,
                &self.mass,
                softening2,
                opening,
                &mut self.output,
            );
            return;
        }
        #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
        crate::gravity_simd::accelerations(
            &self.x,
            &self.y,
            &self.mass,
            softening2,
            &mut self.output,
        );
        #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
        direct(&self.x, &self.y, &self.mass, softening2, &mut self.output);
    }
}
#[allow(dead_code)] // Also the independent accuracy reference for optimized backends.
pub(crate) fn direct(x: &[f64], y: &[f64], mass: &[f64], softening2: f64, a: &mut [V2]) {
    for i in 0..x.len() {
        for j in i + 1..x.len() {
            let d = V2::new(x[j] - x[i], y[j] - y[i]);
            let r2 = d.norm2() + softening2;
            let f = d.scale(G / (r2 * r2.sqrt()));
            a[i] = a[i].plus(f.scale(mass[j]));
            a[j] = a[j].minus(f.scale(mass[i]));
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cache_tracks_positions_masses_order_and_softening() {
        let mut w = crate::benchmark::system(8);
        let mut cache = Forces::default();
        for change in 0..7 {
            match change {
                1 => w.bodies[1].pos.x += 0.1,
                2 => w.bodies[2].mass *= 2.,
                3 => w.bodies.swap(1, 2),
                4 => {
                    w.bodies.pop();
                }
                _ => (),
            }
            let softening2 = if change == 5 { 0.001 } else { 1e-8 };
            cache.update(&w.bodies, softening2, false, 0.25);
            let mut expected = vec![V2::default(); w.bodies.len()];
            direct(&cache.x, &cache.y, &cache.mass, softening2, &mut expected);
            assert_eq!(cache.output, expected);
            cache.update(&w.bodies, softening2, false, 0.25);
            assert_eq!(cache.output, expected);
        }
    }
    #[test]
    fn replay_opening_changes_invalidate_the_force_cache() {
        let mut w = crate::World::new(crate::Config {
            mission: None,
            ..crate::Config::default()
        })
        .unwrap();
        w.apply(crate::Command::SeedSwarm {
            count: 511,
            disorder: 0.,
        })
        .unwrap();
        let mut cache = Forces::default();
        cache.update(&w.bodies, 1e-8, true, 0.25);
        let legacy = cache.output.clone();
        cache.update(&w.bodies, 1e-8, true, 0.35);
        assert_ne!(cache.output, legacy);
        let mut fresh = Forces::default();
        fresh.update(&w.bodies, 1e-8, true, 0.35);
        assert_eq!(cache.output, fresh.output);
        cache.update(&w.bodies, 1e-8, true, 0.25);
        assert_eq!(cache.output, legacy);
    }
}
