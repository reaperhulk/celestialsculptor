use crate::{Replay, World};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Scenario {
    pub name: String,
    pub replay: Replay,
    pub completed: bool,
}
pub fn campaign() -> Vec<Scenario> {
    serde_json::from_str(include_str!("../../../scenarios/campaign.json"))
        .expect("valid checked-in scenarios")
}
impl Scenario {
    pub fn run(&self) -> Result<World, String> {
        let world = World::from_replay(self.replay.clone())?;
        if world.completed != self.completed {
            return Err(format!(
                "{}: expected completed={}, got {}",
                self.name, self.completed, world.completed
            ));
        }
        if !world.energy().is_finite()
            || world
                .bodies
                .iter()
                .any(|b| !b.pos.norm2().is_finite() || !b.vel.norm2().is_finite())
        {
            return Err(format!("{}: non-finite state", self.name));
        }
        Ok(world)
    }
}
