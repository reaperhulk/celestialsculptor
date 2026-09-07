//! Symmetric mutual tree gravity from a second-order potential expansion.
//! Cell pairs exchange equal/opposite forces and matching tidal terms. Near
//! leaves remain direct; the star is always direct. All arithmetic is f64.
use crate::{G, V2};
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
    center: V2,
    mass: f64,
    radius: f64,
    q: Tensor,
    a: V2,
    tide: Tensor,
}
impl Node {
    fn leaf(self) -> bool {
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
    pub direct_pairs: usize,
    pub cell_pairs: usize,
}
impl PartialEq for Tree {
    fn eq(&self, _: &Self) -> bool {
        true
    }
}
impl Tree {
    pub fn compute(
        &mut self,
        x: &[f64],
        y: &[f64],
        mass: &[f64],
        soft2: f64,
        theta: f64,
        a: &mut [V2],
    ) {
        self.compute_impl::<8>(x, y, mass, soft2, theta, a);
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
            2 => self.compute_impl::<2>(x, y, mass, soft2, theta, a),
            4 => self.compute_impl::<4>(x, y, mass, soft2, theta, a),
            8 => self.compute_impl::<8>(x, y, mass, soft2, theta, a),
            16 => self.compute_impl::<16>(x, y, mass, soft2, theta, a),
            32 => self.compute_impl::<32>(x, y, mass, soft2, theta, a),
            _ => panic!("unsupported leaf size"),
        }
    }
    fn compute_impl<const LEAF_SIZE: usize>(
        &mut self,
        x: &[f64],
        y: &[f64],
        mass: &[f64],
        soft2: f64,
        theta: f64,
        a: &mut [V2],
    ) {
        self.order.clear();
        self.order.extend(1..x.len());
        self.nodes.clear();
        self.direct_pairs = 0;
        self.cell_pairs = 0;
        // Resolve the central star without approximation, including its recoil.
        for j in 1..x.len() {
            direct_pair(0, j, x, y, mass, soft2, a);
            self.direct_pairs += 1;
        }
        if self.order.is_empty() {
            return;
        }
        self.build::<LEAF_SIZE>(0, self.order.len(), x, y, mass);
        self.x.clear();
        self.y.clear();
        self.mass.clear();
        for &i in &self.order {
            self.x.push(x[i]);
            self.y.push(y[i]);
            self.mass.push(mass[i]);
        }
        self.local.resize(self.order.len(), V2::default());
        self.local.fill(V2::default());
        self.interact(0, 0, soft2, theta * theta);
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
    fn build<const LEAF_SIZE: usize>(
        &mut self,
        start: usize,
        end: usize,
        x: &[f64],
        y: &[f64],
        mass: &[f64],
    ) -> usize {
        let mut n = Node {
            start,
            end,
            left: usize::MAX,
            right: usize::MAX,
            ..Node::default()
        };
        let origin = V2::new(x[self.order[start]], y[self.order[start]]);
        let mut lo = origin;
        let mut hi = origin;
        for &i in &self.order[start..end] {
            n.mass += mass[i];
            n.center = n
                .center
                .plus(V2::new(x[i] - origin.x, y[i] - origin.y).scale(mass[i]));
            lo.x = lo.x.min(x[i]);
            lo.y = lo.y.min(y[i]);
            hi.x = hi.x.max(x[i]);
            hi.y = hi.y.max(y[i]);
        }
        n.center = origin.plus(n.center.scale(1. / n.mass));
        for &i in &self.order[start..end] {
            let d = V2::new(x[i], y[i]).minus(n.center);
            n.radius = n.radius.max(d.norm2());
            n.q.xx += mass[i] * d.x * d.x;
            n.q.xy += mass[i] * d.x * d.y;
            n.q.yy += mass[i] * d.y * d.y;
        }
        n.radius = n.radius.sqrt();
        let at = self.nodes.len();
        self.nodes.push(n);
        if end - start > LEAF_SIZE {
            let middle = (start + end) / 2;
            let axis = if hi.x - lo.x >= hi.y - lo.y { x } else { y };
            self.order[start..end].select_nth_unstable_by(middle - start, |&i, &j| {
                axis[i].total_cmp(&axis[j]).then(i.cmp(&j))
            });
            let left = self.build::<LEAF_SIZE>(start, middle, x, y, mass);
            let right = self.build::<LEAF_SIZE>(middle, end, x, y, mass);
            self.nodes[at].left = left;
            self.nodes[at].right = right;
        }
        at
    }
    #[allow(clippy::too_many_arguments)]
    fn interact(&mut self, ai: usize, bi: usize, soft2: f64, theta2: f64) {
        let a = self.nodes[ai];
        let b = self.nodes[bi];
        if ai == bi {
            if a.leaf() {
                for p in a.start..a.end {
                    self.leaf_row(p, p + 1, a.end, soft2);
                }
            } else {
                self.interact(a.left, a.left, soft2, theta2);
                self.interact(a.left, a.right, soft2, theta2);
                self.interact(a.right, a.right, soft2, theta2);
            }
            return;
        }
        let d = b.center.minus(a.center);
        let d2 = d.norm2();
        if (a.radius + b.radius).powi(2) < theta2 * d2 {
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
            self.nodes[ai].a = self.nodes[ai].a.plus(force.scale(1. / a.mass));
            self.nodes[bi].a = self.nodes[bi].a.minus(force.scale(1. / b.mass));
            self.nodes[ai].tide = self.nodes[ai].tide.plus(tide.scale(b.mass));
            self.nodes[bi].tide = self.nodes[bi].tide.plus(tide.scale(a.mass));
            self.cell_pairs += 1;
            return;
        }
        if a.leaf() && b.leaf() {
            for p in a.start..a.end {
                self.leaf_row(p, b.start, b.end, soft2);
            }
        } else if !a.leaf() && (b.leaf() || a.radius >= b.radius) {
            self.interact(a.left, bi, soft2, theta2);
            self.interact(a.right, bi, soft2, theta2);
        } else {
            self.interact(ai, b.left, soft2, theta2);
            self.interact(ai, b.right, soft2, theta2);
        }
    }
    fn leaf_row(&mut self, i: usize, start: usize, end: usize, soft2: f64) {
        #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
        crate::gravity_simd::range(
            &self.x,
            &self.y,
            &self.mass,
            soft2,
            &mut self.local,
            i,
            start,
            end,
        );
        #[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
        for j in start..end {
            direct_pair(i, j, &self.x, &self.y, &self.mass, soft2, &mut self.local);
        }
        self.direct_pairs += end - start;
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
#[allow(clippy::too_many_arguments)]
fn direct_pair(i: usize, j: usize, x: &[f64], y: &[f64], mass: &[f64], soft2: f64, a: &mut [V2]) {
    let d = V2::new(x[j] - x[i], y[j] - y[i]);
    let r2 = d.norm2() + soft2;
    let f = d.scale(G / (r2 * r2.sqrt()));
    a[i] = a[i].plus(f.scale(mass[j]));
    a[j] = a[j].minus(f.scale(mass[i]));
}
