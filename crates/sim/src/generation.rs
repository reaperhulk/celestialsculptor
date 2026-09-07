//! Versioned generator command: older Generate replays keep their old conditions.
use crate::{generator::SystemStyle, Command, Kind};
use std::f64::consts::{PI, TAU};
struct Rng(u32);
impl Rng {
    fn next(&mut self) -> f64 {
        let mut x = self.0.max(1);
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x as f64 / u32::MAX as f64
    }
}
pub fn commands(
    seed: u32,
    style: SystemStyle,
    count: u32,
    chaos: f64,
    star_mass: f64,
) -> Result<Vec<Command>, String> {
    if !(4..=if style == SystemStyle::Swarm {
        8191
    } else {
        32
    })
        .contains(&count)
        || !chaos.is_finite()
        || !(0.0..=1.0).contains(&chaos)
        || !star_mass.is_finite()
        || !(0.6..=1.5).contains(&star_mass)
    {
        return Err("Choose 4–32 bodies and disorder from 0 to 100%".into());
    }
    let mut rng = Rng(seed.wrapping_add(0x9e3779b9));
    let phase = rng.next() * TAU;
    let mut out = vec![];
    match style {
        SystemStyle::Swarm => out.push(Command::SeedSwarm {
            count,
            disorder: chaos,
        }),
        SystemStyle::Nursery => out.push(Command::SeedDisk {
            radius: 0.62 + rng.next() * 0.22,
            spread: 0.05 + chaos * 0.035,
            disorder: 0.02 + chaos * 0.04,
            count,
        }),
        SystemStyle::Resonance => {
            let radius = 0.7 + rng.next() * 0.6;
            let mass = 318. * star_mass * (0.85 + rng.next() * 0.3);
            let scale = (radius * radius * radius / star_mass).sqrt();
            out.push(Command::LaunchMass {
                kind: Kind::Giant,
                mass,
                radius,
                angle: phase + PI,
                speed: 0.95_f64.sqrt(),
            });
            out.push(Command::LaunchMass {
                kind: Kind::Giant,
                mass,
                radius: radius * (1.66 + chaos * 0.08 + rng.next() * 0.015),
                angle: phase + PI / 2.,
                speed: 1.,
            });
            out.push(Command::Migration {
                id: 2,
                timescale: (400. + rng.next() * 160.) * scale,
            });
        }
        SystemStyle::Moons => {
            let radius = 2.6 + rng.next() * 1.2;
            let mass = 250. + rng.next() * 140.;
            out.push(Command::LaunchMass {
                kind: Kind::Giant,
                mass,
                radius,
                angle: phase,
                speed: 1.,
            });
            let satellites = (count - 1).min(8);
            let outer =
                (radius * libm::cbrt(mass * crate::EARTH / (3. * star_mass)) * 0.38).min(0.078);
            for i in 0..satellites {
                let distance = 0.024 * libm::pow(outer / 0.024, i as f64 / (satellites - 1) as f64);
                out.push(Command::LaunchMoon {
                    parent: 1,
                    kind: if rng.next() < 0.3 {
                        Kind::Ice
                    } else {
                        Kind::Rocky
                    },
                    mass: 0.003 + rng.next() * 0.009,
                    distance,
                    angle: rng.next() * TAU,
                    speed: if rng.next() < chaos * 0.35 { -1. } else { 1. },
                });
            }
        }
        SystemStyle::Calm => return crate::generator::commands(seed, style, count, chaos),
        SystemStyle::Chaos => {
            out.push(Command::LaunchMass {
                kind: Kind::Giant,
                mass: 1000.,
                radius: 2.,
                angle: phase,
                speed: 1.,
            });
            let arrival = rng.next();
            out.push(Command::LaunchMass {
                kind: Kind::Rocky,
                mass: 0.2 + rng.next(),
                radius: 1.6 + arrival * 0.2,
                angle: phase - PI / 8. + arrival * PI / 32. + (rng.next() - 0.5) * chaos * 0.006,
                speed: 1.35,
            });
            for i in 2..count {
                let giant = i % 7 == 0;
                out.push(Command::LaunchMass {
                    kind: if giant {
                        Kind::Giant
                    } else if rng.next() < 0.4 {
                        Kind::Ice
                    } else {
                        Kind::Rocky
                    },
                    mass: if giant {
                        100. + rng.next() * 400.
                    } else {
                        0.2 + rng.next() * 5.
                    },
                    radius: 0.7 + rng.next() * 3.3,
                    angle: rng.next() * TAU,
                    speed: (0.85 + rng.next() * 0.4)
                        * if rng.next() < chaos * 0.15 { -1. } else { 1. },
                });
            }
        }
    }
    let bodies = out
        .iter()
        .filter(|c| matches!(c, Command::LaunchMass { .. } | Command::LaunchMoon { .. }))
        .count();
    for id in 1..=bodies as u32 {
        out.push(Command::Spin {
            id,
            rate: (0.3 + rng.next()) * if rng.next() < 0.25 { -1. } else { 1. },
        });
    }
    Ok(out)
}
