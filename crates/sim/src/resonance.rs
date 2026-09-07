//! First-order, prograde mean-motion resonance observations. A near period ratio
//! alone is never labeled libration: the resonant angle must reverse and remain
//! bounded across at least eight outer revolutions.
use crate::{Body, Kind, Orbit, World, DT};
use serde::{Deserialize, Serialize};
use std::f64::consts::{PI, TAU};
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Resonance {
    pub inner: u32,
    pub outer: u32,
    pub p: u32,
    pub q: u32,
    pub ratio: f64,
    pub angle: f64,
    pub span: f64,
    pub observed_years: f64,
    pub librating: bool,
    start: u64,
    last: f64,
    unwrapped: f64,
    min: f64,
    max: f64,
    direction: f64,
    turns: u32,
}
fn wrap(angle: f64) -> f64 {
    (angle + PI).rem_euclid(TAU) - PI
}
fn longitude(body: &Body, parent: &Body, orbit: &Orbit) -> f64 {
    let r = body.pos.minus(parent.pos);
    let f = libm::atan2(r.y, r.x) - orbit.periapsis_angle;
    let e = orbit.eccentricity;
    let eccentric = libm::atan2((1.0 - e * e).sqrt() * libm::sin(f), e + libm::cos(f));
    eccentric - e * libm::sin(eccentric) + orbit.periapsis_angle
}
impl World {
    pub(crate) fn observe_resonances(&mut self) {
        if !self.tick.is_multiple_of(8) {
            return;
        }
        let mut bodies: Vec<_> = self
            .bodies
            .iter()
            .filter(|b| b.kind != Kind::Star && b.kind != Kind::Dust)
            .filter_map(|b| {
                let parent = self.bodies.iter().find(|p| p.id == b.parent.unwrap_or(0))?;
                let orbit = if b.parent.is_some() {
                    self.moon_orbit(b)?
                } else {
                    self.orbit(b)
                };
                let r = b.pos.minus(parent.pos);
                let v = b.vel.minus(parent.vel);
                (orbit.bound && r.cross(v) > 0.0 && orbit.eccentricity < 0.7)
                    .then_some((b, parent, orbit))
            })
            .collect();
        bodies.sort_by(|a, b| {
            a.1.id.cmp(&b.1.id).then(
                a.2.period_years
                    .unwrap()
                    .total_cmp(&b.2.period_years.unwrap()),
            )
        });
        let mut next = vec![];
        for pair in bodies.windows(2) {
            let (inner, parent, oi) = &pair[0];
            let (outer, other_parent, oo) = &pair[1];
            if parent.id != other_parent.id {
                continue;
            }
            let ratio = oo.period_years.unwrap() / oi.period_years.unwrap();
            let Some((p, q)) = [(2, 1), (3, 2), (4, 3)]
                .into_iter()
                .find(|(p, q)| (ratio / (*p as f64 / *q as f64) - 1.0).abs() < 0.06)
            else {
                continue;
            };
            let angle = wrap(
                p as f64 * longitude(outer, parent, oo)
                    - q as f64 * longitude(inner, parent, oi)
                    - (p - q) as f64 * oi.periapsis_angle,
            );
            let previous = self
                .resonances
                .iter()
                .find(|r| r.inner == inner.id && r.outer == outer.id && r.p == p && r.q == q);
            let mut track = previous.cloned().unwrap_or(Resonance {
                inner: inner.id,
                outer: outer.id,
                p,
                q,
                ratio,
                angle,
                span: 0.0,
                observed_years: 0.0,
                librating: false,
                start: self.tick,
                last: angle,
                unwrapped: angle,
                min: angle,
                max: angle,
                direction: 0.0,
                turns: 0,
            });
            let delta = wrap(angle - track.last);
            track.last = angle;
            track.unwrapped += delta;
            track.min = track.min.min(track.unwrapped);
            track.max = track.max.max(track.unwrapped);
            if delta.abs() > 0.001 {
                let direction = delta.signum();
                if track.direction != 0.0 && track.direction != direction {
                    track.turns += 1;
                }
                track.direction = direction;
            }
            track.angle = angle;
            track.ratio = ratio;
            track.span = track.max - track.min;
            track.observed_years = (self.tick - track.start) as f64 * DT;
            track.librating = track.observed_years >= 8.0 * oo.period_years.unwrap()
                && oi.eccentricity >= 0.01
                && track.turns >= 2
                && track.span > 0.1
                && track.span < PI * 1.7;
            if next.len() < 16 {
                next.push(track);
            }
        }
        self.resonances = next;
    }
}
