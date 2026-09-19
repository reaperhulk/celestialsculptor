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
    tree: crate::gravity_tree::Tree,
}
// Cache contents do not change the meaning of a physical state.
impl PartialEq for Forces {
    fn eq(&self, _: &Self) -> bool {
        true
    }
}
impl Forces {
    fn stage(&mut self, bodies: &[Body], softening2: f64, use_tree: bool) {
        self.softening2 = softening2;
        self.use_tree = use_tree;
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
    }
    /// Whether a tree evaluation of this many bodies may be split into task
    /// groups computed elsewhere.
    pub fn tree_for(bodies: usize) -> bool {
        bodies >= 512
    }
    /// The staged request helpers evaluate: `[x…, y…, mass…]` for every body.
    pub fn request(&mut self, bodies: &[Body], softening2: f64) -> Vec<f64> {
        self.stage(bodies, softening2, true);
        let mut out = Vec::with_capacity(3 * bodies.len());
        out.extend_from_slice(&self.x);
        out.extend_from_slice(&self.y);
        out.extend_from_slice(&self.mass);
        out
    }
    /// Reduce helper outputs (all groups, ascending, concatenated) into
    /// accelerations. Bit-identical to `update` with a tree.
    pub fn reduce(
        &mut self,
        bodies: &[Body],
        softening2: f64,
        groups: &[f64],
        rebuild: bool,
    ) -> bool {
        self.stage(bodies, softening2, true);
        for j in 1..self.x.len() {
            direct_pair_into(
                0,
                j,
                &self.x,
                &self.y,
                &self.mass,
                softening2,
                &mut self.output,
            );
        }
        if !self.tree.stage(&self.x, &self.y, &self.mass, rebuild) {
            return false;
        }
        let mut at = 0;
        for g in 0..crate::gravity_tree::GROUPS {
            let len = self.tree.group_len(g);
            let Some(buffer) = groups.get(at..at + len) else {
                return false;
            };
            if !self.tree.add_group(g, buffer) {
                return false;
            }
            at += len;
        }
        if at != groups.len() {
            return false;
        }
        self.tree.finish(&self.x, &self.y, &mut self.output);
        true
    }
    /// Whether `output` already holds the accelerations for these bodies.
    pub fn current(&self, bodies: &[Body], softening2: f64, tree_allowed: bool) -> bool {
        let use_tree = tree_allowed && Self::tree_for(bodies.len());
        self.use_tree == use_tree
            && self.x.len() == bodies.len()
            && self.output.len() == bodies.len()
            && self.softening2.to_bits() == softening2.to_bits()
            && bodies.iter().enumerate().all(|(i, b)| {
                self.x[i].to_bits() == b.pos.x.to_bits()
                    && self.y[i].to_bits() == b.pos.y.to_bits()
                    && self.mass[i].to_bits() == b.mass.to_bits()
            })
    }
    pub fn update(&mut self, bodies: &[Body], softening2: f64, tree_allowed: bool, rebuild: bool) {
        let use_tree = tree_allowed && Self::tree_for(bodies.len());
        if self.current(bodies, softening2, tree_allowed) {
            return;
        }
        self.stage(bodies, softening2, use_tree);
        if use_tree {
            self.tree.compute(
                &self.x,
                &self.y,
                &self.mass,
                softening2,
                0.35,
                &mut self.output,
                rebuild,
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
fn direct_pair_into(
    i: usize,
    j: usize,
    x: &[f64],
    y: &[f64],
    mass: &[f64],
    soft2: f64,
    a: &mut [V2],
) {
    let d = V2::new(x[j] - x[i], y[j] - y[i]);
    let r2 = d.norm2() + soft2;
    let f = d.scale(G / (r2 * r2.sqrt()));
    a[i] = a[i].plus(f.scale(mass[j]));
    a[j] = a[j].minus(f.scale(mass[i]));
}

/// One helper's share of a force evaluation: the same partition as the owner,
/// the requested task groups, each output prefixed by its length.
#[derive(Clone, Debug, Default)]
pub struct ForceHelper {
    tree: crate::gravity_tree::Tree,
}
impl ForceHelper {
    pub fn new() -> Self {
        Self::default()
    }
    /// `state` is `[x…, y…, mass…]`; returns `[len, values…]` per requested group.
    pub fn compute(
        &mut self,
        state: &[f64],
        rebuild: bool,
        groups: &[u32],
    ) -> Result<Vec<f64>, String> {
        if !state.len().is_multiple_of(3) || state.iter().any(|v| !v.is_finite()) {
            return Err("Malformed force request".into());
        }
        let n = state.len() / 3;
        let (x, rest) = state.split_at(n);
        let (y, mass) = rest.split_at(n);
        if !rebuild && !self.tree.partitioned_for(n) {
            // A helper that missed the tick's rebuild must not partition on its
            // own; the owner evaluates this request itself and resyncs next tick.
            return Err("Helper has no partition for this request".into());
        }
        if !Forces::tree_for(n) || !self.tree.stage(x, y, mass, rebuild) {
            return Err("Force requests need a tree-sized system".into());
        }
        let mut out = Vec::new();
        for &g in groups {
            let g = g as usize;
            if g >= crate::gravity_tree::GROUPS {
                return Err("Unknown task group".into());
            }
            out.push(self.tree.group_len(g) as f64);
            self.tree
                .compute_group(g, crate::SOFTENING.powi(2), 0.35, &mut out);
        }
        Ok(out)
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
            cache.update(&w.bodies, softening2, false, true);
            let mut expected = vec![V2::default(); w.bodies.len()];
            direct(&cache.x, &cache.y, &cache.mass, softening2, &mut expected);
            assert_eq!(cache.output, expected);
            cache.update(&w.bodies, softening2, false, true);
            assert_eq!(cache.output, expected);
        }
    }
}
