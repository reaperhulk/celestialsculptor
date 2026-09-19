//! Bounded incremental reconstruction; live system age is independent of body count.
use crate::{checkpoint, RecordedCommand, Replay, SimError, World, MAX_TICKS, SAVE_VERSION};

pub struct Reconstruction {
    world: World,
    commands: Vec<RecordedCommand>,
    next: usize,
    end: u64,
}

impl Reconstruction {
    pub fn from_checkpoint(replay: Replay, checkpoint: &str) -> Result<Self, SimError> {
        let world = World::from_checkpoint(checkpoint, &replay)?;
        let mut result = Self::new(replay)?;
        result.next = world.commands.len();
        result.world = world;
        Ok(result)
    }

    pub fn new(replay: Replay) -> Result<Self, SimError> {
        if replay.version != SAVE_VERSION
            || !checkpoint::ACCEPTED_PHYSICS.contains(&replay.physics.as_str())
            || replay.end_tick > MAX_TICKS
            || replay.commands.len() > 2048
        {
            return Err(SimError::Unsupported(
                "Unsupported or oversized experiment".into(),
            ));
        }
        let mut previous = 0;
        for action in &replay.commands {
            if action.tick < previous || action.tick > replay.end_tick {
                return Err(SimError::Unsupported(
                    "Commands must be ordered inside the experiment".into(),
                ));
            }
            previous = action.tick;
        }
        Ok(Self {
            world: World::new(replay.config)?,
            commands: replay.commands,
            next: 0,
            end: replay.end_tick,
        })
    }

    pub fn tick(&self) -> u64 {
        self.world.tick
    }

    pub fn advance(&mut self, ticks: u32) -> Result<bool, SimError> {
        let target = (self.world.tick + u64::from(ticks)).min(self.end);
        while let Some(action) = self.commands.get(self.next).filter(|a| a.tick <= target) {
            self.world.advance((action.tick - self.world.tick) as u32);
            self.world.apply(action.command.clone())?;
            self.next += 1;
        }
        self.world.advance((target - self.world.tick) as u32);
        Ok(self.world.tick == self.end && self.next == self.commands.len())
    }

    pub fn finish(self) -> Result<World, SimError> {
        if self.world.tick != self.end || self.next != self.commands.len() {
            return Err(SimError::Sequence(
                "Experiment reconstruction is not complete".into(),
            ));
        }
        Ok(self.world)
    }
}

impl World {
    pub fn replay(&self) -> Replay {
        Replay {
            version: SAVE_VERSION,
            physics: checkpoint::physics_id(),
            config: self.config.clone(),
            commands: self.commands.clone(),
            end_tick: self.tick,
        }
    }
    pub fn rewind(&mut self) -> Result<(), SimError> {
        let mut replay = self.replay();
        replay.commands.retain(|action| action.tick == 0);
        replay.end_tick = 0;
        *self = Self::from_replay(replay)?;
        Ok(())
    }
    pub fn undo(&mut self) -> Result<(), SimError> {
        let mut replay = self.replay();
        replay
            .commands
            .pop()
            .ok_or(SimError::Sequence("No sculpting actions to undo".into()))?;
        *self = Self::from_replay(replay)?;
        Ok(())
    }
    pub fn from_replay(replay: Replay) -> Result<Self, SimError> {
        let mut reconstruction = Reconstruction::new(replay)?;
        while !reconstruction.advance(512)? {}
        reconstruction.finish()
    }
}
