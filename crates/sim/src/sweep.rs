use crate::{generator::SystemStyle, Command, Config, World};
use serde_json::{json, Value};
pub fn run() -> Result<Value, String> {
    let mut cases = vec![];
    for style in [
        SystemStyle::Calm,
        SystemStyle::Nursery,
        SystemStyle::Chaos,
        SystemStyle::Moons,
    ] {
        for seed in 1..=8 {
            let mut world = World::new(Config {
                seed,
                mission: None,
                star_mass: 1.0,
            })?;
            world.apply(Command::Generate {
                style,
                count: 12,
                chaos: 0.6,
            })?;
            world.advance(512 * 24);
            if !world.energy().is_finite()
                || world
                    .bodies
                    .iter()
                    .any(|b| !b.pos.norm2().is_finite() || !b.vel.norm2().is_finite())
            {
                return Err(format!("Non-finite sweep outcome at seed {seed}"));
            }
            let status = world.status();
            cases.push(json!({"style":style,"seed":seed,"bodies":world.bodies.len(),"calm":status.calm,"formed":status.formed,"moons":status.moons,"collisions":world.collisions,"ejections":world.ejections,"replay":world.replay()}));
        }
    }
    Ok(json!({"years":24,"cases":cases}))
}
