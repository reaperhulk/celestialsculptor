//! Bounded gameplay impact regimes; see docs/COLLISIONS.md for scientific limits.
use crate::{Body, Impact, Kind, Material, World, G, V2};
use serde::{Deserialize, Serialize};
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Merge,
    Graze,
    Disruption,
}
struct Geometry {
    normal: V2,
    remaining: f64,
    parameter: f64,
}
fn geometry(a: &Body, b: &Body, sweep: f64) -> Option<Geometry> {
    let velocity = a.vel.minus(b.vel);
    let radius = a.radius + b.radius;
    let start = a.pos.minus(b.pos).minus(velocity.scale(sweep));
    if start.norm2() < 1e-24 || velocity.norm2() < 1e-24 {
        return None;
    }
    let drift = velocity.scale(sweep);
    let aa = drift.norm2();
    let bb = 2. * (start.x * drift.x + start.y * drift.y);
    let cc = start.norm2() - radius * radius;
    let fraction = if aa > 0. && cc > 0. {
        let discriminant = bb * bb - 4. * aa * cc;
        if discriminant < 0. {
            return None;
        }
        ((-bb - discriminant.sqrt()) / (2. * aa)).clamp(0., 1.)
    } else {
        0.
    };
    let contact = start.plus(drift.scale(fraction));
    let normal = contact.scale(1. / contact.norm().max(1e-12));
    Some(Geometry {
        normal,
        remaining: sweep * (1. - fraction),
        parameter: (start.cross(velocity).abs() / (radius * velocity.norm())).min(1.),
    })
}
impl World {
    pub(crate) fn resolve_solid_contact(&mut self, i: usize, j: usize, sweep: f64) -> bool {
        let a = self.bodies[i].clone();
        let b = self.bodies[j].clone();
        if matches!(a.kind, Kind::Star | Kind::Giant) || matches!(b.kind, Kind::Star | Kind::Giant)
        {
            return false;
        }
        let Some(hit) = geometry(&a, &b, sweep) else {
            return false;
        };
        let velocity = a.vel.minus(b.vel);
        let mass = a.mass + b.mass;
        let reduced = a.mass * b.mass / mass;
        // Contact radii are exaggerated. Internal binding uses a smaller reference
        // radius; these calibrated thresholds do not model a planet's interior.
        let binding_speed2 = 2. * G * mass / ((a.radius + b.radius) * 0.025);
        let incoming = 0.5 * reduced * velocity.norm2();
        let outcome = if hit.parameter > 0.65 && velocity.norm2() > binding_speed2 {
            Outcome::Graze
        } else if incoming / mass > binding_speed2 * 0.5 {
            Outcome::Disruption
        } else {
            return false;
        };
        let before_energy = self.affected_energy(&[a.id, b.id]);
        let before = self.moon_orbit(&a).unwrap_or_else(|| self.orbit(&a));
        let anchor = a
            .parent
            .and_then(|id| self.bodies.iter().find(|body| body.id == id))
            .unwrap_or(&self.bodies[0])
            .pos;
        let center = a.pos.scale(a.mass / mass).plus(b.pos.scale(b.mass / mass));
        let center_velocity = a.vel.scale(a.mass / mass).plus(b.vel.scale(b.mass / mass));
        let angular = a.mass * a.pos.cross(a.vel) + b.mass * b.pos.cross(b.vel) + a.spin + b.spin;
        let normal_speed = velocity.x * hit.normal.x + velocity.y * hit.normal.y;
        let mut heat = incoming;
        let mut remnants = vec![a.id, b.id];
        if outcome == Outcome::Graze {
            let impulse = hit
                .normal
                .scale(-(1. + 0.45) * normal_speed.min(0.) * reduced);
            self.bodies[i].vel = a.vel.plus(impulse.scale(1. / a.mass));
            self.bodies[j].vel = b.vel.minus(impulse.scale(1. / b.mass));
            let relative = self.bodies[i].vel.minus(self.bodies[j].vel);
            let separation = hit
                .normal
                .scale((a.radius + b.radius) * 1.00001)
                .plus(relative.scale(hit.remaining));
            self.bodies[i].pos = center.plus(separation.scale(b.mass / mass));
            self.bodies[j].pos = center.minus(separation.scale(a.mass / mass));
            heat = (incoming - 0.5 * reduced * relative.norm2()).max(0.);
            self.grazes += 1;
        } else {
            let count = if self.bodies.len() < self.max_bodies() {
                3
            } else {
                2
            };
            let fractions: &[f64] = if count == 3 {
                &[0.65, 0.25, 0.1]
            } else {
                &[0.8, 0.2]
            };
            let material = a.material.plus(b.material);
            let mean = fractions
                .iter()
                .enumerate()
                .map(|(k, f)| k as f64 * f)
                .sum::<f64>();
            let variance = fractions
                .iter()
                .enumerate()
                .map(|(k, f)| f * (k as f64 - mean).powi(2))
                .sum::<f64>();
            let speed = (2. * incoming * 0.15 / (mass * variance)).sqrt();
            let spacing = (a.radius + b.radius) * 2.5;
            let mut parts = vec![];
            for (k, &fraction) in fractions.iter().enumerate() {
                let mut part = a.clone();
                part.id = if k == 0 {
                    a.id
                } else if k == 1 {
                    b.id
                } else {
                    let id = self.next_id;
                    self.next_id += 1;
                    id
                };
                part.mass = mass * fraction;
                part.material = Material {
                    rock: material.rock * fraction,
                    ice: material.ice * fraction,
                    gas: material.gas * fraction,
                };
                part.kind = part.material.kind(part.mass);
                part.radius = part.kind.radius_for(part.mass, self.rules_version);
                part.birth_mass = part.mass;
                part.debris_origin = a.debris_origin && b.debris_origin;
                part.mergers = a.mergers + b.mergers + 1;
                part.initially_bound = a.initially_bound && b.initially_bound;
                part.parent = if a.parent == b.parent { a.parent } else { None };
                part.origin_parent = if a.origin_parent == b.origin_parent {
                    a.origin_parent
                } else {
                    None
                };
                part.migration_rate = 0.;
                let offset = k as f64 - mean;
                part.vel = center_velocity.plus(hit.normal.scale(offset * speed));
                part.pos =
                    center.plus(hit.normal.scale(offset * (spacing + speed * hit.remaining)));
                part.spin = (a.spin + b.spin) * fraction;
                parts.push(part);
            }
            self.bodies[i] = parts[0].clone();
            self.bodies[j] = parts[1].clone();
            if count == 3 {
                remnants.push(parts[2].id);
                self.bodies.push(parts.remove(2));
            }
            self.disruptions += 1;
            heat *= 0.85;
        }
        // The unresolved spin receives angular momentum that is no longer in
        // the resolved remnant trajectories, including contact-position changes.
        let after_angular = self
            .bodies
            .iter()
            .filter(|body| remnants.contains(&body.id))
            .map(|body| body.mass * body.pos.cross(body.vel) + body.spin)
            .sum::<f64>();
        self.bodies[i].spin += angular - after_angular;
        self.collision_energy += before_energy - self.affected_energy(&remnants);
        let after = self
            .moon_orbit(&self.bodies[i])
            .unwrap_or_else(|| self.orbit(&self.bodies[i]));
        self.emit(
            if outcome == Outcome::Graze {
                "graze"
            } else {
                "disruption"
            },
            a.id,
            if outcome == Outcome::Graze {
                format!(
                    "Worlds {} & {} grazed and survived; both orbits changed",
                    a.id, b.id
                )
            } else {
                format!(
                    "Worlds {} & {} broke into {} remnants; all material retained",
                    a.id,
                    b.id,
                    remnants.len()
                )
            },
        );
        self.events.last_mut().unwrap().impact = Some(Impact {
            position: center,
            consumed: None,
            masses: [a.mass, b.mass],
            mass,
            radius_before: a.radius,
            radius_after: self.bodies[i].radius,
            relative_speed: velocity.norm(),
            dissipated_energy: heat,
            eccentricity_before: before.eccentricity,
            eccentricity_after: after.eccentricity,
            orbit_before: Some(before),
            orbit_after: Some(after),
            anchor: Some(anchor),
            outcome: Some(outcome),
            remnants,
        });
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Command, Config, EARTH};
    fn impact(speed: f64, parameter: f64, ratio: f64, capacity: bool) -> World {
        let mut w = World::new(Config {
            mission: None,
            ..Config::default()
        })
        .unwrap();
        for (angle, mass) in [(0., 1.), (1., ratio)] {
            w.apply(Command::LaunchMass {
                kind: Kind::Rocky,
                mass,
                radius: 2.,
                angle,
                speed: 1.,
            })
            .unwrap();
        }
        if capacity {
            w.rules_version = 5;
            while w.bodies.len() < crate::LEGACY_MAX_BODIES {
                let mut b = w.bodies[1].clone();
                b.id = w.next_id;
                w.next_id += 1;
                b.pos = V2::new(4., w.bodies.len() as f64);
                w.bodies.push(b);
            }
        }
        let r = w.bodies[1].radius + w.bodies[2].radius;
        w.bodies[1].pos = V2::new(2. - r * 0.4, r * parameter);
        w.bodies[2].pos = V2::new(2. + r * 0.4, 0.);
        w.bodies[1].vel = V2::new(speed, 1.);
        w.bodies[2].vel = V2::new(-speed, 1.);
        w
    }
    #[test]
    fn impact_regimes_preserve_mass_material_momentum_and_angular_momentum() {
        for ratio in [0.1, 1., 4.] {
            for capacity in [false, true] {
                for (speed, offset, outcome) in [
                    (0.01, 0., Outcome::Merge),
                    (20., 0.8, Outcome::Graze),
                    (20., 0., Outcome::Disruption),
                ] {
                    let mut w = impact(speed, offset, ratio, capacity);
                    let mass = w.bodies.iter().map(|b| b.mass).sum::<f64>();
                    let p = w.momentum();
                    let l = w.angular_momentum();
                    let energy = w.energy();
                    let handled = w.resolve_solid_contact(1, 2, 0.);
                    if outcome == Outcome::Merge {
                        assert!(!handled);
                        w.merge_contacts(0.);
                    } else {
                        assert!(handled);
                    }
                    assert!(w.bodies.len() <= w.max_bodies());
                    assert!((w.bodies.iter().map(|b| b.mass).sum::<f64>() - mass).abs() < 1e-14);
                    assert!(w.momentum().minus(p).norm() < 1e-13);
                    assert!((w.angular_momentum() - l).abs() < 1e-13);
                    assert!((energy - w.energy() - w.collision_energy).abs() < 1e-13);
                    assert!(w.bodies.iter().all(|b| (b.material.rock
                        + b.material.ice
                        + b.material.gas
                        - b.mass)
                        .abs()
                        < 1e-14));
                    assert_eq!(
                        w.events
                            .iter()
                            .rev()
                            .find_map(|e| e.impact.as_ref())
                            .unwrap()
                            .outcome,
                        Some(outcome)
                    );
                    if outcome == Outcome::Disruption {
                        assert_eq!(w.status().formed, 0);
                        assert!(w.bodies[1].mass > EARTH * 0.05);
                    }
                }
            }
        }
    }
    #[test]
    fn swept_fast_crossing_fragments_and_near_miss_does_not() {
        for offset in [0., 0.04] {
            let mut w = impact(40., 0., 1., false);
            w.bodies[1].pos = V2::new(2., -0.009);
            w.bodies[2].pos = V2::new(2. + offset, 0.009);
            w.bodies[1].vel = V2::new(0., 40.);
            w.bodies[2].vel = V2::new(0., -40.);
            w.step();
            assert_eq!(w.disruptions, if offset == 0. { 1 } else { 0 });
            assert_eq!(w.collisions, 0);
        }
    }
}

#[cfg(test)]
mod convergence {
    use crate::*;
    #[test]
    fn glancing_outcomes_agree_under_timestep_refinement() {
        for substeps in [4, 8, 16] {
            let mut w = World::new(Config {
                mission: None,
                ..Config::default()
            })
            .unwrap();
            for (radius, angle, speed) in [(1., 0., 1.), (1.0032, std::f64::consts::PI, -1.)] {
                w.apply(Command::LaunchMass {
                    kind: Kind::Rocky,
                    mass: 1.,
                    radius,
                    angle,
                    speed,
                })
                .unwrap();
            }
            for _ in 0..256 {
                w.integrate_tick(substeps);
            }
            assert_eq!(w.grazes, 1);
            assert_eq!(w.disruptions, 0);
            assert_eq!(w.bodies.len(), 3);
        }
    }
    #[test]
    fn tighter_steps_converge_on_a_close_moon_orbit() {
        let mut initial = World::new(Config {
            mission: None,
            ..Config::default()
        })
        .unwrap();
        initial
            .apply(Command::Launch {
                kind: Kind::Giant,
                radius: 3.,
                angle: 0.,
                speed: 1.,
            })
            .unwrap();
        initial
            .apply(Command::LaunchMoon {
                parent: 1,
                kind: Kind::Rocky,
                mass: 0.01,
                distance: 0.025,
                angle: 0.,
                speed: 1.,
            })
            .unwrap();
        let run = |substeps| {
            let mut w = initial.clone();
            for _ in 0..512 {
                w.integrate_tick(substeps);
            }
            w
        };
        let coarse = run(4);
        let medium = run(8);
        let fine = run(16);
        assert_eq!(fine.bodies.len(), 3);
        let error = |w: &World| {
            w.bodies[2]
                .pos
                .minus(w.bodies[1].pos)
                .minus(fine.bodies[2].pos.minus(fine.bodies[1].pos))
                .norm()
        };
        assert!(
            error(&medium) < error(&coarse) * 0.4,
            "{} {}",
            error(&coarse),
            error(&medium)
        );
        assert!(error(&coarse) < 0.0001);
    }
}

#[cfg(test)]
mod flyby_refinement {
    use crate::*;
    #[test]
    fn gravitational_assist_outcome_survives_timestep_refinement() {
        let example = scenarios::campaign()
            .into_iter()
            .find(|s| s.name == "v5-6-trailing-flyby")
            .unwrap();
        let mut replay = example.replay;
        replay.end_tick = 0;
        let initial = World::from_replay(replay).unwrap();
        let baseline = initial.balances();
        let mut errors = vec![];
        for substeps in [4, 8, 16] {
            let mut w = initial.clone();
            for _ in 0..2048 {
                w.integrate_tick(substeps);
            }
            let balance = w.balances();
            assert_eq!(w.assisted_ejections, 1, "substeps {substeps}");
            assert!(balance.momentum.minus(baseline.momentum).norm() < 1e-12);
            assert!((balance.angular_momentum - baseline.angular_momentum).abs() < 1e-12);
            let drift = ((balance.energy_balance - baseline.energy_balance)
                / baseline.energy_balance)
                .abs();
            errors.push(drift);
            assert!(
                drift < 0.001,
                "substeps {substeps}, relative energy drift {drift}"
            );
        }
        assert!(
            errors[2] < errors[0] * 0.4,
            "refinement energy errors: {errors:?}"
        );
    }
}

#[cfg(test)]
mod ledger_tests {
    use crate::{benchmark, Kind, Material, EARTH, V2};
    #[test]
    fn affected_energy_matches_full_energy_differences_after_changes_and_removal() {
        let mut w = benchmark::system(64);
        for i in 0..20 {
            let ids = [w.bodies[1].id, w.bodies[2].id];
            let before = w.energy();
            let local = w.affected_energy(&ids);
            w.bodies[1].pos = w.bodies[1].pos.plus(V2::new(0.01, 0.02));
            w.bodies[1].vel.x += 0.2;
            if i % 2 == 0 {
                w.bodies[1].mass += w.bodies[2].mass;
                w.bodies.remove(2);
            } else {
                let mut part = w.bodies[2].clone();
                part.id = 10000 + i;
                part.mass = 0.01 * EARTH;
                part.material = Material::new(Kind::Dust, part.mass);
                w.bodies[2].mass -= part.mass;
                w.bodies.push(part);
            }
            let after_ids = if i % 2 == 0 {
                vec![ids[0]]
            } else {
                vec![ids[0], ids[1], 10000 + i]
            };
            assert!(
                ((before - w.energy()) - (local - w.affected_energy(&after_ids))).abs() < 1e-16
            );
        }
    }
}
