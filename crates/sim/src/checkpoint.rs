//! Validated sandbox restart state. Portable/campaign imports still use commands.
use crate::{Kind, Replay, SimError, World, MAX_BODIES, MAX_TICKS, SOFTENING, V2};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub const PHYSICS_ID: &str =
    "newton-soft1e-4-mutual035-dhwh2-near2hill32-dust2e-3-moon16-disk32-edge025-v5";
/// Replays recorded under these rules still reconstruct. Systems below the tree
/// threshold are bit-identical; large swarms replay under the current rules.
pub const ACCEPTED_PHYSICS: [&str; 5] = [
    PHYSICS_ID,
    "newton-soft1e-4-mutual035-kdk2-near2hill16-dust2e-3-moon16-disk32-edge025-v4",
    "newton-soft1e-4-mutual035-kdk4-near2hill8-moon16-disk32-edge025-v3",
    "newton-soft1e-4-mutual035-kdk4-moon16-disk32-edge025-v2",
    "newton-soft1e-4-mutual035-kdk4-moon16-disk32-edge025-v1",
];
pub const MAX_CHECKPOINT_BYTES: usize = 32_000_000;
/// Every tick of the longest experiment at the largest pairwise workload.
pub const MAX_WORK_UNITS: u64 = MAX_TICKS * (MAX_BODIES as u64 * (MAX_BODIES as u64 - 1) / 2);
pub fn physics_id() -> String {
    PHYSICS_ID.into()
}

#[derive(Serialize, Deserialize)]
struct Checkpoint {
    schema: u32,
    physics: String,
    world: World,
    #[serde(default)]
    cuts: Vec<f64>,
    #[serde(default)]
    far: Vec<V2>,
}

#[derive(Serialize)]
struct CheckpointRef<'a> {
    schema: u32,
    physics: &'a str,
    world: &'a World,
    cuts: &'a [f64],
    far: &'a [V2],
}

impl World {
    pub fn checkpoint(&self) -> Result<String, SimError> {
        if self.config.mission.is_some() {
            return Err(SimError::Unsupported(
                "Campaigns are reconstructed from their commands".into(),
            ));
        }
        if self.tick_pending() {
            return Err(SimError::Sequence(
                "Cannot checkpoint a partial tick".into(),
            ));
        }
        // Split cutoffs stay fixed for a four-tick step. At the boundary the
        // next opening kick can also reuse the previous closing acceleration.
        let far = if self.split_step
            && self.tick.is_multiple_of(crate::split::STEP_TICKS)
            && self
                .forces
                .current(&self.bodies, SOFTENING.powi(2), true, true)
        {
            self.forces.output.as_slice()
        } else {
            &[]
        };
        let text = serde_json::to_string(&CheckpointRef {
            schema: 2,
            physics: PHYSICS_ID,
            world: self,
            cuts: &self.near.cuts,
            far,
        })
        .map_err(|e| SimError::Unsupported(e.to_string()))?;
        if text.len() > MAX_CHECKPOINT_BYTES {
            return Err(SimError::Unsupported(
                "Checkpoint exceeds its storage budget".into(),
            ));
        }
        Ok(text)
    }

    pub fn from_checkpoint(text: &str, replay: &Replay) -> Result<Self, SimError> {
        if text.len() > MAX_CHECKPOINT_BYTES {
            return Err(SimError::Unsupported(
                "Checkpoint exceeds its storage budget".into(),
            ));
        }
        let data: Checkpoint =
            serde_json::from_str(text).map_err(|e| SimError::Unsupported(e.to_string()))?;
        let mut w = data.world;
        if replay.physics != PHYSICS_ID
            || replay.version != crate::SAVE_VERSION
            || replay.end_tick > MAX_TICKS
            || !(data.schema == 2 || (data.schema == 1 && !w.split_step))
            || data.physics != PHYSICS_ID
            || w.config.mission.is_some()
            || w.config != replay.config
            || w.tick > replay.end_tick
            || w.tick > MAX_TICKS
            || w.commands.len() > 2048
            || !replay.commands.starts_with(&w.commands)
            || w.commands.iter().any(|c| c.tick > w.tick)
            || replay
                .commands
                .get(w.commands.len())
                .is_some_and(|c| c.tick < w.tick)
        {
            return Err(SimError::Unsupported(
                "Checkpoint does not belong to this experiment and physics build".into(),
            ));
        }
        World::new(w.config.clone())?;
        let ids: BTreeSet<_> = w.bodies.iter().map(|b| b.id).collect();
        if w.bodies.is_empty()
            || w.bodies.len() > MAX_BODIES
            || ids.len() != w.bodies.len()
            || w.bodies[0].id != 0
            || w.bodies[0].kind != Kind::Star
            || w.next_id <= *ids.last().unwrap()
            || w.next_id > 2_048 * MAX_BODIES as u32
            || w.bodies.iter().any(|b| {
                b.id != 0 && b.kind == Kind::Star
                    || !b.mass.is_finite()
                    || b.mass <= 0.
                    || b.mass > 2.
                    || !b.radius.is_finite()
                    || b.radius <= 0.
                    || b.radius > 10.
                    || [
                        b.pos.x,
                        b.pos.y,
                        b.vel.x,
                        b.vel.y,
                        b.spin,
                        b.rotation,
                        b.birth_mass,
                        b.migration_rate,
                        b.material.rock,
                        b.material.ice,
                        b.material.gas,
                    ]
                    .iter()
                    .any(|v| !v.is_finite() || v.abs() > 1e12)
                    || b.material.rock < 0.
                    || b.material.ice < 0.
                    || b.material.gas < 0.
                    || (b.material.rock + b.material.ice + b.material.gas - b.mass).abs()
                        > 1e-12 * b.mass.max(1.)
                    || b.parent == Some(b.id)
            })
            || [
                w.spent,
                w.collision_energy,
                w.disk_energy,
                w.disk_momentum.x,
                w.disk_momentum.y,
                w.disk_angular_momentum,
                w.escaped_mass,
                w.escaped_energy,
                w.escaped_momentum.x,
                w.escaped_momentum.y,
                w.escaped_angular_momentum,
            ]
            .iter()
            .any(|v| !v.is_finite())
            || ![4, 16, 32].contains(&w.minimum_substeps)
            || w.next_event > 100_000_000
            || w.events.len() > 24
            || w.resonances.len() > 16
            || w.resonances.iter().any(|r| !r.valid())
            || w.rng == 0
            || w.work_units > MAX_WORK_UNITS
            || w.held_ticks > w.tick
            || !w.history.valid_bounds()
            || w.events
                .iter()
                .any(|e| e.id >= w.next_event || e.tick > w.tick || e.text.len() > 2048)
        {
            return Err(SimError::Unsupported(
                "Checkpoint contains invalid or oversized state".into(),
            ));
        }
        if data.cuts.len() > MAX_BODIES
            || (!data.cuts.is_empty() && data.cuts[0] != crate::split::STAR_CUT)
            || data.cuts.iter().any(|c| !c.is_finite())
            || (!data.far.is_empty()
                && (data.far.len() != w.bodies.len()
                    || data.cuts.len() != w.bodies.len()
                    || !w.split_step
                    || !w.tick.is_multiple_of(crate::split::STEP_TICKS)))
            || data
                .far
                .iter()
                .any(|v| !v.x.is_finite() || !v.y.is_finite())
        {
            return Err(SimError::Unsupported(
                "Invalid integrator checkpoint".into(),
            ));
        }
        w.near.cuts = data.cuts;
        if !data.far.is_empty() {
            w.forces.restore_far(&w.bodies, &w.near.cuts, data.far);
        }
        Ok(w)
    }
}
