//! Bounded sampled flyby observations. This recorder never changes dynamics.
use crate::World;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Encounter {
    pub bodies: [u32; 2],
    pub start_tick: u64,
    pub minimum_tick: u64,
    pub end_tick: u64,
    pub distance: f64,
    /// [osculating semi-major axis (zero if unbound), eccentricity], per body.
    pub before: [[f64; 2]; 2],
    pub after: [[f64; 2]; 2],
    contacts: u64,
}
impl Encounter {
    pub(crate) fn valid(&self) -> bool {
        self.start_tick <= self.minimum_tick
            && self.minimum_tick <= self.end_tick
            && self.end_tick <= crate::MAX_TICKS
            && self.distance.is_finite()
            && self.distance > 0.
            && self
                .before
                .iter()
                .chain(&self.after)
                .flatten()
                .all(|x| x.is_finite())
    }
}
impl World {
    pub(crate) fn observe_encounters(&mut self) {
        let contacts = u64::from(self.collisions)
            + u64::from(self.grazes)
            + u64::from(self.disruptions)
            + u64::from(self.absorbed);
        let bodies: Vec<_> = self
            .bodies
            .iter()
            .filter(|b| self.history.priority_ids.contains(&b.id))
            .collect();
        let mut active = std::mem::take(&mut self.history.approaching);
        for (i, a) in bodies.iter().enumerate() {
            for b in bodies.iter().skip(i + 1) {
                // Persistent bound satellites are measured by moon histories instead.
                if a.parent == Some(b.id) || b.parent == Some(a.id) {
                    continue;
                }
                let ids = [a.id.min(b.id), a.id.max(b.id)];
                let tracked = active.iter().position(|e| e.bodies == ids);
                let distance2 = a.pos.minus(b.pos).norm2();
                // The observation range never exceeds 0.5 AU. Reject distant
                // pairs before expensive orbital elements and cube roots.
                if tracked.is_none() && distance2 > 0.25 {
                    continue;
                }
                let distance = distance2.sqrt();
                let radius = (a.pos.minus(self.bodies[0].pos).norm()
                    + b.pos.minus(self.bodies[0].pos).norm())
                    / 2.;
                let range =
                    (3. * radius * libm::cbrt((a.mass + b.mass) / (3. * self.bodies[0].mass)))
                        .clamp(0.002, 0.5);
                if tracked.is_none() && distance >= range {
                    continue;
                }
                let reading = |body: &crate::Body| {
                    let o = self.orbit(body);
                    [
                        if o.bound {
                            (o.apoapsis + o.periapsis) / 2.
                        } else {
                            0.
                        },
                        o.eccentricity,
                    ]
                };
                let readings = if a.id < b.id {
                    [reading(a), reading(b)]
                } else {
                    [reading(b), reading(a)]
                };
                if let Some(index) = tracked {
                    let e = &mut active[index];
                    e.end_tick = self.tick;
                    e.after = readings;
                    if distance < e.distance {
                        e.distance = distance;
                        e.minimum_tick = self.tick;
                    }
                    if e.contacts != contacts || distance > range || distance > 1.25 * e.distance {
                        let e = active.remove(index);
                        if e.contacts == contacts
                            && e.minimum_tick > e.start_tick
                            && e.minimum_tick < self.tick
                        {
                            if self.history.encounters.len() == 64 {
                                self.history.encounters.remove(0);
                            }
                            self.history.encounters.push(e);
                        }
                    }
                } else if distance < range
                    && distance > a.radius + b.radius
                    && active.len() < 64
                    && a.pos.minus(b.pos).x * a.vel.minus(b.vel).x
                        + a.pos.minus(b.pos).y * a.vel.minus(b.vel).y
                        < 0.
                {
                    active.push(Encounter {
                        bodies: ids,
                        start_tick: self.tick,
                        minimum_tick: self.tick,
                        end_tick: self.tick,
                        distance,
                        before: readings,
                        after: readings,
                        contacts,
                    });
                }
            }
        }
        active.retain(|e| e.end_tick == self.tick && e.contacts == contacts);
        self.history.approaching = active;
    }
}

#[cfg(test)]
mod tests {
    use crate::{Command, Config, Kind, World, V2};
    #[test]
    fn recorder_keeps_a_sampled_minimum_and_excludes_contact_intervals() {
        let mut w = World::new(Config {
            mission: None,
            ..Default::default()
        })
        .unwrap();
        for angle in [0., 1.] {
            w.apply(Command::Launch {
                kind: Kind::Rocky,
                radius: 1.,
                angle,
                speed: 1.,
            })
            .unwrap();
        }
        for contact in [false, true] {
            w.history.approaching.clear();
            w.history.encounters.clear();
            for (tick, distance) in [(8, 0.025), (16, 0.012), (24, 0.024)] {
                w.tick = tick;
                w.bodies[1].pos = V2::new(1., 0.);
                w.bodies[2].pos = V2::new(1. + distance, 0.);
                w.bodies[1].vel = V2::new(0.1, 6.);
                w.bodies[2].vel = V2::new(-0.1, 6.);
                if contact && tick == 24 {
                    w.grazes += 1;
                }
                w.observe_encounters();
            }
            assert_eq!(w.history.encounters.len(), usize::from(!contact));
            if !contact {
                let e = &w.history.encounters[0];
                assert_eq!(e.minimum_tick, 16);
                assert_eq!(e.bodies, [1, 2]);
                assert!(e.valid());
            }
        }
    }
}
