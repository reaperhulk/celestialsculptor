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
    /// Subtrees the owner computed itself for the pending shared request.
    owned: [bool; crate::gravity_tree::SUBTREES],
    /// Near/far cutoffs the cached far forces were evaluated with (empty: none).
    cuts: Vec<f64>,
    /// Whether `output` holds whole forces for the staged positions. A shared
    /// request staged by the owner holds only a partial sum until `reduce`.
    complete: bool,
}
// Cache contents do not change the meaning of a physical state.
impl PartialEq for Forces {
    fn eq(&self, _: &Self) -> bool {
        true
    }
}
impl Forces {
    fn stage(&mut self, bodies: &[Body], softening2: f64, use_tree: bool, cuts: &[f64]) {
        self.softening2 = softening2;
        self.use_tree = use_tree;
        self.complete = false;
        self.x.clear();
        self.y.clear();
        self.mass.clear();
        for b in bodies {
            self.x.push(b.pos.x);
            self.y.push(b.pos.y);
            self.mass.push(b.mass);
        }
        self.cuts.clear();
        self.cuts.extend_from_slice(cuts);
        self.tree.set_cutoffs(cuts);
        self.output.resize(bodies.len(), V2::default());
        self.output.fill(V2::default());
    }
    /// Whether this many bodies use the tree, whose subtrees may be computed
    /// elsewhere.
    pub fn tree_for(bodies: usize) -> bool {
        bodies >= 512
    }
    /// The request helpers evaluate: `[x…, y…, mass…, cutoff…]` for every
    /// body. Reads only, so a failed round trip leaves the cache exactly as it
    /// was.
    pub fn request(bodies: &[Body], cuts: &[f64]) -> Vec<f64> {
        let mut out = Vec::with_capacity(4 * bodies.len());
        out.extend(bodies.iter().map(|b| b.pos.x));
        out.extend(bodies.iter().map(|b| b.pos.y));
        out.extend(bodies.iter().map(|b| b.mass));
        if cuts.len() == bodies.len() {
            out.extend_from_slice(cuts);
        } else {
            out.extend(std::iter::repeat_n(0.0, bodies.len()));
        }
        out
    }
    /// Stage a request the owner shares with helpers: star pass, partition,
    /// and the tasks touching the owner's own subtrees. Must precede `reduce`.
    pub fn compute_owned(
        &mut self,
        bodies: &[Body],
        softening2: f64,
        owned: &[u32],
        rebuild: bool,
        cuts: &[f64],
    ) -> bool {
        self.stage(bodies, softening2, true, cuts);
        for j in 1..self.x.len() {
            crate::gravity_tree::direct_pair_cut(
                0,
                j,
                &self.x,
                &self.y,
                &self.mass,
                &self.cuts,
                softening2,
                &mut self.output,
            );
        }
        if !self.tree.stage(&self.x, &self.y, &self.mass, rebuild) {
            self.x.clear();
            return false;
        }
        let mut mask = [false; crate::gravity_tree::SUBTREES];
        for &s in owned {
            if s as usize >= mask.len() {
                self.x.clear();
                return false;
            }
            mask[s as usize] = true;
        }
        if !owned.is_empty() {
            self.tree.sweep(&mask, softening2, 0.35);
        }
        self.owned = mask;
        true
    }
    /// Install the subtrees helpers computed, as `[subtree, len, values…]`
    /// records in any order, and finish the accelerations. Bit-identical to
    /// `update` with a tree.
    pub fn reduce(&mut self, bodies: &[Body], helpers: &[f64]) -> bool {
        let done = self.try_reduce(bodies, helpers);
        if !done {
            // A half-filled output must never look current to the next local
            // evaluation; the engine recomputes from scratch.
            self.x.clear();
        }
        done
    }
    fn try_reduce(&mut self, bodies: &[Body], helpers: &[f64]) -> bool {
        if self.x.len() != bodies.len() || !self.tree.partitioned_for(bodies.len()) {
            return false;
        }
        let mut installed = self.owned;
        let mut at = 0;
        while at < helpers.len() {
            let (Some(&s), Some(&len)) = (helpers.get(at), helpers.get(at + 1)) else {
                return false;
            };
            if s.fract() != 0.0 || len.fract() != 0.0 || s < 0.0 || len < 0.0 {
                return false;
            }
            let (s, len) = (s as usize, len as usize);
            if s >= crate::gravity_tree::SUBTREES || installed[s] || len != self.tree.subtree_len(s)
            {
                return false;
            }
            let Some(buffer) = helpers.get(at + 2..at + 2 + len) else {
                return false;
            };
            if !self.tree.install(s, buffer) {
                return false;
            }
            installed[s] = true;
            at += 2 + len;
        }
        if installed.iter().any(|done| !done) {
            return false;
        }
        self.tree.finish(&self.x, &self.y, &mut self.output);
        self.complete = true;
        true
    }
    /// Whether `output` already holds the accelerations for these bodies.
    /// Cutoffs are deliberately not compared: a tick's opening kick reuses the
    /// far forces of the previous tick's last evaluation, whose cutoffs differ
    /// only by the fraction each body's host distance moved in one tick.
    pub fn current(&self, bodies: &[Body], softening2: f64, tree_allowed: bool) -> bool {
        let use_tree = tree_allowed && Self::tree_for(bodies.len());
        self.complete
            && self.use_tree == use_tree
            && self.x.len() == bodies.len()
            && self.output.len() == bodies.len()
            && self.softening2.to_bits() == softening2.to_bits()
            && bodies.iter().enumerate().all(|(i, b)| {
                self.x[i].to_bits() == b.pos.x.to_bits()
                    && self.y[i].to_bits() == b.pos.y.to_bits()
                    && self.mass[i].to_bits() == b.mass.to_bits()
            })
    }
    /// Evaluate accelerations: the whole force without cutoffs, or the far part
    /// of every pair when `cuts` gives each body its near/far cutoff.
    pub fn update(
        &mut self,
        bodies: &[Body],
        softening2: f64,
        tree_allowed: bool,
        rebuild: bool,
        cuts: &[f64],
    ) {
        let use_tree = tree_allowed && Self::tree_for(bodies.len());
        if self.current(bodies, softening2, tree_allowed) {
            return;
        }
        self.stage(bodies, softening2, use_tree, cuts);
        // Every path below computes the whole force.
        self.complete = true;
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
        if self.cuts.is_empty() {
            crate::gravity_simd::accelerations(
                &self.x,
                &self.y,
                &self.mass,
                softening2,
                &mut self.output,
            );
        } else {
            crate::gravity_simd::accelerations_cut(
                &self.x,
                &self.y,
                &self.mass,
                &self.cuts,
                softening2,
                &mut self.output,
            );
        }
        #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
        if self.cuts.is_empty() {
            direct(&self.x, &self.y, &self.mass, softening2, &mut self.output);
        } else {
            direct_cut(
                &self.x,
                &self.y,
                &self.mass,
                &self.cuts,
                softening2,
                &mut self.output,
            );
        }
    }
}
/// One helper's share of a force evaluation: the same partition as the owner,
/// the tasks touching its owned subtrees, returned as tagged records.
#[derive(Clone, Debug, Default)]
pub struct ForceHelper {
    tree: crate::gravity_tree::Tree,
}
impl ForceHelper {
    pub fn new() -> Self {
        Self::default()
    }
    /// `state` is `[x…, y…, mass…, cutoff…]`; returns one `[subtree, len,
    /// values…]` record per owned subtree: its bodies (ax, ay) then its nodes.
    pub fn compute(
        &mut self,
        state: &[f64],
        rebuild: bool,
        owned: &[u32],
    ) -> Result<Vec<f64>, String> {
        if !state.len().is_multiple_of(4) || state.iter().any(|v| !v.is_finite()) {
            return Err("Malformed force request".into());
        }
        let n = state.len() / 4;
        let (x, rest) = state.split_at(n);
        let (y, rest) = rest.split_at(n);
        let (mass, cut) = rest.split_at(n);
        self.tree.set_cutoffs(cut);
        if !rebuild && !self.tree.partitioned_for(n) {
            // A helper that missed the tick's rebuild must not partition on its
            // own; the owner evaluates this request itself and resyncs next tick.
            return Err("Helper has no partition for this request".into());
        }
        if !Forces::tree_for(n) || !self.tree.stage(x, y, mass, rebuild) {
            return Err("Force requests need a tree-sized system".into());
        }
        let mut mask = [false; crate::gravity_tree::SUBTREES];
        for &s in owned {
            if s as usize >= mask.len() {
                return Err("Unknown subtree".into());
            }
            mask[s as usize] = true;
        }
        self.tree.sweep(&mask, crate::SOFTENING.powi(2), 0.35);
        let mut out = Vec::new();
        for (s, _) in mask.iter().enumerate().filter(|(_, own)| **own) {
            out.push(s as f64);
            out.push(self.tree.subtree_len(s) as f64);
            self.tree.extract(s, &mut out);
        }
        Ok(out)
    }
}

/// Far parts of every pair by direct summation, for exact-solver runs of a
/// system with near/far cutoffs.
#[allow(dead_code)]
pub(crate) fn direct_cut(
    x: &[f64],
    y: &[f64],
    mass: &[f64],
    cuts: &[f64],
    softening2: f64,
    a: &mut [V2],
) {
    for i in 0..x.len() {
        for j in i + 1..x.len() {
            crate::gravity_tree::direct_pair_cut(i, j, x, y, mass, cuts, softening2, a);
        }
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
            cache.update(&w.bodies, softening2, false, true, &[]);
            let mut expected = vec![V2::default(); w.bodies.len()];
            direct(&cache.x, &cache.y, &cache.mass, softening2, &mut expected);
            assert_eq!(cache.output, expected);
            cache.update(&w.bodies, softening2, false, true, &[]);
            assert_eq!(cache.output, expected);
        }
    }
}
