//! Time integration: fixed kick-drift-kick substeps, contact resolution,
//! disk torque, escapes and mission hold timers. Display speed never enters.
use crate::*;
use std::f64::consts::TAU;

/// A tick paused at a force evaluation. Derived scratch, never saved.
#[derive(Clone, Debug)]
pub(crate) struct TickState {
    substeps: u32,
    h: f64,
    tree_allowed: bool,
    next: u32,
    contacts: u64,
    drifted: bool,
    /// The next evaluation re-partitions the tree: once per tick.
    rebuild_next: bool,
}
#[derive(Clone, Debug, Default)]
pub(crate) struct PendingTick(pub(crate) Option<TickState>);
impl PartialEq for PendingTick {
    fn eq(&self, _: &Self) -> bool {
        true
    }
}

impl World {
    /// Explicit force probe for headless/GPU comparisons; physical state is unchanged.
    pub fn sample_forces(&mut self, exact: bool) -> &[V2] {
        self.forces.x.clear(); // Benchmark actual calculation, including staging/build.
        self.update_forces(!exact, true);
        &self.forces.output
    }
    pub(crate) fn update_forces(&mut self, tree_allowed: bool, rebuild: bool) {
        self.forces
            .update(&self.bodies, SOFTENING.powi(2), tree_allowed, rebuild);
    }
    /// Substeps per tick. Large systems without authored moons or migration
    /// integrate at 1/1024 year: still hundreds of steps per innermost orbit,
    /// and the swept contact search does not depend on the step.
    pub fn substeps(&self) -> u32 {
        if self.minimum_substeps == 4 && self.bodies.len() >= 512 {
            2
        } else {
            self.minimum_substeps
        }
    }
    /// Changes whenever a contact resolved. A merge adds a collision and
    /// removes a body, so the two must not be allowed to cancel.
    fn contact_serial(&self) -> u64 {
        let events = u64::from(self.collisions)
            + u64::from(self.grazes)
            + u64::from(self.disruptions)
            + u64::from(self.absorbed);
        (events << 24) | self.bodies.len() as u64
    }
    /// Symmetric dissipative splitting. Record each actual exchange with the disk.
    pub(crate) fn apply_disk_torque(&mut self, h: f64) {
        let star = self.bodies[0].clone();
        for body in self.bodies.iter_mut().skip(1) {
            if body.migration_rate == 0.0 {
                continue;
            }
            let before = body.vel;
            let r = body.pos.minus(star.pos);
            // A finite inner disk edge prevents dissipative migration from forcing
            // unresolved stellar-skimming orbits. Gravity remains unchanged.
            let taper = ((r.norm() - 0.25) / 0.10).clamp(0., 1.);
            let migration_rate = body.migration_rate * taper * taper * (3. - 2. * taper);
            if migration_rate == 0. {
                continue;
            }
            let radial = r.scale(1.0 / r.norm());
            let v = before.minus(star.vel);
            let projected = v.x * radial.x + v.y * radial.y;
            body.vel = star
                .vel
                .plus(v.scale(libm::exp(-h * migration_rate / 2.0)))
                .minus(radial.scale(projected * (1.0 - libm::exp(-h * migration_rate * 10.0))));
            self.disk_energy += 0.5 * body.mass * (before.norm2() - body.vel.norm2());
            let exchange = before.minus(body.vel).scale(body.mass);
            self.disk_momentum = self.disk_momentum.plus(exchange);
            self.disk_angular_momentum += body.pos.cross(exchange);
        }
    }
    /// Fixed KDK resolution: four substeps, sixteen after a moon is authored, thirty-two after disk migration.
    /// Display speed never changes the timestep.
    pub fn step(&mut self) {
        self.integrate_tick(self.substeps());
    }
    pub(crate) fn integrate_tick(&mut self, substeps: u32) {
        self.integrate_tick_with_solver(substeps, true);
    }
    pub(crate) fn integrate_tick_with_solver(&mut self, substeps: u32, tree_allowed: bool) {
        let mut request = self.tick_begin(substeps, tree_allowed);
        while let Some(rebuild) = request {
            self.update_forces(tree_allowed, rebuild);
            request = self.tick_resume();
        }
    }
    /// Start a tick whose force evaluations may happen outside the engine.
    /// Returns `Some(rebuild)` when accelerations are needed in
    /// `forces.output` before `tick_resume`, or `None` if nothing ran.
    pub fn tick_begin(&mut self, substeps: u32, tree_allowed: bool) -> Option<bool> {
        if self.exhausted() || self.pending.0.is_some() {
            return None;
        }
        self.work_units += self.tick_work();
        self.merge_contacts(0.0);
        // One partition per tick; a contact within the tick changes the body
        // set or moves bodies discontinuously, so it forces a fresh partition.
        self.pending.0 = Some(TickState {
            substeps,
            h: DT / f64::from(substeps),
            tree_allowed,
            next: 0,
            contacts: self.contact_serial(),
            drifted: false,
            rebuild_next: true,
        });
        if self
            .forces
            .current(&self.bodies, SOFTENING.powi(2), tree_allowed)
        {
            // Nothing moved since the last evaluation: the opening kick reuses
            // it, and the first evaluation inside the tick takes the rebuild.
            return self.tick_resume();
        }
        self.pending.0.as_mut().expect("just set").rebuild_next = false;
        Some(true)
    }
    pub fn tick_pending(&self) -> bool {
        self.pending.0.is_some()
    }
    /// Continue with `forces.output` filled for the current positions. Returns
    /// the next request, or `None` once the tick is complete.
    pub fn tick_resume(&mut self) -> Option<bool> {
        let mut state = self.pending.0.take()?;
        let h = state.h;
        loop {
            if !state.drifted {
                // First half of a substep with forces at its start.
                self.apply_disk_torque(h / 2.);
                for (i, b) in self.bodies.iter_mut().enumerate() {
                    b.vel = b.vel.plus(self.forces.output[i].scale(h / 2.0));
                    b.pos = b.pos.plus(b.vel.scale(h));
                    if b.id != 0 {
                        b.rotation = (b.rotation
                            + b.spin / (0.4 * b.mass * b.radius * b.radius) * h)
                            .rem_euclid(TAU);
                    }
                }
                self.merge_contacts(h);
                let rebuild = state.rebuild_next || self.contact_serial() != state.contacts;
                state.rebuild_next = false;
                state.contacts = self.contact_serial();
                state.drifted = true;
                self.pending.0 = Some(state);
                return Some(rebuild);
            }
            // Second half with forces at the drifted positions.
            for (i, b) in self.bodies.iter_mut().enumerate() {
                b.vel = b.vel.plus(self.forces.output[i].scale(h / 2.0));
            }
            self.apply_disk_torque(h / 2.);
            state.next += 1;
            state.drifted = false;
            if state.next >= state.substeps {
                break;
            }
        }
        self.finish_tick();
        None
    }
    /// The pending request's staged state for helpers.
    pub fn force_request(&mut self) -> Vec<f64> {
        gravity::Forces::request(&self.bodies)
    }
    /// Install helper outputs as the pending request's accelerations.
    pub fn force_reduce(&mut self, groups: &[f64], rebuild: bool) -> bool {
        self.pending.0.is_some()
            && self
                .forces
                .reduce(&self.bodies, SOFTENING.powi(2), groups, rebuild)
    }
    /// Compute forces in the engine for a pending request and continue; the
    /// fallback when helpers are unavailable mid-tick.
    pub fn tick_local(&mut self, rebuild: bool) -> Option<bool> {
        let tree_allowed = self.pending.0.as_ref()?.tree_allowed;
        self.update_forces(tree_allowed, rebuild);
        self.tick_resume()
    }
    fn finish_tick(&mut self) {
        self.tick += 1;
        if self.tick.is_multiple_of(8) {
            self.refresh_satellites();
        }
        self.observe_resonances();
        for i in (1..self.bodies.len()).rev() {
            // Bodies inside the escape boundary cannot be removed. Avoid a full
            // osculating orbit (angles, period and habitability) for this common case.
            if self.bodies[i].pos.minus(self.bodies[0].pos).norm2() <= 64.0 {
                continue;
            }
            let orbit = self.orbit(&self.bodies[i]);
            if orbit.distance > 8.0 && !orbit.bound {
                let before_energy = self.affected_energy(&[self.bodies[i].id]);
                let b = self.bodies.remove(i);
                self.escaped_energy += before_energy - self.affected_energy(&[]);
                self.escaped_momentum = self.escaped_momentum.plus(b.vel.scale(b.mass));
                self.escaped_angular_momentum += b.mass * b.pos.cross(b.vel) + b.spin;
                self.escaped_mass += b.mass;
                self.ejections += 1;
                self.assisted_ejections += u32::from(b.initially_bound);
                self.emit(
                    EventKind::Escape,
                    b.id,
                    format!("World {} escaped into interstellar space", b.id),
                );
                {
                    self.events
                        .last_mut()
                        .expect("just emitted escape")
                        .position = Some(b.pos);
                }
            }
        }
        if !self.completed && self.config.mission.is_some() {
            let condition = self.status().condition;
            self.held_ticks = if condition { self.held_ticks + 1 } else { 0 };
            if self.config.mission.is_some_and(|_| {
                condition
                    && self.held_ticks as f64 * DT
                        >= self.mission().expect("mission exists").hold_years
            }) {
                self.completed = true;
                self.emit(
                    EventKind::Complete,
                    0,
                    "Challenge complete. A new discovery awaits.".into(),
                );
            }
        }
        self.observe_history(false);
    }
    pub fn advance(&mut self, ticks: u32) {
        for _ in 0..ticks {
            if self.exhausted() {
                break;
            }
            self.step();
        }
    }
    pub(crate) fn merge_contacts(&mut self, sweep: f64) {
        let indexed = self.bodies.len() > 8;
        if indexed {
            self.contact_search.rebuild(&self.bodies, sweep);
        }
        loop {
            let previous_count = self.bodies.len();
            let mut i = 0;
            while i < self.bodies.len() {
                let mut j = i + 1;
                while j < self.bodies.len() {
                    if indexed {
                        let Some(candidate) = self.contact_search.next(i, j) else {
                            break;
                        };
                        j = candidate;
                    }
                    let a = &self.bodies[i];
                    let b = &self.bodies[j];
                    // Closest point on the relative drift segment catches fast bodies
                    // that pass through each other between endpoint samples.
                    let separation = a.pos.minus(b.pos);
                    let drift = a.vel.minus(b.vel).scale(sweep);
                    let fraction = if drift.norm2() > 0.0 {
                        ((separation.x * drift.x + separation.y * drift.y) / drift.norm2())
                            .clamp(0.0, 1.0)
                    } else {
                        0.0
                    };
                    let closest = separation.minus(drift.scale(fraction));
                    if closest.norm2() <= (a.radius + b.radius).powi(2) {
                        if self.resolve_solid_contact(i, j, sweep) {
                            if indexed {
                                self.contact_search.rebuild(&self.bodies, sweep);
                            }
                            j += 1;
                            continue;
                        }
                        self.merge_pair(i, j);
                        if indexed {
                            self.contact_search.rebuild(&self.bodies, sweep);
                        }
                        // A growing contact radius can overlap bodies tested earlier.
                        j = i + 1;
                    } else {
                        j += 1;
                    }
                }
                i += 1;
            }
            if self.bodies.len() == previous_count {
                break;
            }
        }
    }
    pub(crate) fn tick_work(&self) -> u64 {
        let n = self.bodies.len() as u64;
        (n * n.saturating_sub(1) / 2).max(1)
    }
    pub fn exhausted(&self) -> bool {
        self.tick >= MAX_TICKS
    }
    /// Perfectly inelastic merger of bodies i and j (j is removed). Conserves
    /// mass, material, momentum and angular momentum; records the impact.
    pub(crate) fn merge_pair(&mut self, i: usize, j: usize) {
        let energy_before = self.affected_energy(&[self.bodies[i].id, self.bodies[j].id]);
        let orbit_before = self
            .moon_orbit(&self.bodies[i])
            .unwrap_or_else(|| self.orbit(&self.bodies[i]));
        let anchor = self.bodies[i]
            .parent
            .and_then(|id| self.bodies.iter().find(|b| b.id == id))
            .unwrap_or(&self.bodies[0])
            .pos;
        let before = orbit_before.eccentricity;
        let b = self.bodies.remove(j);
        let a = &mut self.bodies[i];
        let mass = a.mass + b.mass;
        let masses = [a.mass, b.mass];
        let radius_before = a.radius;
        let relative_speed = a.vel.minus(b.vel).norm();
        let dissipated_energy = 0.5 * a.mass * b.mass / mass * relative_speed.powi(2);
        a.migration_rate = (a.migration_rate * a.mass + b.migration_rate * b.mass) / mass;
        a.material = a.material.plus(b.material);
        a.mergers += b.mergers + 1;
        a.debris_origin &= b.debris_origin;
        a.initially_bound &= b.initially_bound;
        let angular = a.mass * a.pos.cross(a.vel) + b.mass * b.pos.cross(b.vel) + a.spin + b.spin;
        a.pos = a.pos.scale(a.mass / mass).plus(b.pos.scale(b.mass / mass));
        a.vel = a.vel.scale(a.mass / mass).plus(b.vel.scale(b.mass / mass));
        a.mass = mass;
        a.spin = angular - mass * a.pos.cross(a.vel);
        if a.kind != Kind::Star {
            a.kind = a.material.kind(mass);
            if a.kind == Kind::Dust && !a.debris_origin {
                a.kind = if a.material.ice / mass >= 0.35 {
                    Kind::Ice
                } else {
                    Kind::Rocky
                };
            }
        }
        a.radius = a.kind.radius_for(mass);
        let id = a.id;
        let position = a.pos;
        let radius_after = a.radius;
        if a.kind == Kind::Star {
            self.absorbed += 1;
            self.emit(
                EventKind::Absorb,
                b.id,
                format!("World {} fell into the star", b.id),
            );
            {
                self.events
                    .last_mut()
                    .expect("just emitted absorption")
                    .position = Some(position);
            }
        } else {
            self.collisions += 1;
            self.emit(
                EventKind::Collision,
                id,
                format!("Worlds {id} and {} merged", b.id),
            );
            {
                let orbit_after = self
                    .moon_orbit(&self.bodies[i])
                    .unwrap_or_else(|| self.orbit(&self.bodies[i]));
                let after = orbit_after.eccentricity;
                let event = self.events.last_mut().expect("just emitted collision");
                event.text = format!("Impact → {:.2} Earth masses · radius +{:.0}% · orbit e {before:.2} → {after:.2}", mass / EARTH, (radius_after / radius_before - 1.0) * 100.0);
                event.impact = Some(Impact {
                    position,
                    consumed: Some(b.id),
                    masses,
                    mass,
                    radius_before,
                    radius_after,
                    relative_speed,
                    dissipated_energy,
                    eccentricity_before: before,
                    eccentricity_after: after,
                    orbit_before: Some(orbit_before),
                    orbit_after: Some(orbit_after),
                    anchor: Some(anchor),
                    outcome: Some(collisions::Outcome::Merge),
                    remnants: vec![id],
                });
            }
        }
        for child in &mut self.bodies {
            if child.parent == Some(b.id) {
                child.parent = Some(id);
            }
            if child.parent == Some(child.id) {
                child.parent = None;
            }
        }
        self.collision_energy += energy_before - self.affected_energy(&[id]);
    }
}
