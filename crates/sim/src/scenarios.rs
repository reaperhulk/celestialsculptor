use crate::{Replay, World};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Scenario {
    pub name: String,
    pub replay: Replay,
    pub completed: bool,
}
pub fn campaign() -> Vec<Scenario> {
    let mut cases: Vec<Scenario> =
        serde_json::from_str(include_str!("../../../scenarios/campaign.json"))
            .expect("valid legacy scenarios");
    cases.extend(
        serde_json::from_str::<Vec<Scenario>>(include_str!("../../../scenarios/campaign-v3.json"))
            .expect("valid formation scenarios"),
    );
    cases.extend(
        serde_json::from_str::<Vec<Scenario>>(include_str!("../../../scenarios/campaign-v4.json"))
            .expect("valid current scenarios"),
    );
    cases
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
