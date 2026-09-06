use crate::{Command, Kind};
use serde::{Deserialize, Serialize};
use std::f64::consts::{PI, TAU};
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SystemStyle {
    Calm,
    Nursery,
    Chaos,
    Moons,
    Resonance,
}
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
) -> Result<Vec<Command>, String> {
    if !(4..=32).contains(&count) || !chaos.is_finite() || !(0.0..=1.0).contains(&chaos) {
        return Err("Choose 4–32 bodies and disorder from 0 to 100%".into());
    }
    let mut rng = Rng(seed);
    let mut commands = vec![];
    match style {
        SystemStyle::Nursery => commands.push(Command::SeedDisk {
            radius: 1.05 + rng.next() * 0.4,
            spread: 0.05 + chaos * 0.3,
            disorder: 0.04 + chaos * 0.4,
            count,
        }),
        SystemStyle::Resonance => {
            commands.push(Command::LaunchMass {
                kind: Kind::Giant,
                mass: 318.0,
                radius: 1.0,
                angle: PI,
                speed: 0.95_f64.sqrt(),
            });
            commands.push(Command::LaunchMass {
                kind: Kind::Giant,
                mass: 318.0,
                radius: 1.7,
                angle: PI / 2.0,
                speed: 1.0,
            });
            commands.push(Command::Migration {
                id: 2,
                timescale: 500.0,
            });
        }
        SystemStyle::Moons => {
            commands.push(Command::LaunchMass {
                kind: Kind::Giant,
                mass: 318.0,
                radius: 3.0,
                angle: rng.next() * TAU,
                speed: 1.0,
            });
            for i in 0..(count - 1).min(8) {
                let f = i as f64 / (count - 2).min(7) as f64;
                commands.push(Command::LaunchMoon {
                    parent: 1,
                    kind: Kind::Rocky,
                    mass: 0.003 + rng.next() * 0.006,
                    distance: 0.024 * libm::pow(3.2, f),
                    angle: rng.next() * TAU,
                    speed: if i == 0 && chaos > 0.5 { -1.0 } else { 1.0 },
                });
            }
        }
        SystemStyle::Calm | SystemStyle::Chaos => {
            let chaotic = style == SystemStyle::Chaos;
            for i in 0..count {
                let giant = if chaotic { i % 6 == 0 } else { i == count - 1 };
                let kind = if giant {
                    Kind::Giant
                } else if rng.next() > 0.7 {
                    Kind::Ice
                } else {
                    Kind::Rocky
                };
                let radius = if chaotic {
                    0.9 + rng.next() * 3.5
                } else {
                    0.4 * libm::pow(13.0, i as f64 / (count - 1) as f64)
                };
                let mass = if giant {
                    100.0 + rng.next() * 600.0
                } else {
                    0.2 + rng.next() * if chaotic { 7.8 } else { 1.0 }
                };
                let speed = if chaotic {
                    (0.7 + rng.next() * 0.65) * if rng.next() < chaos * 0.2 { -1.0 } else { 1.0 }
                } else {
                    1.0 + (rng.next() - 0.5) * chaos * 0.015
                };
                commands.push(Command::LaunchMass {
                    kind,
                    mass,
                    radius,
                    angle: rng.next() * TAU,
                    speed,
                });
            }
        }
    }
    let worlds = commands
        .iter()
        .filter(|c| matches!(c, Command::LaunchMass { .. } | Command::LaunchMoon { .. }))
        .count();
    for id in 1..=worlds as u32 {
        commands.push(Command::Spin {
            id,
            rate: (0.3 + rng.next()) * if rng.next() < 0.25 { -1.0 } else { 1.0 },
        });
    }
    Ok(commands)
}
