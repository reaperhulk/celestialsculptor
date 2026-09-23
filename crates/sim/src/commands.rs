//! Player edits. Every change to a world enters through `World::apply`, which
//! validates, records and observes; each command has its own method below.
use crate::orbit::direction;
use crate::*;
use std::f64::consts::TAU;

impl World {
    pub fn apply(&mut self, command: Command) -> Result<(), SimError> {
        // A command inside a tick would be recorded at its start but act on
        // part-way positions, so a replay could not reproduce it.
        if self.tick_pending() {
            return Err(SimError::Sequence(
                "Wait for the current step to finish before editing".into(),
            ));
        }
        if self.commands.len() >= 2048 {
            return Err(SimError::Capacity(
                "This experiment has reached its 2048-action limit".into(),
            ));
        }
        match command.clone() {
            Command::TrackHistory { id, enabled } => self.apply_track_history(id, enabled)?,
            Command::SeedSwarm { count, disorder } => self.apply_seed_swarm(count, disorder)?,
            Command::GenerateSystem {
                style,
                count,
                chaos,
            } => self.apply_generate_system(style, count, chaos)?,
            Command::Migration { id, timescale } => self.apply_migration(id, timescale)?,
            Command::LaunchMoon {
                parent,
                kind,
                mass,
                distance,
                angle,
                speed,
            } => self.apply_launch_moon(parent, kind, mass, distance, angle, speed)?,
            Command::Spin { id, rate } => self.apply_spin(id, rate)?,
            Command::LaunchMass {
                kind,
                mass,
                radius,
                angle,
                speed,
            } => self.apply_launch_mass(kind, mass, radius, angle, speed)?,
            Command::Nudge {
                id,
                tangential,
                radial,
            } => self.apply_nudge(id, tangential, radial)?,
            Command::SeedDisk {
                radius,
                spread,
                disorder,
                count,
            } => self.apply_seed_disk(radius, spread, disorder, count)?,
            Command::Launch {
                kind,
                radius,
                angle,
                speed,
            } => self.apply_launch(kind, radius, angle, speed)?,
            Command::SeedBelt { radius } => self.apply_seed_belt(radius)?,
        }
        if !matches!(command, Command::Spin { .. } | Command::TrackHistory { .. }) {
            self.held_ticks = 0;
            self.resonances.clear();
        }
        if !matches!(command, Command::TrackHistory { .. }) {
            self.refresh_satellites();
        }
        self.commands.push(RecordedCommand {
            tick: self.tick,
            command,
        });
        self.observe_history(true);
        Ok(())
    }
    pub(crate) fn apply_track_history(&mut self, id: u32, enabled: bool) -> Result<(), SimError> {
        if id == 0 || !self.bodies.iter().any(|b| b.id == id) {
            return Err(SimError::Invalid(
                "Choose an existing world to keep its detailed history".into(),
            ));
        }
        if enabled && !self.history.pinned_ids.contains(&id) {
            if self.history.pinned_ids.len() >= 8 {
                return Err(SimError::Capacity(
                    "Keep detailed history for up to eight chosen worlds".into(),
                ));
            }
            self.history.pinned_ids.push(id);
        } else if !enabled {
            self.history.pinned_ids.retain(|value| *value != id);
        }

        Ok(())
    }

    pub(crate) fn apply_seed_swarm(&mut self, count: u32, disorder: f64) -> Result<(), SimError> {
        if self.config.mission.is_some()
            || !(4..MAX_BODIES as u32).contains(&count)
            || self.bodies.len() + count as usize > self.max_bodies()
            || !disorder.is_finite()
            || !(0.0..=1.0).contains(&disorder)
            || self.spent + 16.0 > self.budget() + 1e-8
        {
            return Err(SimError::Invalid(
                "Choose 4–8191 swarm particles in a new sandbox, with disorder from 0 to 100%"
                    .into(),
            ));
        }
        // Fixed total mass as resolution increases; every particle both feels
        // and sources gravity, with volume-derived physical contact radii.
        for i in 0..count {
            let radius = 0.8 + 4.4 * self.random().sqrt();
            let angle = (i as f64 * 2.399_963_229_728_653 + self.random() * 0.1).rem_euclid(TAU);
            let speed = 1.0 + (self.random() - 0.5) * disorder * 0.3;
            self.launch_mass(
                Kind::Dust,
                16.0 * EARTH / f64::from(count),
                radius,
                angle,
                speed,
            );
        }

        Ok(())
    }

    pub(crate) fn apply_generate_system(
        &mut self,
        style: generator::SystemStyle,
        count: u32,
        chaos: f64,
    ) -> Result<(), SimError> {
        if self.config.mission.is_some() || self.bodies.len() != 1 || self.tick != 0 {
            return Err(SimError::Locked(
                "Generate a random system from an empty sandbox".into(),
            ));
        }
        let commands =
            generation::commands(self.config.seed, style, count, chaos, self.config.star_mass)?;
        let mut generated = self.clone();
        let previous = generated.commands.len();
        for command in commands {
            generated.apply(command)?;
        }
        generated.commands.truncate(previous);
        *self = generated;

        Ok(())
    }

    pub(crate) fn apply_migration(&mut self, id: u32, timescale: f64) -> Result<(), SimError> {
        if self.config.mission.is_some()
            || !timescale.is_finite()
            || (timescale != 0.0 && !(20.0..=2000.0).contains(&timescale))
        {
            return Err(SimError::Locked(
                "Disk migration is a sandbox tool: use 20–2000 years, or zero to turn it off"
                    .into(),
            ));
        }
        let body = self
            .bodies
            .iter_mut()
            .find(|b| b.id == id && id != 0 && b.parent.is_none())
            .ok_or(SimError::Invalid(
                "Select a planet for disk migration".into(),
            ))?;
        body.migration_rate = if timescale == 0.0 {
            0.0
        } else {
            1.0 / timescale
        };
        if timescale > 0. {
            self.minimum_substeps = 32;
        }
        self.emit(
            EventKind::Migration,
            id,
            if timescale == 0.0 {
                "Disk migration stopped".into()
            } else {
                format!(
                    "Disk torque: World {id} migrates inward on a {timescale:.0}-year timescale"
                )
            },
        );

        Ok(())
    }

    pub(crate) fn apply_launch_moon(
        &mut self,
        parent: u32,
        kind: Kind,
        mass: f64,
        distance: f64,
        angle: f64,
        speed: f64,
    ) -> Result<(), SimError> {
        if !self.moons_available() {
            return Err(SimError::Locked(
                "Moon creation unlocks after Borrowed momentum".into(),
            ));
        }
        let host = self
            .bodies
            .iter()
            .find(|b| b.id == parent && b.id != 0 && b.parent.is_none())
            .cloned()
            .ok_or(SimError::Invalid("Select a planet to host a moon".into()))?;
        let moon_mass = mass * EARTH;
        let min = 1.3 * (host.radius + kind.radius_for(moon_mass));
        let max = self.hill_radius(&host) * 0.45;
        if !matches!(kind, Kind::Rocky | Kind::Ice)
            || !mass.is_finite()
            || !(0.001..=10.0).contains(&mass)
            || moon_mass > host.mass * 0.1
            || !distance.is_finite()
            || !(min..=max).contains(&distance)
            || !angle.is_finite()
            || angle.abs() > 100.0 * TAU
            || !speed.is_finite()
            || !(0.2..=1.4).contains(&speed.abs())
            || !self.orbit(&host).bound
        {
            return Err(SimError::Invalid(format!("Choose a moon below 10% of its planet's mass, at {min:.4}–{max:.4} AU, and 20–140% orbital speed")));
        }
        if self.bodies.len() >= self.max_bodies() || self.spent + mass > self.budget() + 1e-8 {
            return Err(SimError::Capacity(
                "Not enough matter or body capacity for a moon".into(),
            ));
        }
        let d = direction(angle);
        let soft = SOFTENING;
        let v = (G * (host.mass + moon_mass) * distance * distance
            / libm::pow(distance * distance + soft * soft, 1.5))
        .sqrt()
            * speed;
        self.launch_mass(kind, moon_mass, 1.0, angle, 1.0);
        let moon = self.bodies.last_mut().expect("moon just created");
        moon.pos = host.pos.plus(d.scale(distance));
        moon.vel = host.vel.plus(V2::new(-d.y, d.x).scale(v));
        moon.parent = Some(parent);
        moon.origin_parent = Some(parent);
        self.minimum_substeps = self.minimum_substeps.max(16);
        self.emit(
            EventKind::Placed,
            self.next_id - 1,
            format!("Moon around World {parent}: {mass:.3} Earth masses at {distance:.4} AU"),
        );

        Ok(())
    }

    pub(crate) fn apply_spin(&mut self, id: u32, rate: f64) -> Result<(), SimError> {
        if !rate.is_finite() || rate.abs() > TAU * 1000.0 {
            return Err(SimError::Invalid(
                "Choose a rotation rate up to 1000 turns per year".into(),
            ));
        }
        let b = self
            .bodies
            .iter_mut()
            .find(|b| b.id == id && id != 0)
            .ok_or(SimError::Invalid("Select a world to rotate".into()))?;
        b.spin = 0.4 * b.mass * b.radius * b.radius * rate;
        self.emit(
            EventKind::Spin,
            id,
            format!(
                "World {id} now spins {}",
                if rate < 0.0 {
                    "clockwise"
                } else {
                    "counterclockwise"
                }
            ),
        );

        Ok(())
    }

    pub(crate) fn apply_launch_mass(
        &mut self,
        kind: Kind,
        mass: f64,
        radius: f64,
        angle: f64,
        speed: f64,
    ) -> Result<(), SimError> {
        let (min, max) = kind.mass_range();
        if !mass.is_finite() || !(min..=max).contains(&mass) {
            return Err(SimError::Invalid(format!(
                "Choose {min}–{max} Earth masses for this world type"
            )));
        }
        self.validate_launch(kind, radius, angle, speed, mass)?;
        self.launch_mass(kind, mass * EARTH, radius, angle, speed);
        self.emit(
            EventKind::Placed,
            self.next_id - 1,
            format!(
                "Placed {mass:.2} Earth masses at {radius:.2} AU and {:.0}% orbital speed",
                speed * 100.0
            ),
        );

        Ok(())
    }

    pub(crate) fn apply_nudge(
        &mut self,
        id: u32,
        tangential: f64,
        radial: f64,
    ) -> Result<(), SimError> {
        if !self.burns_available() {
            return Err(SimError::Locked(
                "Orbital nudges unlock with debris tools".into(),
            ));
        }
        if id == 0
            || !tangential.is_finite()
            || !radial.is_finite()
            || tangential * tangential + radial * radial > 0.25 * 0.25
            || tangential.abs() + radial.abs() < 1e-12
        {
            return Err(SimError::Invalid(
                "Nudge a world by up to 25% of local circular speed".into(),
            ));
        }
        let index = self
            .bodies
            .iter()
            .position(|b| b.id == id)
            .ok_or(SimError::Invalid(
                "That world is no longer in this system".into(),
            ))?;
        if self.spent + 1.0 > self.budget() + 1e-8 {
            return Err(SimError::Capacity("An orbital nudge needs 1 matter".into()));
        }
        let star = self.bodies[index]
            .parent
            .and_then(|id| self.bodies.iter().find(|b| b.id == id))
            .filter(|_| self.moon_orbit(&self.bodies[index]).is_some())
            .unwrap_or(&self.bodies[0]);
        let b = &self.bodies[index];
        let r = b.pos.minus(star.pos);
        let v = b.vel.minus(star.vel);
        let distance = r.norm();
        let direction = r.scale(1.0 / distance);
        let handedness = if r.cross(v) < 0.0 { -1.0 } else { 1.0 };
        let tangent = V2::new(-direction.y, direction.x).scale(handedness);
        let circular = if star.id != 0 {
            (G * (star.mass + b.mass) * distance * distance
                / libm::pow(distance * distance + SOFTENING.powi(2), 1.5))
            .sqrt()
        } else {
            (G * (star.mass + b.mass) / distance).sqrt()
        };
        let impulse = direction
            .scale(radial * circular)
            .plus(tangent.scale(tangential * circular));
        self.bodies[index].vel = self.bodies[index].vel.plus(impulse);
        self.spent += 1.0;
        self.emit(
            EventKind::Nudge,
            id,
            format!(
                "Adjusted world {id}: tangential {:+.0}%, radial {:+.0}%",
                tangential * 100.0,
                radial * 100.0
            ),
        );

        Ok(())
    }

    pub(crate) fn apply_seed_disk(
        &mut self,
        radius: f64,
        spread: f64,
        disorder: f64,
        count: u32,
    ) -> Result<(), SimError> {
        if !self.allowed(Kind::Dust) {
            return Err(SimError::Locked(
                "Debris tools are not unlocked in this challenge".into(),
            ));
        }
        if !radius.is_finite()
            || !spread.is_finite()
            || !disorder.is_finite()
            || !(4..=40).contains(&count)
            || !(0.05..=2.0).contains(&spread)
            || !(0.0..=0.6).contains(&disorder)
            || radius - spread / 2.0 < 0.25
            || radius + spread / 2.0 > 6.0
        {
            return Err(SimError::Invalid(
                "Choose 4–40 debris bodies, width 0.05–2 AU, disorder 0–60%, within 0.25–6 AU"
                    .into(),
            ));
        }
        if self.bodies.len() + count as usize > self.max_bodies()
            || self.spent + count as f64 * 0.25 > self.budget() + 1e-8
        {
            return Err(SimError::Capacity(
                "Not enough matter or body capacity for this disk".into(),
            ));
        }
        for i in 0..count {
            let r = radius + (self.random() - 0.5) * spread;
            let angle = (i as f64 + self.random() * 0.6) * TAU / count as f64;
            let speed = 1.0 + (self.random() * 2.0 - 1.0) * disorder;
            self.launch(Kind::Dust, r, angle, speed);
        }
        self.emit(
            EventKind::Seed,
            0,
            format!("Seeded {count} fragments across a {spread:.2} AU disk"),
        );

        Ok(())
    }

    pub(crate) fn apply_launch(
        &mut self,
        kind: Kind,
        radius: f64,
        angle: f64,
        speed: f64,
    ) -> Result<(), SimError> {
        self.validate_launch(kind, radius, angle, speed, kind.cost())?;
        self.launch(kind, radius, angle, speed);
        self.emit(
            EventKind::Placed,
            self.next_id - 1,
            format!(
                "Placed world {} at {radius:.2} AU and {:.0}% orbital speed",
                self.next_id - 1,
                speed * 100.0
            ),
        );

        Ok(())
    }

    pub(crate) fn apply_seed_belt(&mut self, radius: f64) -> Result<(), SimError> {
        if !self.allowed(Kind::Dust) {
            return Err(SimError::Locked(
                "Debris seeding unlocks after Worlds from worlds".into(),
            ));
        }
        if !radius.is_finite()
            || !(0.5..=5.5).contains(&radius)
            || self.bodies.len() + 12 > self.max_bodies()
            || self.spent + 3.0 > self.budget() + 1e-8
        {
            return Err(SimError::Capacity(
                "A belt needs 3 matter, 12 free slots, and a radius of 0.5–5.5 AU".into(),
            ));
        }
        for i in 0..12 {
            let r = radius + (self.random() - 0.5) * 0.18;
            let angle = (i as f64 + self.random() * 0.2) * TAU / 12.0;
            self.launch(Kind::Dust, r, angle, 1.0);
        }
        self.emit(
            EventKind::Seed,
            0,
            format!("Seeded a 12-fragment belt at {radius:.2} AU"),
        );

        Ok(())
    }

    pub(crate) fn validate_launch(
        &self,
        kind: Kind,
        radius: f64,
        angle: f64,
        speed: f64,
        cost: f64,
    ) -> Result<(), SimError> {
        if !self.allowed(kind) {
            return Err(SimError::Locked(
                "That body is not unlocked in this challenge".into(),
            ));
        }
        if self.config.mission == Some(6) && speed.abs() > 1.35 {
            return Err(SimError::Locked(
                "This challenge caps launch speed at 135%; use the giant's gravity".into(),
            ));
        }
        if !radius.is_finite()
            || !(0.25..=6.0).contains(&radius)
            || !angle.is_finite()
            || angle.abs() > TAU * 100.0
            || !speed.is_finite()
            || !(-2.2..=2.2).contains(&speed)
        {
            return Err(SimError::Invalid(
                "Choose a radius of 0.25–6 AU and speed of 0–220%".into(),
            ));
        }
        if self.config.mission.is_some_and(|m| (3..=5).contains(&m)) {
            let position = self.bodies[0].pos.plus(direction(angle).scale(radius));
            let contact = kind.radius_for(cost * EARTH);
            if self
                .bodies
                .iter()
                .any(|b| b.pos.minus(position).norm() < 5.0 * (b.radius + contact))
            {
                return Err(SimError::Invalid("Leave room for fragments to meet through orbital motion; overlapping placements do not count as formation".into()));
            }
        }
        if self.bodies.len() >= self.max_bodies() || self.spent + cost > self.budget() + 1e-8 {
            return Err(SimError::Capacity(
                "Not enough matter or body capacity".into(),
            ));
        }
        Ok(())
    }
    pub(crate) fn launch(&mut self, kind: Kind, radius: f64, angle: f64, speed: f64) {
        self.launch_mass(kind, kind.mass(), radius, angle, speed);
    }
    pub(crate) fn launch_mass(
        &mut self,
        kind: Kind,
        mass: f64,
        radius: f64,
        angle: f64,
        speed: f64,
    ) {
        let star = &self.bodies[0];
        let direction = direction(angle);
        let v = (G * (star.mass + mass) / radius).sqrt() * speed;
        let body = Body {
            id: self.next_id,
            kind,
            mass,
            radius: kind.radius_for(mass),
            pos: star.pos.plus(direction.scale(radius)),
            vel: star.vel.plus(V2::new(-direction.y, direction.x).scale(v)),
            spin: 0.0,
            material: Material::new(kind, mass),
            birth_mass: mass,
            initially_bound: speed.abs() < 2.0_f64.sqrt(),
            parent: None,
            origin_parent: None,
            rotation: 0.0,
            mergers: 0,
            debris_origin: kind == Kind::Dust,
            migration_rate: 0.0,
        };
        self.next_id += 1;
        self.spent += mass / EARTH;
        self.bodies.push(body);
    }
}
