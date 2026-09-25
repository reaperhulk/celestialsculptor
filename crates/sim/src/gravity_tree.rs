//! Symmetric mutual tree gravity from a second-order potential expansion.
//! Cell pairs exchange equal/opposite forces and matching tidal terms. Near
//! leaves remain direct; the star is always direct. All arithmetic is f64.
use crate::{G, V2};
/// Owned subtrees per force evaluation: the subtrees at depth four. Every
/// pair of subtrees is one task, run in row-major order, so a body's
/// contributions always arrive in the same sequence whichever worker owns it.
pub const SUBTREES: usize = 16;
const SUBTREE_DEPTH: u32 = 4;
#[derive(Clone, Copy, Debug, Default)]
struct Tensor {
    xx: f64,
    xy: f64,
    yy: f64,
}
impl Tensor {
    fn apply(self, v: V2) -> V2 {
        V2::new(self.xx * v.x + self.xy * v.y, self.xy * v.x + self.yy * v.y)
    }
    fn plus(self, b: Self) -> Self {
        Self {
            xx: self.xx + b.xx,
            xy: self.xy + b.xy,
            yy: self.yy + b.yy,
        }
    }
    fn scale(self, s: f64) -> Self {
        Self {
            xx: self.xx * s,
            xy: self.xy * s,
            yy: self.yy * s,
        }
    }
}
#[derive(Clone, Copy, Debug, Default)]
struct Node {
    start: usize,
    end: usize,
    left: usize,
    right: usize,
    /// One past the last descendant in preorder, so a subtree is `at..end_node`.
    end_node: usize,
    center: V2,
    mass: f64,
    radius: f64,
    q: Tensor,
    a: V2,
    tide: Tensor,
    min_acceleration: f64,
    /// Largest near/far cutoff among the cell's bodies; zero without a split.
    max_cut: f64,
}
impl Node {
    fn leaf(&self) -> bool {
        self.left == usize::MAX
    }
}
#[derive(Clone, Debug, Default)]
pub(crate) struct Tree {
    x: Vec<f64>,
    y: Vec<f64>,
    mass: Vec<f64>,
    local: Vec<V2>,
    order: Vec<usize>,
    nodes: Vec<Node>,
    tolerance: f64,
    reference: Vec<f64>,
    /// Per-body near/far cutoffs in body order (empty: no split) and in tree order.
    cut_in: Vec<f64>,
    cut: Vec<f64>,
    pub direct_pairs: usize,
    pub cell_pairs: usize,
}
impl PartialEq for Tree {
    fn eq(&self, _: &Self) -> bool {
        true
    }
}
impl Tree {
    /// Install per-body cutoffs for the far kernel: pairs closer than their
    /// cutoff are weighted down, and cells are only accepted beyond it. An
    /// empty slice restores the plain kernel.
    pub fn set_cutoffs(&mut self, cuts: &[f64]) {
        self.cut_in.clear();
        self.cut_in.extend_from_slice(cuts);
    }
    fn max_cut(cut_in: &[f64], order: &[usize]) -> f64 {
        if cut_in.is_empty() {
            0.0
        } else {
            order.iter().map(|&i| cut_in[i].abs()).fold(0.0, f64::max)
        }
    }
    /// `rebuild` re-partitions the tree from the current positions. Between the
    /// substeps of one tick the partition is kept and only cell moments are
    /// refreshed: bodies drift a little across cell boundaries, cell radii still
    /// bound them exactly, so the opening test stays conservative.
    #[allow(clippy::too_many_arguments)]
    pub fn compute(
        &mut self,
        x: &[f64],
        y: &[f64],
        mass: &[f64],
        soft2: f64,
        theta: f64,
        a: &mut [V2],
        rebuild: bool,
    ) {
        self.compute_impl::<8, false>(x, y, mass, soft2, theta, a, rebuild);
    }
    /// Partition from the current positions without evaluating forces, so a
    /// tick can fix its structure before its substeps drift the bodies.
    pub fn prepare(&mut self, x: &[f64], y: &[f64], mass: &[f64]) {
        self.order.clear();
        self.order.extend(1..x.len());
        self.nodes.clear();
        if !self.order.is_empty() {
            self.build::<8, false>(0, self.order.len(), x, y, mass);
        }
    }
    #[allow(clippy::too_many_arguments)]
    pub fn compute_with_leaf_size(
        &mut self,
        x: &[f64],
        y: &[f64],
        mass: &[f64],
        soft2: f64,
        theta: f64,
        a: &mut [V2],
        leaf_size: usize,
    ) {
        match leaf_size {
            2 => self.compute_impl::<2, false>(x, y, mass, soft2, theta, a, true),
            4 => self.compute_impl::<4, false>(x, y, mass, soft2, theta, a, true),
            8 => self.compute_impl::<8, false>(x, y, mass, soft2, theta, a, true),
            16 => self.compute_impl::<16, false>(x, y, mass, soft2, theta, a, true),
            32 => self.compute_impl::<32, false>(x, y, mass, soft2, theta, a, true),
            _ => panic!("unsupported leaf size"),
        }
    }
    /// Experimental mutual acceptance using a conservative geometric force-error
    /// estimate and a previous acceleration scale. Not a rigorous FMM bound.
    #[allow(clippy::too_many_arguments)]
    pub fn compute_error_controlled(
        &mut self,
        x: &[f64],
        y: &[f64],
        mass: &[f64],
        soft2: f64,
        theta: f64,
        tolerance: f64,
        reference: &[f64],
        a: &mut [V2],
    ) {
        self.tolerance = tolerance;
        self.reference.clear();
        self.reference.extend_from_slice(reference);
        self.compute_impl::<8, true>(x, y, mass, soft2, theta, a, true);
    }
    #[allow(clippy::too_many_arguments)]
    fn compute_impl<const LEAF_SIZE: usize, const CONTROLLED: bool>(
        &mut self,
        x: &[f64],
        y: &[f64],
        mass: &[f64],
        soft2: f64,
        theta: f64,
        a: &mut [V2],
        rebuild: bool,
    ) {
        self.direct_pairs = 0;
        self.cell_pairs = 0;
        // Resolve the central star without approximation, including its recoil.
        for j in 1..x.len() {
            direct_pair_cut(0, j, x, y, mass, &self.cut_in, soft2, a);
            self.direct_pairs += 1;
        }
        if x.len() <= 1 {
            self.order.clear();
            self.nodes.clear();
            return;
        }
        if rebuild || CONTROLLED || self.nodes.is_empty() || self.order.len() + 1 != x.len() {
            self.order.clear();
            self.order.extend(1..x.len());
            self.nodes.clear();
            self.build::<LEAF_SIZE, CONTROLLED>(0, self.order.len(), x, y, mass);
            self.stage_local(x, y, mass);
        } else {
            self.stage_local(x, y, mass);
            self.refresh_moments();
        }
        if LEAF_SIZE == 8 && !CONTROLLED && self.subtree_roots().is_some() {
            // Live rules: the same task sweep helpers run, every side kept.
            self.sweep(&ALL_SUBTREES, soft2, theta);
        } else {
            self.interact::<CONTROLLED>(0, 0, soft2, theta * theta);
        }
        self.finish(x, y, a);
    }
    /// Permute positions into tree order and clear every accumulator.
    fn stage_local(&mut self, x: &[f64], y: &[f64], mass: &[f64]) {
        self.x.clear();
        self.y.clear();
        self.mass.clear();
        for &i in &self.order {
            self.x.push(x[i]);
            self.y.push(y[i]);
            self.mass.push(mass[i]);
        }
        self.cut.clear();
        if !self.cut_in.is_empty() {
            for &i in &self.order {
                self.cut.push(self.cut_in[i]);
            }
        }
        self.local.resize(self.order.len(), V2::default());
        self.local.fill(V2::default());
        for n in &mut self.nodes {
            n.a = V2::default();
            n.tide = Tensor::default();
        }
    }
    /// The `SUBTREES` subtrees at the owner depth, or None when the tree is too
    /// shallow (never the case above the tree threshold with eight-body leaves).
    fn subtree_roots(&self) -> Option<[usize; SUBTREES]> {
        let mut level = vec![0usize];
        for _ in 0..SUBTREE_DEPTH {
            let mut next = Vec::with_capacity(level.len() * 2);
            for &at in &level {
                let n = self.nodes.get(at)?;
                if n.leaf() {
                    return None;
                }
                next.push(n.left);
                next.push(n.right);
            }
            level = next;
        }
        level.try_into().ok()
    }
    /// Build or refresh the partition for a request whose subtrees will be
    /// computed by the owner and its helpers.
    pub fn stage(&mut self, x: &[f64], y: &[f64], mass: &[f64], rebuild: bool) -> bool {
        if x.len() <= 1 {
            self.order.clear();
            self.nodes.clear();
            return false;
        }
        if rebuild || self.nodes.is_empty() || self.order.len() + 1 != x.len() {
            self.prepare(x, y, mass);
            self.stage_local(x, y, mass);
        } else {
            self.stage_local(x, y, mass);
            self.refresh_moments();
        }
        self.subtree_roots().is_some()
    }
    /// Whether a partition for `n` bodies is held, so a refresh request can be
    /// honoured without silently building a different one.
    pub fn partitioned_for(&self, n: usize) -> bool {
        !self.nodes.is_empty() && self.order.len() + 1 == n
    }
    /// Length of subtree `s`'s output: its bodies (ax, ay) then its nodes
    /// (ax, ay, txx, txy, tyy).
    pub fn subtree_len(&self, s: usize) -> usize {
        let Some(roots) = self.subtree_roots() else {
            return 0;
        };
        let n = self.nodes[roots[s]];
        2 * (n.end - n.start) + 5 * (n.end_node - roots[s])
    }
    /// Run every task that touches an owned subtree, in the global row-major
    /// order of subtree pairs, accumulating both sides into the scratch
    /// accumulators. A body owned here therefore receives exactly the additions,
    /// in exactly the order, the engine's own sweep of all subtrees would make.
    pub fn sweep(&mut self, owned: &[bool; SUBTREES], soft2: f64, theta: f64) {
        let roots = self.subtree_roots().expect("staged tree with owner depth");
        let theta2 = theta * theta;
        for a in 0..SUBTREES {
            for b in a..SUBTREES {
                if owned[a] || owned[b] {
                    self.interact::<false>(roots[a], roots[b], soft2, theta2);
                }
            }
        }
    }
    /// Append subtree `s`'s accumulated bodies and nodes to `out`.
    pub fn extract(&self, s: usize, out: &mut Vec<f64>) {
        let roots = self.subtree_roots().expect("staged tree with owner depth");
        let n = self.nodes[roots[s]];
        for p in n.start..n.end {
            out.push(self.local[p].x);
            out.push(self.local[p].y);
        }
        for k in roots[s]..n.end_node {
            let m = self.nodes[k];
            out.extend([m.a.x, m.a.y, m.tide.xx, m.tide.xy, m.tide.yy]);
        }
    }
    /// Install a subtree computed elsewhere, replacing this tree's accumulators
    /// for exactly those bodies and nodes.
    pub fn install(&mut self, s: usize, buffer: &[f64]) -> bool {
        let Some(roots) = self.subtree_roots() else {
            return false;
        };
        if buffer.len() != self.subtree_len(s) {
            return false;
        }
        let n = self.nodes[roots[s]];
        let mut at = 0;
        for p in n.start..n.end {
            self.local[p] = V2::new(buffer[at], buffer[at + 1]);
            at += 2;
        }
        for k in roots[s]..n.end_node {
            self.nodes[k].a = V2::new(buffer[at], buffer[at + 1]);
            self.nodes[k].tide = Tensor {
                xx: buffer[at + 2],
                xy: buffer[at + 3],
                yy: buffer[at + 4],
            };
            at += 5;
        }
        true
    }
    /// Push the reduced cell accelerations and tides down to the bodies.
    pub fn finish(&mut self, x: &[f64], y: &[f64], a: &mut [V2]) {
        if self.nodes.is_empty() {
            return;
        }
        self.propagate(
            0,
            V2::default(),
            Tensor::default(),
            self.nodes[0].center,
            x,
            y,
            a,
        );
    }
    fn build<const LEAF_SIZE: usize, const CONTROLLED: bool>(
        &mut self,
        start: usize,
        end: usize,
        x: &[f64],
        y: &[f64],
        mass: &[f64],
    ) -> usize {
        let order = &self.order[start..end];
        let m = moments(end - start, |k| {
            let i = order[k];
            (x[i], y[i], mass[i])
        });
        let mut n = Node {
            start,
            end,
            left: usize::MAX,
            right: usize::MAX,
            min_acceleration: f64::INFINITY,
            center: m.center,
            mass: m.mass,
            radius: m.radius,
            q: m.q,
            max_cut: Self::max_cut(&self.cut_in, &self.order[start..end]),
            ..Node::default()
        };
        if CONTROLLED {
            for &i in &self.order[start..end] {
                n.min_acceleration = n.min_acceleration.min(self.reference[i]);
            }
        }
        let (lo, hi) = (m.lo, m.hi);
        let at = self.nodes.len();
        self.nodes.push(n);
        if end - start > LEAF_SIZE {
            let middle = (start + end) / 2;
            let axis = if hi.x - lo.x >= hi.y - lo.y { x } else { y };
            self.order[start..end].select_nth_unstable_by(middle - start, |&i, &j| {
                axis[i].total_cmp(&axis[j]).then(i.cmp(&j))
            });
            let left = self.build::<LEAF_SIZE, CONTROLLED>(start, middle, x, y, mass);
            let right = self.build::<LEAF_SIZE, CONTROLLED>(middle, end, x, y, mass);
            self.nodes[at].left = left;
            self.nodes[at].right = right;
        }
        self.nodes[at].end_node = self.nodes.len();
        at
    }
    /// Same partition, current positions: recompute every cell's mass, centre,
    /// bounding radius and quadrupole, and clear the accumulators. Reads the
    /// staged tree-order copies, so a cell's bodies are one contiguous run;
    /// the values and their order are those `build` reads through `order`.
    fn refresh_moments(&mut self) {
        let (x, y, mass, cut) = (&self.x, &self.y, &self.mass, &self.cut);
        for n in &mut self.nodes {
            let (s, e) = (n.start, n.end);
            let (xs, ys, ms) = (&x[s..e], &y[s..e], &mass[s..e]);
            let m = moments(e - s, |k| (xs[k], ys[k], ms[k]));
            n.max_cut = if cut.is_empty() {
                0.0
            } else {
                cut[s..e].iter().map(|c| c.abs()).fold(0.0, f64::max)
            };
            n.mass = m.mass;
            n.center = m.center;
            n.radius = m.radius;
            n.q = m.q;
            n.a = V2::default();
            n.tide = Tensor::default();
            n.min_acceleration = f64::INFINITY;
        }
    }
    #[allow(clippy::too_many_arguments)]
    fn interact<const CONTROLLED: bool>(&mut self, ai: usize, bi: usize, soft2: f64, theta2: f64) {
        // Read the two cells through references: a node is large, and most
        // visits only need its geometry.
        let (a, b) = (&self.nodes[ai], &self.nodes[bi]);
        if ai == bi {
            let (leaf, range, left, right) = (a.leaf(), (a.start, a.end), a.left, a.right);
            if leaf {
                self.leaf_block(range, range, true, soft2, true);
            } else {
                self.interact::<CONTROLLED>(left, left, soft2, theta2);
                self.interact::<CONTROLLED>(left, right, soft2, theta2);
                self.interact::<CONTROLLED>(right, right, soft2, theta2);
            }
            return;
        }
        let d = b.center.minus(a.center);
        let d2 = d.norm2();
        let extent = a.radius + b.radius;
        let estimated_error = if CONTROLLED {
            G * a.mass.max(b.mass) * extent.powi(2) / (d2.sqrt() - extent).max(1e-15).powi(4)
        } else {
            0.
        };
        // A cell pair is only approximated when every body pair is beyond its
        // near/far cutoff, so the far kernel stays the plain one.
        let cut = a.max_cut.max(b.max_cut);
        if extent.powi(2) < theta2 * d2
            && (cut == 0.0 || d2 >= (extent + cut).powi(2))
            && (!CONTROLLED
                || estimated_error
                    <= self.tolerance * a.min_acceleration.min(b.min_acceleration).max(1e-20))
        {
            let r2 = d2 + soft2;
            let inv = 1. / r2;
            let inv3 = inv * inv.sqrt();
            let inv5 = inv3 * inv;
            let inv7 = inv5 * inv;
            let s = a.q.scale(b.mass).plus(b.q.scale(a.mass));
            let sd = s.apply(d);
            let dot = d.x * sd.x + d.y * sd.y;
            let force = d
                .scale(G * (a.mass * b.mass * inv3 + 7.5 * dot * inv7 - 1.5 * (s.xx + s.yy) * inv5))
                .minus(sd.scale(3. * G * inv5));
            let tide = Tensor {
                xx: G * (3. * d.x * d.x * inv5 - inv3),
                xy: G * 3. * d.x * d.y * inv5,
                yy: G * (3. * d.y * d.y * inv5 - inv3),
            };
            let (a_mass, b_mass) = (a.mass, b.mass);
            self.nodes[ai].a = self.nodes[ai].a.plus(force.scale(1. / a_mass));
            self.nodes[bi].a = self.nodes[bi].a.minus(force.scale(1. / b_mass));
            self.nodes[ai].tide = self.nodes[ai].tide.plus(tide.scale(b_mass));
            self.nodes[bi].tide = self.nodes[bi].tide.plus(tide.scale(a_mass));
            self.cell_pairs += 1;
            return;
        }
        let (a_leaf, b_leaf) = (a.leaf(), b.leaf());
        if a_leaf && b_leaf {
            // Pairs beyond every cutoff weigh exactly one: the plain kernel is
            // bit-identical there and skips the weight arithmetic.
            let weighted = cut != 0.0 && d2 < (extent + cut).powi(2);
            let (rows, cols) = ((a.start, a.end), (b.start, b.end));
            self.leaf_block(rows, cols, false, soft2, weighted);
        } else if !a_leaf && (b_leaf || a.radius >= b.radius) {
            let (left, right) = (a.left, a.right);
            self.interact::<CONTROLLED>(left, bi, soft2, theta2);
            self.interact::<CONTROLLED>(right, bi, soft2, theta2);
        } else {
            let (left, right) = (b.left, b.right);
            self.interact::<CONTROLLED>(ai, left, soft2, theta2);
            self.interact::<CONTROLLED>(ai, right, soft2, theta2);
        }
    }
    /// Every pair of leaf rows against leaf columns (or within one leaf, each
    /// body against those after it), rows in order.
    fn leaf_block(
        &mut self,
        rows: (usize, usize),
        cols: (usize, usize),
        triangle: bool,
        soft2: f64,
        weighted: bool,
    ) {
        let cut: &[f64] = if weighted { &self.cut } else { &[] };
        crate::gravity_simd::block(
            &self.x,
            &self.y,
            &self.mass,
            cut,
            soft2,
            &mut self.local,
            rows,
            cols,
            triangle,
        );
        let n = rows.1 - rows.0;
        self.direct_pairs += if triangle {
            n * n.saturating_sub(1) / 2
        } else {
            n * (cols.1 - cols.0)
        };
    }
    #[allow(clippy::too_many_arguments)]
    fn propagate(
        &mut self,
        at: usize,
        parent_a: V2,
        parent_t: Tensor,
        parent_center: V2,
        x: &[f64],
        y: &[f64],
        out: &mut [V2],
    ) {
        let n = self.nodes[at];
        let a =
            n.a.plus(parent_a)
                .plus(parent_t.apply(n.center.minus(parent_center)));
        let tide = n.tide.plus(parent_t);
        if n.leaf() {
            for at in n.start..n.end {
                let i = self.order[at];
                out[i] = out[i]
                    .plus(self.local[at])
                    .plus(a)
                    .plus(tide.apply(V2::new(x[i], y[i]).minus(n.center)));
            }
        } else {
            self.propagate(n.left, a, tide, n.center, x, y, out);
            self.propagate(n.right, a, tide, n.center, x, y, out);
        }
    }
}
const ALL_SUBTREES: [bool; SUBTREES] = [true; SUBTREES];

struct Moments {
    mass: f64,
    center: V2,
    radius: f64,
    q: Tensor,
    lo: V2,
    hi: V2,
}
/// Cell moments in the same arithmetic order as the original single-pass build.
/// Mass, centre, bounding box, radius and quadrupole of `n` bodies, where
/// `at(k)` gives the k-th body's position and mass.
#[inline(always)]
fn moments(n: usize, at: impl Fn(usize) -> (f64, f64, f64)) -> Moments {
    let (x0, y0, _) = at(0);
    let origin = V2::new(x0, y0);
    let mut lo = origin;
    let mut hi = origin;
    let mut total = 0.;
    let mut center = V2::default();
    for k in 0..n {
        let (xi, yi, mi) = at(k);
        total += mi;
        center = center.plus(V2::new(xi - origin.x, yi - origin.y).scale(mi));
        lo.x = lo.x.min(xi);
        lo.y = lo.y.min(yi);
        hi.x = hi.x.max(xi);
        hi.y = hi.y.max(yi);
    }
    let center = origin.plus(center.scale(1. / total));
    let mut radius = 0.;
    let mut q = Tensor::default();
    for k in 0..n {
        let (xi, yi, mi) = at(k);
        let d = V2::new(xi, yi).minus(center);
        radius = f64::max(radius, d.norm2());
        q.xx += mi * d.x * d.x;
        q.xy += mi * d.x * d.y;
        q.yy += mi * d.y * d.y;
    }
    Moments {
        mass: total,
        center,
        radius: radius.sqrt(),
        q,
        lo,
        hi,
    }
}
/// The far part of one pair in world order (the star first): the plain force
/// weighted by `far_weight` when the system has cutoffs, so near pairs
/// contribute here only beyond `r_in`.
#[inline]
#[allow(clippy::too_many_arguments)]
pub(crate) fn direct_pair_cut(
    i: usize,
    j: usize,
    x: &[f64],
    y: &[f64],
    mass: &[f64],
    cut: &[f64],
    soft2: f64,
    a: &mut [V2],
) {
    if cut.is_empty() {
        return direct_pair(i, j, x, y, mass, soft2, a);
    }
    direct_pair_far(
        i,
        j,
        x,
        y,
        mass,
        crate::split::pair_cut(cut, i, j),
        soft2,
        a,
    );
}
/// The far part of one pair whose cutoff `r_out` the caller resolved. Tree
/// order never holds the star, so leaf pairs pass the larger magnitude.
#[inline]
#[allow(clippy::too_many_arguments)]
pub(crate) fn direct_pair_far(
    i: usize,
    j: usize,
    x: &[f64],
    y: &[f64],
    mass: &[f64],
    r_out: f64,
    soft2: f64,
    a: &mut [V2],
) {
    let d = V2::new(x[j] - x[i], y[j] - y[i]);
    let raw = d.norm2();
    let w = crate::split::far_weight(raw, r_out);
    let r2 = raw + soft2;
    let f = d.scale(G * w / (r2 * r2.sqrt()));
    a[i] = a[i].plus(f.scale(mass[j]));
    a[j] = a[j].minus(f.scale(mass[i]));
}
#[inline]
#[allow(clippy::too_many_arguments)]
fn direct_pair(i: usize, j: usize, x: &[f64], y: &[f64], mass: &[f64], soft2: f64, a: &mut [V2]) {
    let d = V2::new(x[j] - x[i], y[j] - y[i]);
    let r2 = d.norm2() + soft2;
    let f = d.scale(G / (r2 * r2.sqrt()));
    a[i] = a[i].plus(f.scale(mass[j]));
    a[j] = a[j].minus(f.scale(mass[i]));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leaf_pairs_never_take_the_star_rule_by_position() {
        // Five bodies share one leaf, so the first body in tree order is a
        // giant rather than the star. Its pair with nearby dust must keep the
        // giant's cutoff, exactly as a direct sum in world order does.
        let x = [0.0, 1.0, 1.02, 2.0, -1.5];
        let y = [0.0, 0.0, 0.01, 0.5, -0.2];
        let mass = [1.0, 1.0e-3, 1.0e-9, 2.0e-9, 3.0e-9];
        let mut cuts = Vec::new();
        crate::split::cutoffs(&x, &y, &mass, &mut cuts);
        assert!(
            cuts[1] > 0.1 && cuts[2] < 0.0,
            "fixture needs a giant and dust"
        );
        let soft2 = crate::SOFTENING.powi(2);
        let mut direct = vec![V2::default(); x.len()];
        crate::gravity::direct_cut(&x, &y, &mass, &cuts, soft2, &mut direct);
        let mut tree = Tree::default();
        tree.set_cutoffs(&cuts);
        let mut a = vec![V2::default(); x.len()];
        tree.compute(&x, &y, &mass, soft2, 0.35, &mut a, true);
        for (i, (t, d)) in a.iter().zip(&direct).enumerate() {
            let scale = d.norm2().sqrt().max(1e-300);
            assert!(
                t.minus(*d).norm2().sqrt() <= 1e-12 * scale,
                "body {i}: tree {t:?} direct {d:?}"
            );
        }
    }
}
