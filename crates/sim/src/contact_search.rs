//! Conservative swept AABBs; narrow-phase arithmetic and pair order stay unchanged.
use crate::Body;

#[derive(Clone, Copy, Debug, Default)]
struct Bounds {
    lo: [f64; 2],
    hi: [f64; 2],
}

/// Derived scratch memory is neither saved nor part of physical world equality.
#[derive(Clone, Debug, Default)]
pub(crate) struct ContactSearch {
    bounds: Vec<Bounds>,
    order: Vec<usize>,
    pairs: Vec<(usize, usize)>,
}
impl PartialEq for ContactSearch {
    fn eq(&self, _: &Self) -> bool {
        true
    }
}
impl ContactSearch {
    pub fn rebuild(&mut self, bodies: &[Body], sweep: f64) {
        self.bounds.clear();
        self.order.clear();
        self.pairs.clear();
        for (i, b) in bodies.iter().enumerate() {
            let end = [b.pos.x, b.pos.y];
            let drift = [b.vel.x * sweep, b.vel.y * sweep];
            let mut bounds = Bounds::default();
            for axis in 0..2 {
                let start = end[axis] - drift[axis];
                // Cover rounding in both the individual and relative drift formulas.
                let pad =
                    32. * f64::EPSILON * (end[axis].abs() + drift[axis].abs() + b.radius + 1.);
                bounds.lo[axis] = start.min(end[axis]) - b.radius - pad;
                bounds.hi[axis] = start.max(end[axis]) + b.radius + pad;
            }
            self.bounds.push(bounds);
            self.order.push(i);
        }
        self.order.sort_unstable_by(|&a, &b| {
            self.bounds[a].lo[0]
                .total_cmp(&self.bounds[b].lo[0])
                .then(a.cmp(&b))
        });
        for (at, &i) in self.order.iter().enumerate() {
            let a = self.bounds[i];
            for &j in &self.order[at + 1..] {
                let b = self.bounds[j];
                if b.lo[0] > a.hi[0] {
                    break;
                }
                if b.lo[1] <= a.hi[1] && a.lo[1] <= b.hi[1] {
                    self.pairs.push((i.min(j), i.max(j)));
                }
            }
        }
        self.pairs.sort_unstable();
    }
    pub fn next(&self, i: usize, j: usize) -> Option<usize> {
        let at = self.pairs.partition_point(|&pair| pair < (i, j));
        self.pairs
            .get(at)
            .filter(|&&(row, _)| row == i)
            .map(|&(_, col)| col)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{benchmark, V2};
    #[test]
    fn swept_candidates_never_omit_narrow_phase_contacts() {
        let mut world = benchmark::system(64);
        let mut search = ContactSearch::default();
        let mut state = 42_u64;
        let mut random = || {
            state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
            (state >> 11) as f64 / (1_u64 << 53) as f64
        };
        for round in 0..300 {
            let sweep = if round % 3 == 0 { 0. } else { random() };
            for b in &mut world.bodies {
                b.pos = V2::new(random() * 20. - 10., random() * 20. - 10.);
                b.vel = V2::new(random() * 100. - 50., random() * 100. - 50.);
                b.radius = random() * 0.3;
            }
            // Coincident bodies and exact tangent contacts alongside arbitrary sweeps.
            world.bodies[1].pos = world.bodies[0].pos;
            world.bodies[2].pos = world.bodies[0]
                .pos
                .plus(V2::new(world.bodies[0].radius + world.bodies[2].radius, 0.));
            search.rebuild(&world.bodies, sweep);
            for (i, a) in world.bodies.iter().enumerate() {
                for (j, b) in world.bodies.iter().enumerate().skip(i + 1) {
                    let sep = a.pos.minus(b.pos);
                    let drift = a.vel.minus(b.vel).scale(sweep);
                    let f = if drift.norm2() > 0. {
                        ((sep.x * drift.x + sep.y * drift.y) / drift.norm2()).clamp(0., 1.)
                    } else {
                        0.
                    };
                    if sep.minus(drift.scale(f)).norm2() <= (a.radius + b.radius).powi(2) {
                        assert_eq!(search.next(i, j), Some(j), "round {round}: {i}/{j}");
                    }
                }
            }
        }
    }
}
