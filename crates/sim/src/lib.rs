//! Deterministic orbital game rules. No clock, browser, GPU, or operating-system RNG.
use serde::{Deserialize, Serialize};
use std::f64::consts::TAU;
pub mod benchmark;
pub mod scenarios;

pub const G: f64 = 39.478_417_604_357_43; // AU, solar masses, years
pub const EARTH: f64 = 3.003e-6;
pub const DT: f64 = 1.0 / 512.0;
pub const MAX_BODIES: usize = 64;
pub const SOFTENING: f64 = 0.002;
pub const SAVE_VERSION: u32 = 1;
pub const MAX_TICKS: u64 = 512 * 600;
pub const MAX_WORK_UNITS: u64 = 20_000_000;

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct V2 {
    pub x: f64,
    pub y: f64,
}
impl V2 {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
    pub fn plus(self, b: Self) -> Self {
        Self::new(self.x + b.x, self.y + b.y)
    }
    pub fn minus(self, b: Self) -> Self {
        Self::new(self.x - b.x, self.y - b.y)
    }
    pub fn scale(self, s: f64) -> Self {
        Self::new(self.x * s, self.y * s)
    }
    pub fn norm2(self) -> f64 {
        self.x * self.x + self.y * self.y
    }
    pub fn norm(self) -> f64 {
        self.norm2().sqrt()
    }
    pub fn cross(self, b: Self) -> f64 {
        self.x * b.y - self.y * b.x
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Star,
    Rocky,
    Ice,
    Giant,
    Dust,
}
impl Kind {
    pub fn mass(self) -> f64 {
        match self {
            Self::Star => 1.0,
            Self::Rocky => EARTH,
            Self::Ice => 2.0 * EARTH,
            Self::Giant => 50.0 * EARTH,
            Self::Dust => 0.25 * EARTH,
        }
    }
    pub fn cost(self) -> f64 {
        self.mass() / EARTH
    }
    fn radius(self, mass: f64) -> f64 {
        // Deliberately enlarged contact radii make accretion observable in a short game.
        if self == Self::Star {
            0.055 * mass.cbrt()
        } else {
            0.009 * (mass / EARTH).cbrt()
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Body {
    pub id: u32,
    pub kind: Kind,
    pub mass: f64,
    pub radius: f64,
    pub pos: V2,
    pub vel: V2,
    /// Unresolved spin retains angular momentum after inelastic merging.
    pub spin: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Config {
    pub seed: u32,
    /// None is unrestricted sandbox; Some(0..9) selects a challenge.
    pub mission: Option<usize>,
    pub star_mass: f64,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            seed: 42,
            mission: Some(0),
            star_mass: 1.0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Command {
    Nudge {
        id: u32,
        tangential: f64,
        radial: f64,
    },
    Launch {
        kind: Kind,
        radius: f64,
        angle: f64,
        speed: f64,
    },
    SeedBelt {
        radius: f64,
    },
    SeedDisk {
        radius: f64,
        spread: f64,
        disorder: f64,
        count: u32,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct RecordedCommand {
    pub tick: u64,
    pub command: Command,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Replay {
    pub version: u32,
    pub config: Config,
    pub commands: Vec<RecordedCommand>,
    pub end_tick: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Event {
    pub id: u32,
    pub tick: u64,
    pub kind: String,
    pub body: u32,
    pub text: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct World {
    pub config: Config,
    pub bodies: Vec<Body>,
    pub tick: u64,
    pub spent: f64,
    pub work_units: u64,
    pub collisions: u32,
    pub ejections: u32,
    pub absorbed: u32,
    pub escaped_mass: f64,
    pub held_ticks: u64,
    pub completed: bool,
    pub events: Vec<Event>,
    pub commands: Vec<RecordedCommand>,
    next_id: u32,
    next_event: u32,
    rng: u32,
}

#[derive(Clone, Copy, Debug, Serialize)]
pub struct Mission {
    pub name: &'static str,
    pub brief: &'static str,
    pub hint: &'static str,
    pub budget: f64,
    pub hold_years: f64,
    pub unlock: &'static str,
}
pub const MISSIONS: [Mission; 10] = [
    Mission { name: "First light", brief: "Keep a planet in a calm orbit for 2 years.", hint: "Launch a rocky world at 1 AU and 100% orbital speed. Press Run.", budget: 8.0, hold_years: 2.0, unlock: "Ice worlds" },
    Mission { name: "A place for life", brief: "Keep a rocky or icy world entirely inside the green zone for 3 years.", hint: "Around a Sun-like star, try 1.1 AU at 100% speed. Green means potential, not guaranteed life.", budget: 12.0, hold_years: 3.0, unlock: "Stellar mass control" },
    Mission { name: "Orbital harmony", brief: "Keep 3 planets in calm orbits together for 5 years.", hint: "Spread worlds across 0.6, 1.2, and 2 AU. Crowded orbits disturb each other.", budget: 15.0, hold_years: 5.0, unlock: "Gas giants" },
    Mission { name: "Worlds from worlds", brief: "Merge two bodies in a collision.", hint: "Place two worlds at the same distance and angle, then run. Their mass becomes one.", budget: 60.0, hold_years: 0.0, unlock: "Debris seeding" },
    Mission { name: "The great escape", brief: "Send a world beyond 8 AU on an unbound trajectory.", hint: "At 1 AU, launch above 142% orbital speed. Watch the dashed escape trajectory.", budget: 65.0, hold_years: 0.0, unlock: "Escape discovery" },
    Mission { name: "Twin gardens", brief: "Keep 2 worlds inside the habitable zone for 4 years.", hint: "Try circular orbits at 1 and 1.35 AU. Both entire orbits must fit inside the zone.", budget: 70.0, hold_years: 4.0, unlock: "Twin garden discovery" },
    Mission { name: "A giant among us", brief: "Keep a gas giant and 3 smaller planets in calm orbits for 5 years.", hint: "Give the giant room beyond 3 AU, with smaller worlds closer to the star.", budget: 115.0, hold_years: 5.0, unlock: "Giant shepherd discovery" },
    Mission { name: "The asteroid atelier", brief: "Keep 10 debris bodies in calm orbits for 3 years.", hint: "Seed a belt near 2.5 AU. Watch its members share the orbital plane.", budget: 120.0, hold_years: 3.0, unlock: "Belt discovery" },
    Mission { name: "Celestial clockwork", brief: "Keep 6 planets in calm orbits for 8 years.", hint: "Use 0.5, 0.8, 1.2, 1.8, 2.7, and 4 AU at circular speed.", budget: 125.0, hold_years: 8.0, unlock: "Clockwork discovery" },
    Mission { name: "A system of your own", brief: "Keep 5 calm planets, including a giant and a habitable world, for 10 years.", hint: "Build outward: a warm inner world, a garden near 1 AU, and a distant giant.", budget: 150.0, hold_years: 10.0, unlock: "Master sculptor" },
];

#[derive(Clone, Copy, Debug, Serialize)]
pub struct Orbit {
    pub period_years: Option<f64>,
    pub distance: f64,
    pub eccentricity: f64,
    pub bound: bool,
    pub periapsis: f64,
    pub apoapsis: f64,
    pub habitable: bool,
    pub calm: bool,
}
#[derive(Clone, Copy, Debug, Serialize)]
pub struct ToolAvailability {
    pub kind: Kind,
    pub cost: f64,
    pub unlocked: bool,
    pub affordable: bool,
}
#[derive(Clone, Debug, Serialize)]
pub struct Status {
    pub collisions: u32,
    pub ejections: u32,
    pub absorbed: u32,
    pub available_slots: usize,
    pub actions_remaining: usize,
    pub tools: [ToolAvailability; 4],
    pub objectives: [Option<Objective>; 3],
    pub exhausted: bool,
    pub years: f64,
    pub remaining: f64,
    pub planets: usize,
    pub calm: usize,
    pub habitable: usize,
    pub giants: usize,
    pub debris: usize,
    pub held_years: f64,
    pub progress: f64,
    pub condition: bool,
    pub completed: bool,
    pub zone_inner: f64,
    pub zone_outer: f64,
}
#[derive(Clone, Copy, Debug, Serialize)]
pub struct Objective {
    pub label: &'static str,
    pub current: usize,
    pub target: usize,
}

impl World {
    pub fn new(config: Config) -> Result<Self, String> {
        if !config.star_mass.is_finite()
            || !(0.6..=1.5).contains(&config.star_mass)
            || config.mission.is_some_and(|m| m >= MISSIONS.len())
        {
            return Err("Invalid stellar mass or mission".into());
        }
        if config.mission.is_some_and(|m| m < 2) && config.star_mass != 1.0 {
            return Err("Complete A place for life to change the star".into());
        }
        let star = Body {
            id: 0,
            kind: Kind::Star,
            mass: config.star_mass,
            radius: Kind::Star.radius(config.star_mass),
            pos: V2::default(),
            vel: V2::default(),
            spin: 0.0,
        };
        Ok(Self {
            rng: config.seed.max(1),
            config,
            bodies: vec![star],
            tick: 0,
            spent: 0.0,
            work_units: 0,
            collisions: 0,
            ejections: 0,
            absorbed: 0,
            escaped_mass: 0.0,
            held_ticks: 0,
            completed: false,
            events: vec![],
            commands: vec![],
            next_id: 1,
            next_event: 1,
        })
    }
    fn random(&mut self) -> f64 {
        let mut x = self.rng;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.rng = x;
        x as f64 / u32::MAX as f64
    }
    pub fn budget(&self) -> f64 {
        self.config.mission.map_or(10_000.0, |m| MISSIONS[m].budget)
    }
    pub fn allowed(&self, kind: Kind) -> bool {
        kind != Kind::Star
            && self.config.mission.is_none_or(|m| match kind {
                Kind::Ice => m >= 1,
                Kind::Giant => m >= 3,
                Kind::Dust => m >= 4,
                _ => true,
            })
    }
    pub fn apply(&mut self, command: Command) -> Result<(), String> {
        if self.commands.len() >= 2048 {
            return Err("This experiment has reached its 2048-action limit".into());
        }
        match command.clone() {
            Command::Nudge {
                id,
                tangential,
                radial,
            } => {
                if self.config.mission.is_some_and(|m| m < 4) {
                    return Err("Orbital nudges unlock with debris tools".into());
                }
                if id == 0
                    || !tangential.is_finite()
                    || !radial.is_finite()
                    || tangential * tangential + radial * radial > 0.25 * 0.25
                    || tangential.abs() + radial.abs() < 1e-12
                {
                    return Err("Nudge a world by up to 25% of local circular speed".into());
                }
                let index = self
                    .bodies
                    .iter()
                    .position(|b| b.id == id)
                    .ok_or("That world is no longer in this system")?;
                if self.spent + 1.0 > self.budget() + 1e-8 {
                    return Err("An orbital nudge needs 1 matter".into());
                }
                let star = &self.bodies[0];
                let b = &self.bodies[index];
                let r = b.pos.minus(star.pos);
                let v = b.vel.minus(star.vel);
                let distance = r.norm();
                let direction = r.scale(1.0 / distance);
                let handedness = if r.cross(v) < 0.0 { -1.0 } else { 1.0 };
                let tangent = V2::new(-direction.y, direction.x).scale(handedness);
                let circular = (G * (star.mass + b.mass) / distance).sqrt();
                let impulse = direction
                    .scale(radial * circular)
                    .plus(tangent.scale(tangential * circular));
                self.bodies[index].vel = self.bodies[index].vel.plus(impulse);
                self.spent += 1.0;
                self.emit(
                    "nudge",
                    id,
                    format!(
                        "Adjusted world {id}: tangential {:+.0}%, radial {:+.0}%",
                        tangential * 100.0,
                        radial * 100.0
                    ),
                );
            }
            Command::SeedDisk {
                radius,
                spread,
                disorder,
                count,
            } => {
                if !self.allowed(Kind::Dust) {
                    return Err("Debris tools are not unlocked in this challenge".into());
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
                    return Err("Choose 4–40 debris bodies, width 0.05–2 AU, disorder 0–60%, within 0.25–6 AU".into());
                }
                if self.bodies.len() + count as usize > MAX_BODIES
                    || self.spent + count as f64 * 0.25 > self.budget() + 1e-8
                {
                    return Err("Not enough matter or body capacity for this disk".into());
                }
                for i in 0..count {
                    let r = radius + (self.random() - 0.5) * spread;
                    let angle = (i as f64 + self.random() * 0.6) * TAU / count as f64;
                    let speed = 1.0 + (self.random() * 2.0 - 1.0) * disorder;
                    self.launch(Kind::Dust, r, angle, speed);
                }
                self.emit(
                    "seed",
                    0,
                    format!("Seeded {count} fragments across a {spread:.2} AU disk"),
                );
            }
            Command::Launch {
                kind,
                radius,
                angle,
                speed,
            } => {
                if !self.allowed(kind) {
                    return Err("That body is not unlocked in this challenge".into());
                }
                if !radius.is_finite()
                    || !(0.25..=6.0).contains(&radius)
                    || !angle.is_finite()
                    || angle.abs() > TAU * 100.0
                    || !speed.is_finite()
                    || !(0.0..=2.2).contains(&speed)
                {
                    return Err("Choose a radius of 0.25–6 AU and speed of 0–220%".into());
                }
                if self.bodies.len() >= MAX_BODIES
                    || self.spent + kind.cost() > self.budget() + 1e-8
                {
                    return Err("Not enough matter or body capacity".into());
                }
                self.launch(kind, radius, angle, speed);
                self.emit(
                    "placed",
                    self.next_id - 1,
                    format!(
                        "Placed world {} at {radius:.2} AU and {:.0}% orbital speed",
                        self.next_id - 1,
                        speed * 100.0
                    ),
                );
            }
            Command::SeedBelt { radius } => {
                if !self.allowed(Kind::Dust) {
                    return Err("Debris seeding unlocks after Worlds from worlds".into());
                }
                if !radius.is_finite()
                    || !(0.5..=5.5).contains(&radius)
                    || self.bodies.len() + 12 > MAX_BODIES
                    || self.spent + 3.0 > self.budget() + 1e-8
                {
                    return Err(
                        "A belt needs 3 matter, 12 free slots, and a radius of 0.5–5.5 AU".into(),
                    );
                }
                for i in 0..12 {
                    let r = radius + (self.random() - 0.5) * 0.18;
                    let angle = (i as f64 + self.random() * 0.2) * TAU / 12.0;
                    self.launch(Kind::Dust, r, angle, 1.0);
                }
                self.emit(
                    "seed",
                    0,
                    format!("Seeded a 12-fragment belt at {radius:.2} AU"),
                );
            }
        }
        self.held_ticks = 0;
        self.commands.push(RecordedCommand {
            tick: self.tick,
            command,
        });
        Ok(())
    }
    fn launch(&mut self, kind: Kind, radius: f64, angle: f64, speed: f64) {
        let star = &self.bodies[0];
        let direction = V2::new(angle.cos(), angle.sin());
        let mass = kind.mass();
        let v = (G * (star.mass + mass) / radius).sqrt() * speed;
        let body = Body {
            id: self.next_id,
            kind,
            mass,
            radius: kind.radius(mass),
            pos: star.pos.plus(direction.scale(radius)),
            vel: star.vel.plus(V2::new(-direction.y, direction.x).scale(v)),
            spin: 0.0,
        };
        self.next_id += 1;
        self.spent += kind.cost();
        self.bodies.push(body);
    }
    fn emit(&mut self, kind: &str, body: u32, text: String) {
        if self.events.len() == 24 {
            self.events.remove(0);
        }
        self.events.push(Event {
            id: self.next_event,
            tick: self.tick,
            kind: kind.into(),
            body,
            text,
        });
        self.next_event += 1;
    }
    fn accelerations(&self) -> [V2; MAX_BODIES] {
        let mut a = [V2::default(); MAX_BODIES];
        for i in 0..self.bodies.len() {
            for j in (i + 1)..self.bodies.len() {
                let d = self.bodies[j].pos.minus(self.bodies[i].pos);
                let r2 = d.norm2() + SOFTENING * SOFTENING;
                let f = d.scale(G / (r2 * r2.sqrt()));
                a[i] = a[i].plus(f.scale(self.bodies[j].mass));
                a[j] = a[j].minus(f.scale(self.bodies[i].mass));
            }
        }
        a
    }
    /// Each tick always runs four kick-drift-kick substeps. Speed never changes dt.
    pub fn step(&mut self) {
        if self.exhausted() {
            return;
        }
        self.work_units += self.tick_work();
        let h = DT / 4.0;
        for _ in 0..4 {
            self.merge_contacts(0.0);
            let a = self.accelerations();
            for (i, b) in self.bodies.iter_mut().enumerate() {
                b.vel = b.vel.plus(a[i].scale(h / 2.0));
                b.pos = b.pos.plus(b.vel.scale(h));
            }
            self.merge_contacts(h);
            let a = self.accelerations();
            for (i, b) in self.bodies.iter_mut().enumerate() {
                b.vel = b.vel.plus(a[i].scale(h / 2.0));
            }
        }
        self.tick += 1;
        for i in (1..self.bodies.len()).rev() {
            let orbit = self.orbit(&self.bodies[i]);
            if orbit.distance > 8.0 && !orbit.bound {
                let b = self.bodies.remove(i);
                self.escaped_mass += b.mass;
                self.ejections += 1;
                self.emit(
                    "escape",
                    b.id,
                    format!("World {} escaped into interstellar space", b.id),
                );
            }
        }
        if !self.completed {
            let condition = self.status().condition;
            self.held_ticks = if condition { self.held_ticks + 1 } else { 0 };
            if self
                .config
                .mission
                .is_some_and(|m| condition && self.held_ticks as f64 * DT >= MISSIONS[m].hold_years)
            {
                self.completed = true;
                self.emit(
                    "complete",
                    0,
                    "Challenge complete. A new discovery awaits.".into(),
                );
            }
        }
    }
    pub fn advance(&mut self, ticks: u32) {
        for _ in 0..ticks {
            self.step();
        }
    }
    fn merge_contacts(&mut self, sweep: f64) {
        loop {
            let previous_count = self.bodies.len();
            let mut i = 0;
            while i < self.bodies.len() {
                let mut j = i + 1;
                while j < self.bodies.len() {
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
                        let b = self.bodies.remove(j);
                        let a = &mut self.bodies[i];
                        let mass = a.mass + b.mass;
                        let angular = a.mass * a.pos.cross(a.vel)
                            + b.mass * b.pos.cross(b.vel)
                            + a.spin
                            + b.spin;
                        a.pos = a.pos.scale(a.mass / mass).plus(b.pos.scale(b.mass / mass));
                        a.vel = a.vel.scale(a.mass / mass).plus(b.vel.scale(b.mass / mass));
                        a.mass = mass;
                        a.spin = angular - mass * a.pos.cross(a.vel);
                        if a.kind != Kind::Star && b.kind == Kind::Giant {
                            a.kind = Kind::Giant;
                        }
                        if a.kind == Kind::Dust && mass >= 0.5 * EARTH {
                            a.kind = Kind::Rocky;
                        }
                        a.radius = a.kind.radius(mass);
                        let id = a.id;
                        if a.kind == Kind::Star {
                            self.absorbed += 1;
                            self.emit("absorb", b.id, format!("World {} fell into the star", b.id));
                        } else {
                            self.collisions += 1;
                            self.emit("collision", id, format!("Worlds {id} and {} merged", b.id));
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
    pub fn zone(&self) -> (f64, f64) {
        let scale = self.bodies[0].mass.powf(1.75);
        (0.85 * scale, 1.55 * scale)
    }
    pub fn orbit(&self, body: &Body) -> Orbit {
        let star = &self.bodies[0];
        let r = body.pos.minus(star.pos);
        let v = body.vel.minus(star.vel);
        let distance = r.norm().max(1e-12);
        let mu = G * (star.mass + body.mass);
        let energy = v.norm2() / 2.0 - mu / distance;
        let bound = energy < 0.0;
        let eccentricity = (1.0 + 2.0 * energy * r.cross(v).powi(2) / mu.powi(2))
            .max(0.0)
            .sqrt();
        let axis = if bound { -mu / (2.0 * energy) } else { 1e12 };
        let periapsis = if bound {
            axis * (1.0 - eccentricity)
        } else {
            r.cross(v).powi(2) / (mu * (1.0 + eccentricity))
        };
        let apoapsis = if bound {
            axis * (1.0 + eccentricity)
        } else {
            1e12
        };
        let (inner, outer) = self.zone();
        let habitable = body.kind != Kind::Giant
            && body.kind != Kind::Dust
            && bound
            && periapsis >= inner
            && apoapsis <= outer
            && body.mass < 10.0 * EARTH;
        Orbit {
            period_years: bound.then(|| TAU * (axis.powi(3) / mu).sqrt()),
            distance,
            eccentricity,
            bound,
            periapsis,
            apoapsis,
            habitable,
            calm: bound && eccentricity < 0.25 && periapsis > 0.18 && apoapsis < 7.0,
        }
    }
    pub fn status(&self) -> Status {
        let mut s = Status {
            collisions: self.collisions,
            ejections: self.ejections,
            absorbed: self.absorbed,
            available_slots: MAX_BODIES - self.bodies.len(),
            actions_remaining: 2048 - self.commands.len(),
            tools: [Kind::Rocky, Kind::Ice, Kind::Giant, Kind::Dust].map(|kind| ToolAvailability {
                kind,
                cost: kind.cost(),
                unlocked: self.allowed(kind),
                affordable: self.spent + kind.cost() <= self.budget() + 1e-8,
            }),
            objectives: [None; 3],
            exhausted: self.exhausted(),
            years: self.tick as f64 * DT,
            remaining: (self.budget() - self.spent).max(0.0),
            planets: 0,
            calm: 0,
            habitable: 0,
            giants: 0,
            debris: 0,
            held_years: self.held_ticks as f64 * DT,
            progress: 0.0,
            condition: false,
            completed: self.completed,
            zone_inner: self.zone().0,
            zone_outer: self.zone().1,
        };
        for body in self.bodies.iter().skip(1) {
            let o = self.orbit(body);
            if body.kind == Kind::Dust {
                s.debris += usize::from(o.calm);
            } else {
                s.planets += 1;
                s.calm += usize::from(o.calm);
            }
            s.habitable += usize::from(o.habitable);
            s.giants += usize::from(body.kind == Kind::Giant && o.calm);
        }
        if let Some(m) = self.config.mission {
            let goal = |label, current, target| {
                Some(Objective {
                    label,
                    current,
                    target,
                })
            };
            s.objectives = match m {
                0 => [goal("Calm worlds", s.calm, 1), None, None],
                1 => [goal("Potential gardens", s.habitable, 1), None, None],
                2 => [goal("Calm worlds", s.calm, 3), None, None],
                3 => [goal("Collisions", self.collisions as usize, 1), None, None],
                4 => [goal("Escapes", self.ejections as usize, 1), None, None],
                5 => [goal("Potential gardens", s.habitable, 2), None, None],
                6 => [
                    goal("Calm gas giants", s.giants, 1),
                    goal("Calm small worlds", s.calm - s.giants, 3),
                    None,
                ],
                7 => [goal("Calm fragments", s.debris, 10), None, None],
                8 => [goal("Calm worlds", s.calm, 6), None, None],
                9 => [
                    goal("Calm worlds", s.calm, 5),
                    goal("Calm gas giants", s.giants, 1),
                    goal("Potential gardens", s.habitable, 1),
                ],
                _ => [None; 3],
            };
            s.condition = s.objectives.iter().flatten().all(|g| g.current >= g.target);
            s.progress = if self.completed {
                1.0
            } else if MISSIONS[m].hold_years > 0.0 {
                (s.held_years / MISSIONS[m].hold_years).min(1.0)
            } else {
                f64::from(s.condition)
            };
        }
        s
    }
    pub fn energy(&self) -> f64 {
        let mut e: f64 = self
            .bodies
            .iter()
            .map(|b| 0.5 * b.mass * b.vel.norm2())
            .sum();
        for i in 0..self.bodies.len() {
            for j in i + 1..self.bodies.len() {
                e -= G * self.bodies[i].mass * self.bodies[j].mass
                    / (self.bodies[i].pos.minus(self.bodies[j].pos).norm2()
                        + SOFTENING * SOFTENING)
                        .sqrt();
            }
        }
        e
    }
    pub fn momentum(&self) -> V2 {
        self.bodies
            .iter()
            .fold(V2::default(), |p, b| p.plus(b.vel.scale(b.mass)))
    }
    pub fn angular_momentum(&self) -> f64 {
        self.bodies
            .iter()
            .map(|b| b.mass * b.pos.cross(b.vel) + b.spin)
            .sum()
    }
    pub fn replay(&self) -> Replay {
        Replay {
            version: SAVE_VERSION,
            config: self.config.clone(),
            commands: self.commands.clone(),
            end_tick: self.tick,
        }
    }
    pub fn rewind(&mut self) -> Result<(), String> {
        let mut replay = self.replay();
        replay.commands.retain(|action| action.tick == 0);
        replay.end_tick = 0;
        *self = Self::from_replay(replay)?;
        Ok(())
    }
    pub fn undo(&mut self) -> Result<(), String> {
        let mut replay = self.replay();
        replay
            .commands
            .pop()
            .ok_or("No sculpting actions to undo")?;
        *self = Self::from_replay(replay)?;
        Ok(())
    }
    fn tick_work(&self) -> u64 {
        let n = self.bodies.len() as u64;
        (n * n.saturating_sub(1) / 2).max(1)
    }
    pub fn exhausted(&self) -> bool {
        self.tick >= MAX_TICKS || self.work_units + self.tick_work() > MAX_WORK_UNITS
    }
    pub fn from_replay(replay: Replay) -> Result<Self, String> {
        // Import is work-bounded. No untrusted state or derived scores are accepted.
        if replay.version != SAVE_VERSION
            || replay.end_tick > MAX_TICKS
            || replay.commands.len() > 2048
        {
            return Err("Unsupported or oversized experiment".into());
        }
        let mut world = Self::new(replay.config)?;
        for action in replay.commands {
            if action.tick < world.tick || action.tick > replay.end_tick {
                return Err("Commands must be ordered inside the experiment".into());
            }
            world.advance((action.tick - world.tick) as u32);
            if world.tick != action.tick {
                return Err("Experiment exceeds the simulation work limit".into());
            }
            world.apply(action.command)?;
        }
        world.advance((replay.end_tick - world.tick) as u32);
        if world.tick != replay.end_tick {
            return Err("Experiment exceeds the simulation work limit".into());
        }
        Ok(world)
    }
}
