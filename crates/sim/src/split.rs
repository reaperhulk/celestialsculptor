//! Near/far force split for tree-sized systems, after P3T (Oshino, Funato &
//! Makino 2011) with GPLUM-style individual cutoffs.
//!
//! Tree-sized systems integrate with a Wisdom–Holman splitting in democratic
//! heliocentric coordinates (`wh`): every body follows its exact Kepler orbit
//! about the star, and the body–body forces are kicks. Every body–body pair
//! force is cut into a near part, `F·W(r)`, and a far part, `F·(1−W(r))`, with
//! `W` a smooth step that is 1 inside `r_in` and 0 beyond `r_out`. The far part
//! of every pair is evaluated by the mutual tree (or direct summation) once per
//! step of `STEP_TICKS` ticks; the near part, only nonzero for the few pairs
//! inside their cutoff, is integrated inside the Kepler drift at a fine step.
//! Both parts are central pair forces, so each is Hamiltonian and pairwise
//! symmetric: the composition stays symplectic and conserves momentum exactly,
//! and with fixed schedules it replays bit for bit.
//!
//! Cutoffs scale with each massive body's Hill radius, so a moon orbiting a
//! giant, or dust passing it, is a near pair. Dust carries a small fixed
//! cutoff, stored negated, so close dust–dust encounters also take fine
//! steps. The star's cutoff is effectively infinite: its pairs are neither
//! near nor far, but the Kepler drift itself.
use crate::{Body, DT, G, V2};

/// Ticks per far-field step: one tree evaluation per step.
pub const STEP_TICKS: u64 = 4;
/// Fine near steps per tick, the resolution the migration world needed to
/// keep its energy balance inside 2e-5.
pub const FINE_STEPS: u32 = 32;
/// `r_out` as a multiple of the Hill radius; `r_in` is half of `r_out`, so an
/// authored moon (apoapsis below 0.7 Hill radii) is fully a near pair.
pub const CUT_SCALE: f64 = 2.0;
/// Bodies below this mass (the dust boundary) carry the dust cutoff.
pub const FINE_MASS: f64 = 0.5 * crate::EARTH;
/// The star's cutoff: every pair with it has far weight exactly zero (its
/// square overflows), so the star's pairs are wholly the Kepler drift. Finite,
/// so force requests stay finite.
pub const STAR_CUT: f64 = f64::MAX;
/// `r_out` for dust–dust pairs: close encounters between grains take the
/// fine steps, far beyond the softening length.
pub const DUST_CUT: f64 = 2e-3;
const INNER: f64 = 0.5;

/// Whether a step beginning with this many bodies integrates with the split.
pub fn applies(bodies: usize) -> bool {
    crate::gravity::Forces::tree_for(bodies)
}

/// Per-body cutoff radii `r_out` from positions and masses (the star first,
/// with `STAR_CUT`); dust carries `-DUST_CUT`.
pub fn cutoffs(x: &[f64], y: &[f64], mass: &[f64], out: &mut Vec<f64>) {
    out.clear();
    if x.is_empty() {
        return;
    }
    out.push(STAR_CUT);
    for i in 1..x.len() {
        if mass[i] < FINE_MASS {
            out.push(-DUST_CUT);
            continue;
        }
        let r = V2::new(x[i] - x[0], y[i] - y[0]).norm();
        out.push(CUT_SCALE * r * libm::cbrt(mass[i] / (3.0 * mass[0])));
    }
}

/// A pair's cutoff: the larger of the two magnitudes. Every pair with the
/// star takes `STAR_CUT`, so its far weight is zero. Every kernel and the pair
/// search use this.
#[inline]
pub fn pair_cut(cut: &[f64], i: usize, j: usize) -> f64 {
    cut[i].abs().max(cut[j].abs())
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
    /// Bodies with at least one candidate pair: the only ones a near kick moves.
    pub members: Vec<u32>,
    pub accel: Vec<V2>,
    pub stale: bool,
    pub active: bool,
    /// Reused staging buffers, so a fine step allocates nothing.
    x: Vec<f64>,
    y: Vec<f64>,
    mass: Vec<f64>,
}
impl PartialEq for Near {
    fn eq(&self, _: &Self) -> bool {
        true
    }
}
impl Near {
    /// Rebuild cutoffs and candidate pairs for the current bodies. A step
    /// begun with the split keeps it to its end, whatever the body count.
    pub fn prepare(&mut self, bodies: &[Body]) {
        self.stage(bodies);
        let vx: Vec<f64> = bodies.iter().map(|b| b.vel.x).collect();
        let vy: Vec<f64> = bodies.iter().map(|b| b.vel.y).collect();
        let (x, y, mass) = (
            std::mem::take(&mut self.x),
            std::mem::take(&mut self.y),
            std::mem::take(&mut self.mass),
        );
        self.prepare_slices(&x, &y, &vx, &vy, &mass);
        (self.x, self.y, self.mass) = (x, y, mass);
    }
    /// No split: the plain scheme runs.
    pub(crate) fn clear(&mut self) {
        self.stale = true;
        self.active = false;
        self.accel.clear();
        self.cuts.clear();
        self.pairs.clear();
        self.members.clear();
    }
    fn stage(&mut self, bodies: &[Body]) {
        self.x.clear();
        self.y.clear();
        self.mass.clear();
        for b in bodies {
            self.x.push(b.pos.x);
            self.y.push(b.pos.y);
            self.mass.push(b.mass);
        }
    }
    pub fn prepare_slices(&mut self, x: &[f64], y: &[f64], vx: &[f64], vy: &[f64], mass: &[f64]) {
        self.clear();
        cutoffs(x, y, mass, &mut self.cuts);
        self.find_pairs(x, y, vx, vy);
    }
    /// New candidate pairs for the current positions, keeping the cutoffs: the
    /// far forces of a step were evaluated with them. Recomputes everything if
    /// the body set changed.
    pub fn refresh(&mut self, bodies: &[Body]) {
        if self.cuts.len() != bodies.len() {
            return self.prepare(bodies);
        }
        self.stage(bodies);
        let vx: Vec<f64> = bodies.iter().map(|b| b.vel.x).collect();
        let vy: Vec<f64> = bodies.iter().map(|b| b.vel.y).collect();
        let (x, y) = (std::mem::take(&mut self.x), std::mem::take(&mut self.y));
        self.stale = true;
        self.find_pairs(&x, &y, &vx, &vy);
        (self.x, self.y) = (x, y);
    }
    /// `refresh` for slices.
    pub fn refresh_slices(&mut self, x: &[f64], y: &[f64], vx: &[f64], vy: &[f64], mass: &[f64]) {
        if self.cuts.len() != x.len() {
            return self.prepare_slices(x, y, vx, vy, mass);
        }
        self.stale = true;
        self.find_pairs(x, y, vx, vy);
    }
    fn find_pairs(&mut self, x: &[f64], y: &[f64], vx: &[f64], vy: &[f64]) {
        near_pairs(x, y, vx, vy, &self.cuts, &mut self.pairs);
        self.active = !self.pairs.is_empty();
        self.members.clear();
        self.members
            .extend(self.pairs.iter().flat_map(|&(i, j)| [i, j]));
        self.members.sort_unstable();
        self.members.dedup();
        self.accel.resize(x.len(), V2::default());
    }
    /// Near accelerations at the current positions (recomputed only when stale).
    pub fn evaluate(&mut self, bodies: &[Body], soft2: f64) {
        if !self.stale {
            return;
        }
        self.stage(bodies);
        let (x, y, mass) = (
            std::mem::take(&mut self.x),
            std::mem::take(&mut self.y),
            std::mem::take(&mut self.mass),
        );
        self.evaluate_slices(&x, &y, &mass, soft2);
        (self.x, self.y, self.mass) = (x, y, mass);
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
/// below the pair's cutoff plus twice the distance the pair can close in a
/// tick. Massive bodies scan a wide window of the x-sorted others; dust pairs
/// only need a window of one dust cutoff plus their closing margin.
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
    if n < 2 {
        return;
    }
    // The star's pairs are the Kepler drift: never candidates.
    let cut_max = cuts[1..].iter().fold(0.0, |a: f64, &b| a.max(b.abs()));
    let speed: Vec<f64> = (0..n).map(|i| V2::new(vx[i], vy[i]).norm()).collect();
    let speed_max = speed.iter().fold(0.0, |a: f64, &b| a.max(b));
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_unstable_by(|&a, &b| x[a].total_cmp(&x[b]).then(a.cmp(&b)));
    let xs: Vec<f64> = order.iter().map(|&i| x[i]).collect();
    let check = |i: usize, j: usize, out: &mut Vec<(u32, u32)>| {
        if j == 0 {
            return;
        }
        let cut = pair_cut(cuts, i, j);
        let closing = V2::new(vx[j] - vx[i], vy[j] - vy[i]).norm();
        let limit = cut + 2.0 * DT * closing;
        let d = V2::new(x[j] - x[i], y[j] - y[i]);
        if d.x.abs() <= limit && d.y.abs() <= limit && d.norm2() <= limit * limit {
            out.push((i.min(j) as u32, i.max(j) as u32));
        }
    };
    for i in 1..n {
        if cuts[i] > 0.0 {
            // Every pair limit is at most this window, so the scan is complete.
            let window = cuts[i] + cut_max + 2.0 * DT * (speed[i] + speed_max);
            let from = xs.partition_point(|&v| v < x[i] - window);
            for &j in &order[from..] {
                if x[j] - x[i] > window {
                    break;
                }
                if j != i {
                    check(i, j, out);
                }
            }
        }
    }
    // Dust against dust: each pair once, from its lower x, forward only.
    let dust_speed_max = (1..n)
        .filter(|&i| cuts[i] < 0.0)
        .fold(0.0, |a: f64, i| a.max(speed[i]));
    for (k, &i) in order.iter().enumerate() {
        if cuts[i] >= 0.0 {
            continue;
        }
        let window = DUST_CUT + 2.0 * DT * (speed[i] + dust_speed_max);
        for &j in &order[k + 1..] {
            if x[j] - x[i] > window {
                break;
            }
            if cuts[j] < 0.0 {
                check(i, j, out);
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
        let w = 1.0 - far_weight(raw, pair_cut(cuts, i, j));
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
        // The star's pairs are wholly the Kepler drift: no far part at all.
        assert_eq!(far_weight(1e30, STAR_CUT), 0.0);
        // Every other pair takes the larger magnitude.
        let cuts = [STAR_CUT, -DUST_CUT, 0.4, 0.001, -DUST_CUT];
        assert_eq!(pair_cut(&cuts, 0, 1), STAR_CUT);
        assert_eq!(pair_cut(&cuts, 2, 0), STAR_CUT);
        assert_eq!(pair_cut(&cuts, 1, 2), 0.4);
        assert_eq!(pair_cut(&cuts, 2, 3), 0.4);
        assert_eq!(pair_cut(&cuts, 1, 3), DUST_CUT);
        assert_eq!(pair_cut(&cuts, 1, 4), DUST_CUT);
    }
    #[test]
    fn a_dust_swarm_lists_only_close_dust_pairs() {
        let mut w = crate::World::new(crate::Config {
            mission: None,
            ..crate::Config::default()
        })
        .unwrap();
        w.apply(crate::Command::SeedSwarm {
            count: 600,
            disorder: 0.3,
        })
        .unwrap();
        let b = &w.bodies;
        let col = |f: fn(&Body) -> f64| b.iter().map(f).collect::<Vec<f64>>();
        let (x, y, m) = (col(|p| p.pos.x), col(|p| p.pos.y), col(|p| p.mass));
        let (vx, vy) = (col(|p| p.vel.x), col(|p| p.vel.y));
        let mut cuts = Vec::new();
        cutoffs(&x, &y, &m, &mut cuts);
        assert!(cuts[1..].iter().all(|&c| c == -DUST_CUT));
        let mut pairs = Vec::new();
        near_pairs(&x, &y, &vx, &vy, &cuts, &mut pairs);
        // Brute force: exactly the dust pairs within the cutoff plus margin.
        let mut expected = Vec::new();
        for i in 1..b.len() {
            for j in i + 1..b.len() {
                let limit = DUST_CUT + 2.0 * DT * b[i].vel.minus(b[j].vel).norm();
                let d = b[j].pos.minus(b[i].pos);
                if d.x.abs() <= limit && d.y.abs() <= limit && d.norm2() <= limit * limit {
                    expected.push((i as u32, j as u32));
                }
            }
        }
        assert_eq!(pairs, expected);
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
        // Brute force: every pair inside its cutoff + closing margin is listed,
        // and the star's pairs never are.
        assert!(near.pairs.iter().all(|&(i, _)| i != 0));
        for i in 1..b.len() {
            for j in i + 1..b.len() {
                let cut = pair_cut(&near.cuts, i, j);
                let limit = cut + 2.0 * DT * b[i].vel.minus(b[j].vel).norm();
                let listed = near.pairs.contains(&(i as u32, j as u32));
                if cut > 0.0 && b[i].pos.minus(b[j].pos).norm() <= limit {
                    assert!(listed, "{i} {j}");
                }
            }
        }
        assert!(near.pairs.windows(2).all(|p| p[0] < p[1]), "sorted, unique");
        assert!(near.members.contains(&(gi as u32)) && near.members.contains(&(mi as u32)));
        // Far weights plus near weights reproduce every body–body force; the
        // star's pairs are left to the Kepler drift.
        near.evaluate(&w.bodies, crate::SOFTENING.powi(2));
        let mut far = vec![V2::default(); b.len()];
        let x: Vec<f64> = b.iter().map(|p| p.pos.x).collect();
        let y: Vec<f64> = b.iter().map(|p| p.pos.y).collect();
        let m: Vec<f64> = b.iter().map(|p| p.mass).collect();
        crate::gravity::direct_cut(&x, &y, &m, &near.cuts, crate::SOFTENING.powi(2), &mut far);
        let mut full = vec![V2::default(); b.len()];
        let mut planets = m.clone();
        planets[0] = 0.0;
        crate::gravity::direct(&x, &y, &planets, crate::SOFTENING.powi(2), &mut full);
        for i in 1..b.len() {
            let sum = far[i].plus(near.accel[i]);
            let scale = full[i].norm().max(1e-30);
            assert!(sum.minus(full[i]).norm() <= 1e-12 * scale, "body {i}");
        }
    }
}
