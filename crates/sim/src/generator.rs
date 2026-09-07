use crate::{Command, Kind};
use serde::{Deserialize, Serialize};
use std::f64::consts::TAU;
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SystemStyle {
    Swarm,
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
pub(crate) fn calm_commands(seed: u32, count: u32, chaos: f64) -> Result<Vec<Command>, String> {
    if !(4..=32).contains(&count) || !chaos.is_finite() || !(0.0..=1.0).contains(&chaos) {
        return Err("Choose 4–32 bodies and disorder from 0 to 100%".into());
    }
    let mut rng = Rng(seed);
    let mut commands = vec![];

    for i in 0..count {
        let giant = i == count - 1;
        let kind = if giant {
            Kind::Giant
        } else if rng.next() > 0.7 {
            Kind::Ice
        } else {
            Kind::Rocky
        };
        let radius = 0.4 * libm::pow(13.0, i as f64 / (count - 1) as f64);
        let mass = if giant {
            100.0 + rng.next() * 600.0
        } else {
            0.2 + rng.next() * 1.0
        };
        let speed = 1.0 + (rng.next() - 0.5) * chaos * 0.015;
        commands.push(Command::LaunchMass {
            kind,
            mass,
            radius,
            angle: rng.next() * TAU,
            speed,
        });
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
