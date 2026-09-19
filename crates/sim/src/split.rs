//! Near/far force split for tree-sized systems, after P3T (Oshino, Funato &
//! Makino 2011) with GPLUM-style individual cutoffs.
//!
//! Every pair force is cut into a near part, `F·W(r)`, and a far part,
//! `F·(1−W(r))`, with `W` a smooth step that is 1 inside `r_in` and 0 beyond
//! `r_out`. The far part of every pair is evaluated by the mutual tree (or
//! direct summation) at the coarse substep; the near part, only nonzero for the
//! few pairs inside their cutoff, is integrated directly at a finer step. Both
//! parts are central pair forces, so each is Hamiltonian and pairwise
//! symmetric: the composition stays symplectic and conserves momentum exactly,
//! and with fixed schedules it replays bit for bit.
//!
//! Cutoffs scale with each body's Hill radius, so a moon orbiting a giant is a
//! near pair while two grains of dust a tenth of an AU apart are not. Pairs
//! with the star use a fixed cutoff so the inner disk keeps fine steps.
use crate::{Body, DT, G, V2};

/// Coarse substeps per tick: the far (tree) evaluations.
pub const COARSE_SUBSTEPS: u32 = 4;
/// Fine near steps per coarse substep: 32 near steps per tick, the resolution
/// the migration world needed to keep its energy balance inside 2e-5.
pub const NEAR_STEPS: u32 = 8;
/// `r_out` as a multiple of the Hill radius; `r_in` is half of `r_out`, so an
/// authored moon (apoapsis below 0.7 Hill radii) is fully a near pair.
pub const CUT_SCALE: f64 = 2.0;
/// `r_out` for pairs with the star: the inner disk edge (0.25–0.35 AU) sits
/// inside `r_in = 0.3`.
pub const STAR_CUT: f64 = 0.6;
const INNER: f64 = 0.5;
/// Bodies whose reach exceeds this are paired by a full scan rather than the
/// sorted sweep, so the sweep window stays narrow.
const WIDE_REACH: f64 = 0.04;

/// Whether a system of this many bodies integrates with the split.
pub fn applies(bodies: usize) -> bool {
    crate::gravity::Forces::tree_for(bodies)
}

/// Per-body cutoff radii `r_out` from positions and masses (the star first).
pub fn cutoffs(x: &[f64], y: &[f64], mass: &[f64], out: &mut Vec<f64>) {
    out.clear();
    if x.is_empty() {
        return;
    }
    out.push(STAR_CUT);
    for i in 1..x.len() {
        let r = V2::new(x[i] - x[0], y[i] - y[0]).norm();
        out.push(CUT_SCALE * r * libm::cbrt(mass[i] / (3.0 * mass[0])));
    }
}

/// Weight of the far part at squared separation `r2` for a pair whose cutoff
/// is `r_out`: 0 inside `r_in`, 1 beyond `r_out`, a C² step between.
#[inline]
pub fn far_weight(r2: f64, r_out: f64) -> f64 {
    if r2 >= r_out * r_out {
        return 1.0;
    }
    let r_in = INNER * r_out;
    if r2 <= r_in * r_in {
        return 0.0;
    }
    let s = (r2.sqrt() - r_in) / (r_out - r_in);
    s * s * s * (s * (6.0 * s - 15.0) + 10.0)
}

/// Derived near-field state for one tick: cutoffs, candidate pairs and the
/// last near accelerations. Never saved; not part of physical equality.
#[derive(Clone, Debug, Default)]
pub struct Near {
    pub cuts: Vec<f64>,
    pub pairs: Vec<(u32, u32)>,
    pub accel: Vec<V2>,
    pub stale: bool,
    pub active: bool,
}
impl PartialEq for Near {
    fn eq(&self, _: &Self) -> bool {
        true
    }
}
impl Near {
    /// Rebuild cutoffs and candidate pairs for the current bodies.
    pub fn prepare(&mut self, bodies: &[Body]) {
        let x: Vec<f64> = bodies.iter().map(|b| b.pos.x).collect();
        let y: Vec<f64> = bodies.iter().map(|b| b.pos.y).collect();
        let vx: Vec<f64> = bodies.iter().map(|b| b.vel.x).collect();
        let vy: Vec<f64> = bodies.iter().map(|b| b.vel.y).collect();
        let mass: Vec<f64> = bodies.iter().map(|b| b.mass).collect();
        self.prepare_slices(&x, &y, &vx, &vy, &mass);
    }
    pub fn prepare_slices(&mut self, x: &[f64], y: &[f64], vx: &[f64], vy: &[f64], mass: &[f64]) {
        self.active = applies(x.len());
        self.stale = true;
        self.accel.clear();
        if !self.active {
            self.cuts.clear();
            self.pairs.clear();
            return;
        }
        cutoffs(x, y, mass, &mut self.cuts);
        near_pairs(x, y, vx, vy, &self.cuts, &mut self.pairs);
        self.accel.resize(x.len(), V2::default());
    }
    /// Near accelerations at the current positions (recomputed only when stale).
    pub fn evaluate(&mut self, bodies: &[Body], soft2: f64) {
        if !self.stale {
            return;
        }
        let x: Vec<f64> = bodies.iter().map(|b| b.pos.x).collect();
        let y: Vec<f64> = bodies.iter().map(|b| b.pos.y).collect();
        let mass: Vec<f64> = bodies.iter().map(|b| b.mass).collect();
        self.evaluate_slices(&x, &y, &mass, soft2);
    }
    pub fn evaluate_slices(&mut self, x: &[f64], y: &[f64], mass: &[f64], soft2: f64) {
        if !self.stale {
            return;
        }
        self.accel.resize(x.len(), V2::default());
        near_accelerations(x, y, mass, &self.cuts, &self.pairs, soft2, &mut self.accel);
        self.stale = false;
    }
}

/// Every pair that can come inside its cutoff during one tick: separation
/// below `r_out` plus twice the distance both bodies can drift in a tick.
pub fn near_pairs(
    x: &[f64],
    y: &[f64],
    vx: &[f64],
    vy: &[f64],
    cuts: &[f64],
    out: &mut Vec<(u32, u32)>,
) {
    out.clear();
    let n = x.len();
    let reach: Vec<f64> = (0..n)
        .map(|i| cuts[i] + 2.0 * DT * V2::new(vx[i], vy[i]).norm())
        .collect();
    let within = |i: usize, j: usize| {
        let limit = reach[i] + reach[j];
        let d = V2::new(x[j] - x[i], y[j] - y[i]);
        d.x.abs() <= limit && d.y.abs() <= limit && d.norm2() <= limit * limit
    };
    let mut narrow = Vec::with_capacity(n);
    for (i, &wide) in reach.iter().enumerate() {
        if wide > WIDE_REACH {
            for j in 0..n {
                if j != i && within(i, j) {
                    out.push((i.min(j) as u32, i.max(j) as u32));
                }
            }
        } else {
            narrow.push(i);
        }
    }
    narrow.sort_unstable_by(|&a, &b| x[a].total_cmp(&x[b]).then(a.cmp(&b)));
    for (at, &i) in narrow.iter().enumerate() {
        for &j in &narrow[at + 1..] {
            if x[j] - x[i] > reach[i] + WIDE_REACH {
                break;
            }
            if within(i, j) {
                out.push((i.min(j) as u32, i.max(j) as u32));
            }
        }
    }
    out.sort_unstable();
    out.dedup();
}

/// Near accelerations: the near part of every candidate pair, in pair order.
pub fn near_accelerations(
    x: &[f64],
    y: &[f64],
    mass: &[f64],
    cuts: &[f64],
    pairs: &[(u32, u32)],
    soft2: f64,
    out: &mut [V2],
) {
    out.fill(V2::default());
    for &(i, j) in pairs {
        let (i, j) = (i as usize, j as usize);
        let d = V2::new(x[j] - x[i], y[j] - y[i]);
        let raw = d.norm2();
        let w = 1.0 - far_weight(raw, cuts[i].max(cuts[j]));
        if w == 0.0 {
            continue;
        }
        let r2 = raw + soft2;
        let f = d.scale(G * w / (r2 * r2.sqrt()));
        out[i] = out[i].plus(f.scale(mass[j]));
        out[j] = out[j].minus(f.scale(mass[i]));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn weights_are_a_smooth_partition_of_unity() {
        let r_out = 0.4;
        assert_eq!(far_weight(0.0, r_out), 0.0);
        assert_eq!(far_weight(0.04, r_out), 0.0); // r = 0.2 = r_in
        assert_eq!(far_weight(0.16, r_out), 1.0); // r = r_out
        assert_eq!(far_weight(1.0, r_out), 1.0);
        let mut previous = 0.0;
        for k in 0..=100 {
            let r = 0.2 + 0.2 * f64::from(k) / 100.0;
            let w = far_weight(r * r, r_out);
            assert!((0.0..=1.0).contains(&w) && w >= previous, "monotone");
            previous = w;
        }
        // Zero cutoff: everything is far, so the split is the identity.
        assert_eq!(far_weight(1e-30, 0.0), 1.0);
    }
    #[test]
    fn near_pairs_cover_every_pair_that_can_reach_its_cutoff() {
        let mut w = crate::World::new(crate::Config {
            mission: None,
            ..crate::Config::default()
        })
        .unwrap();
        w.apply(crate::Command::SeedSwarm {
            count: 700,
            disorder: 0.5,
        })
        .unwrap();
        w.apply(crate::Command::LaunchMass {
            kind: crate::Kind::Giant,
            mass: 318.0,
            radius: 2.5,
            angle: 0.3,
            speed: 1.0,
        })
        .unwrap();
        let giant = w.bodies.last().unwrap().id;
        w.apply(crate::Command::LaunchMoon {
            parent: giant,
            kind: crate::Kind::Rocky,
            mass: 0.003,
            distance: 0.05,
            angle: 1.0,
            speed: 1.0,
        })
        .unwrap();
        let mut near = Near::default();
        near.prepare(&w.bodies);
        assert!(near.active);
        let b = &w.bodies;
        let gi = b.iter().position(|x| x.id == giant).unwrap();
        let mi = b.iter().position(|x| x.parent == Some(giant)).unwrap();
        assert!(near.pairs.contains(&(gi.min(mi) as u32, gi.max(mi) as u32)));
        // Brute force: every pair inside r_out + drift margin is listed.
        for i in 0..b.len() {
            for j in i + 1..b.len() {
                let limit =
                    near.cuts[i].max(near.cuts[j]) + 2.0 * DT * (b[i].vel.norm() + b[j].vel.norm());
                if b[i].pos.minus(b[j].pos).norm() <= limit {
                    assert!(near.pairs.contains(&(i as u32, j as u32)), "{i} {j}");
                }
            }
        }
        assert!(near.pairs.windows(2).all(|p| p[0] < p[1]), "sorted, unique");
        // Far weights plus near weights reproduce the full force for every pair.
        near.evaluate(&w.bodies, crate::SOFTENING.powi(2));
        let mut far = vec![V2::default(); b.len()];
        let x: Vec<f64> = b.iter().map(|p| p.pos.x).collect();
        let y: Vec<f64> = b.iter().map(|p| p.pos.y).collect();
        let m: Vec<f64> = b.iter().map(|p| p.mass).collect();
        crate::gravity::direct_cut(&x, &y, &m, &near.cuts, crate::SOFTENING.powi(2), &mut far);
        let mut full = vec![V2::default(); b.len()];
        crate::gravity::direct(&x, &y, &m, crate::SOFTENING.powi(2), &mut full);
        for i in 0..b.len() {
            let sum = far[i].plus(near.accel[i]);
            let scale = full[i].norm().max(1e-30);
            assert!(sum.minus(full[i]).norm() <= 1e-12 * scale, "body {i}");
        }
    }
}
