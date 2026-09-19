//! Deterministic orbital game rules. No clock, browser, GPU, or operating-system RNG.
use serde::{Deserialize, Serialize};
pub mod assessment;
pub mod balances;
pub mod benchmark;
pub mod checkpoint;
pub mod collisions;
mod commands;
mod contact_search;
mod encounters;
pub mod error;
pub mod generation;
pub mod generator;
mod gravity;
#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
mod gravity_simd;
mod gravity_tree;
pub mod history;
mod integrate;
mod missions;
mod orbit;
pub mod replay;
pub mod resonance;
mod rng;
pub mod satellites;
pub mod scenarios;
pub mod sweep;
pub use error::SimError;
pub use missions::{Mission, MISSIONS};

pub const G: f64 = 39.478_417_604_357_43; // AU, solar masses, years
pub const EARTH: f64 = 3.003e-6;
pub const DT: f64 = 1.0 / 512.0;
pub const MAX_BODIES: usize = 8192;
pub const MISSION_MAX_BODIES: usize = 64;
pub const SOFTENING: f64 = 0.0001;
pub const SAVE_VERSION: u32 = 7;
pub const MAX_TICKS: u64 = 512 * 600;

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
    pub fn mass_range(self) -> (f64, f64) {
        match self {
            Self::Rocky | Self::Ice => (0.1, 10.0),
            Self::Giant => (10.0, 1000.0),
            Self::Dust => (0.02, 0.5),
            Self::Star => (0.0, 0.0),
        }
    }
    pub(crate) fn radius_for(self, mass: f64) -> f64 {
        if self == Self::Star {
            0.055 * libm::cbrt(mass)
        } else {
            0.002 * libm::cbrt(mass / EARTH)
        }
    }
}

/// Conserved constituent masses; display type is derived from these after a merger.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct Material {
    pub rock: f64,
    pub ice: f64,
    pub gas: f64,
}
impl Material {
    pub(crate) fn new(kind: Kind, mass: f64) -> Self {
        match kind {
            Kind::Ice => Self {
                ice: mass,
                ..Self::default()
            },
            Kind::Giant | Kind::Star => Self {
                gas: mass,
                ..Self::default()
            },
            _ => Self {
                rock: mass,
                ..Self::default()
            },
        }
    }
    pub(crate) fn plus(self, other: Self) -> Self {
        Self {
            rock: self.rock + other.rock,
            ice: self.ice + other.ice,
            gas: self.gas + other.gas,
        }
    }
    pub(crate) fn kind(self, mass: f64) -> Kind {
        if self.gas / mass >= 0.1 {
            Kind::Giant
        } else if mass < 0.5 * EARTH {
            Kind::Dust
        } else if self.ice / mass >= 0.35 {
            Kind::Ice
        } else {
            Kind::Rocky
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
    pub material: Material,
    pub birth_mass: f64,
    pub initially_bound: bool,
    pub parent: Option<u32>,
    pub origin_parent: Option<u32>,
    pub rotation: f64,
    pub mergers: u32,
    pub debris_origin: bool,
    pub migration_rate: f64,
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
    TrackHistory {
        id: u32,
        enabled: bool,
    },
    SeedSwarm {
        count: u32,
        disorder: f64,
    },
    GenerateSystem {
        style: generator::SystemStyle,
        count: u32,
        chaos: f64,
    },
    Migration {
        id: u32,
        timescale: f64,
    },
    LaunchMoon {
        parent: u32,
        kind: Kind,
        mass: f64,
        distance: f64,
        angle: f64,
        speed: f64,
    },
    Spin {
        id: u32,
        rate: f64,
    },
    LaunchMass {
        kind: Kind,
        mass: f64,
        radius: f64,
        angle: f64,
        speed: f64,
    },
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
    #[serde(default = "checkpoint::physics_id")]
    pub physics: String,
    pub config: Config,
    pub commands: Vec<RecordedCommand>,
    pub end_tick: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Impact {
    pub position: V2,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub consumed: Option<u32>,
    pub masses: [f64; 2],
    pub mass: f64,
    pub radius_before: f64,
    pub radius_after: f64,
    pub relative_speed: f64,
    pub dissipated_energy: f64,
    pub eccentricity_before: f64,
    pub eccentricity_after: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub orbit_before: Option<Orbit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub orbit_after: Option<Orbit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<V2>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcome: Option<collisions::Outcome>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub remnants: Vec<u32>,
}
/// What an event records. Serialized as the same snake_case strings the UI
/// has always received, so replays and exports are unchanged.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    Placed,
    Spin,
    Migration,
    Nudge,
    Seed,
    Escape,
    Absorb,
    Collision,
    Graze,
    Disruption,
    Satellite,
    Complete,
}
impl EventKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Placed => "placed",
            Self::Spin => "spin",
            Self::Migration => "migration",
            Self::Nudge => "nudge",
            Self::Seed => "seed",
            Self::Escape => "escape",
            Self::Absorb => "absorb",
            Self::Collision => "collision",
            Self::Graze => "graze",
            Self::Disruption => "disruption",
            Self::Satellite => "satellite",
            Self::Complete => "complete",
        }
    }
    /// Physical outcomes that change what exists, as opposed to player edits.
    pub fn is_physical(self) -> bool {
        matches!(
            self,
            Self::Collision
                | Self::Graze
                | Self::Disruption
                | Self::Escape
                | Self::Absorb
                | Self::Satellite
        )
    }
}
impl PartialEq<str> for EventKind {
    fn eq(&self, other: &str) -> bool {
        self.as_str() == other
    }
}
impl PartialEq<&str> for EventKind {
    fn eq(&self, other: &&str) -> bool {
        self.as_str() == *other
    }
}
impl std::fmt::Display for EventKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Event {
    pub id: u32,
    pub tick: u64,
    pub kind: EventKind,
    pub body: u32,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub impact: Option<Impact>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<V2>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct World {
    #[serde(skip)]
    forces: gravity::Forces,
    #[serde(skip)]
    contact_search: contact_search::ContactSearch,
    pub history: history::History,
    pub resonances: Vec<resonance::Resonance>,
    pub disk_momentum: V2,
    pub disk_angular_momentum: f64,
    pub disk_energy: f64,
    pub escaped_momentum: V2,
    pub escaped_angular_momentum: f64,
    pub escaped_energy: f64,
    pub config: Config,
    pub bodies: Vec<Body>,
    pub tick: u64,
    /// Sticky fixed resolution after an authored satellite is introduced.
    pub minimum_substeps: u32,
    pub spent: f64,
    pub work_units: u64,
    pub collisions: u32,
    pub grazes: u32,
    pub disruptions: u32,
    /// Signed transfer out of resolved orbital energy during contact resolution.
    pub collision_energy: f64,
    pub ejections: u32,
    pub assisted_ejections: u32,
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

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub struct Orbit {
    pub periapsis_angle: f64,
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
    pub min_mass: f64,
    pub max_mass: f64,
    pub unlocked: bool,
    pub affordable: bool,
}
#[derive(Clone, Debug, Serialize)]
pub struct Status {
    pub collisions: u32,
    pub grazes: u32,
    pub disruptions: u32,
    pub ejections: u32,
    pub assisted_ejections: u32,
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
    pub moons: usize,
    pub grown: usize,
    pub formed: usize,
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
    pub fn new(config: Config) -> Result<Self, SimError> {
        if !config.star_mass.is_finite()
            || !(0.6..=1.5).contains(&config.star_mass)
            || config.mission.is_some_and(|m| m >= MISSIONS.len())
        {
            return Err(SimError::Invalid("Invalid stellar mass or mission".into()));
        }
        if config.mission.is_some_and(|m| m < 2) && config.star_mass != 1.0 {
            return Err(SimError::Locked(
                "Complete A place for life to change the star".into(),
            ));
        }
        let star = Body {
            id: 0,
            kind: Kind::Star,
            mass: config.star_mass,
            radius: Kind::Star.radius_for(config.star_mass),
            pos: V2::default(),
            vel: V2::default(),
            spin: 0.0,
            material: Material::new(Kind::Star, config.star_mass),
            birth_mass: config.star_mass,
            initially_bound: true,
            parent: None,
            origin_parent: None,
            rotation: 0.0,
            mergers: 0,
            debris_origin: false,
            migration_rate: 0.0,
        };
        let mut world = Self {
            forces: gravity::Forces::default(),
            contact_search: contact_search::ContactSearch::default(),
            history: history::History::default(),
            minimum_substeps: 4,
            resonances: vec![],
            disk_momentum: V2::default(),
            disk_angular_momentum: 0.0,
            disk_energy: 0.,
            escaped_momentum: V2::default(),
            escaped_angular_momentum: 0.,
            escaped_energy: 0.,
            rng: config.seed.max(1),
            config,
            bodies: vec![star],
            tick: 0,
            spent: 0.0,
            work_units: 0,
            collisions: 0,
            grazes: 0,
            disruptions: 0,
            collision_energy: 0.,
            ejections: 0,
            assisted_ejections: 0,
            absorbed: 0,
            escaped_mass: 0.0,
            held_ticks: 0,
            completed: false,
            events: vec![],
            commands: vec![],
            next_id: 1,
            next_event: 1,
        };
        {
            match world.config.mission {
                Some(2) => world.launch_mass(Kind::Giant, 1000.0 * EARTH, 2.5, 0.0, 0.9),
                Some(4) => world.launch_mass(
                    Kind::Rocky,
                    EARTH,
                    1.1 * libm::pow(world.config.star_mass, 1.75),
                    0.0,
                    1.0,
                ),
                Some(5) => world.launch_mass(Kind::Giant, 318.0 * EARTH, 3.0, 0.0, 0.95),
                Some(6) => world.launch_mass(Kind::Giant, 1000.0 * EARTH, 2.0, 0.0, 1.0),
                Some(7) => world.launch_mass(Kind::Giant, 318.0 * EARTH, 3.0, 0.0, 1.0),
                _ => {}
            }
            world.spent = 0.0;
        }
        Ok(world)
    }
    pub(crate) fn random(&mut self) -> f64 {
        rng::xorshift(&mut self.rng)
    }
    pub(crate) fn emit(&mut self, kind: EventKind, body: u32, text: String) {
        if self.events.len() == 24 {
            self.events.remove(0);
        }
        self.events.push(Event {
            id: self.next_event,
            tick: self.tick,
            kind,
            body,
            text,
            impact: None,
            position: self.bodies.iter().find(|b| b.id == body).map(|b| b.pos),
        });
        self.next_event += 1;
    }
}
