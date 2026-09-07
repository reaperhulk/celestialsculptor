//! Bounded incremental reconstruction; live system age is independent of body count.
use crate::{RecordedCommand, Replay, World, MAX_TICKS, SAVE_VERSION};

pub struct Reconstruction {
    world: World,
    commands: Vec<RecordedCommand>,
    next: usize,
    end: u64,
}

impl Reconstruction {
    pub fn new(replay: Replay) -> Result<Self, String> {
        if !(1..=SAVE_VERSION).contains(&replay.version)
            || replay.end_tick > MAX_TICKS
            || replay.commands.len() > 2048
        {
            return Err("Unsupported or oversized experiment".into());
        }
        let mut previous = 0;
        for action in &replay.commands {
            if action.tick < previous || action.tick > replay.end_tick {
                return Err("Commands must be ordered inside the experiment".into());
            }
            previous = action.tick;
        }
        Ok(Self {
            world: World::with_rules(replay.config, replay.version)?,
            commands: replay.commands,
            next: 0,
            end: replay.end_tick,
        })
    }

    pub fn tick(&self) -> u64 {
        self.world.tick
    }

    pub fn advance(&mut self, ticks: u32) -> Result<bool, String> {
        let target = (self.world.tick + u64::from(ticks)).min(self.end);
        while let Some(action) = self.commands.get(self.next).filter(|a| a.tick <= target) {
            self.world.advance((action.tick - self.world.tick) as u32);
            self.world.apply(action.command.clone())?;
            self.next += 1;
        }
        self.world.advance((target - self.world.tick) as u32);
        Ok(self.world.tick == self.end && self.next == self.commands.len())
    }

    pub fn finish(self) -> Result<World, String> {
        if self.world.tick != self.end || self.next != self.commands.len() {
            return Err("Experiment reconstruction is not complete".into());
        }
        Ok(self.world)
    }
}
