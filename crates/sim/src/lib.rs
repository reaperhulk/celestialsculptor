//! Deterministic orbital game rules. No clock, browser, GPU, or operating-system RNG.
use serde::{Deserialize, Serialize};
use std::f64::consts::TAU;
pub mod assessment;
pub mod balances;
pub mod benchmark;
pub mod collisions;
mod contact_search;
pub mod generation;
pub mod generator;
mod gravity;
#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
mod gravity_simd;
mod gravity_tree;
pub mod history;
pub mod replay;
pub mod resonance;
pub mod satellites;
pub mod scenarios;
pub mod sweep;

pub const G: f64 = 39.478_417_604_357_43; // AU, solar masses, years
pub const EARTH: f64 = 3.003e-6;
pub const DT: f64 = 1.0 / 512.0;
pub const MAX_BODIES: usize = 8192;
pub const LEGACY_MAX_BODIES: usize = 64;
pub const SOFTENING: f64 = 0.002;
pub const SAVE_VERSION: u32 = 6;
pub const MAX_TICKS: u64 = 512 * 600;
pub const LEGACY_WORK_LIMIT: u64 = 20_000_000;

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
    fn radius_for(self, mass: f64, version: u32) -> f64 {
        if version < 3 {
            return self.radius(mass)
                * if version >= 2 && self != Self::Star {
                    2.0 / 9.0
                } else {
                    1.0
                };
        }
        if self == Self::Star {
            0.055 * libm::cbrt(mass)
        } else {
            0.002 * libm::cbrt(mass / EARTH)
        }
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

/// Conserved constituent masses; display type is derived from these after a merger.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct Material {
    pub rock: f64,
    pub ice: f64,
    pub gas: f64,
}
impl Material {
    fn new(kind: Kind, mass: f64) -> Self {
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
    fn plus(self, other: Self) -> Self {
        Self {
            rock: self.rock + other.rock,
            ice: self.ice + other.ice,
            gas: self.gas + other.gas,
        }
    }
    fn kind(self, mass: f64) -> Kind {
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
    SeedSwarm {
        count: u32,
        disorder: f64,
    },
    GenerateSystem {
        style: generator::SystemStyle,
        count: u32,
        chaos: f64,
    },
    Generate {
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
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Event {
    pub id: u32,
    pub tick: u64,
    pub kind: String,
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
    pub rules_version: u32,
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

#[derive(Clone, Copy, Debug, Serialize)]
pub struct Mission {
    pub name: &'static str,
    pub brief: &'static str,
    pub hint: &'static str,
    pub budget: f64,
    pub hold_years: f64,
    pub unlock: &'static str,
}
pub const LEGACY_MISSIONS: [Mission; 10] = [
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
/// The first three lessons introduce orbits; the next five form a physical
/// formation chapter. The final challenges combine the unlocked mechanics.
pub const MISSIONS: [Mission;10] = [
 Mission {name:"First light",brief:"Keep a planet in a calm orbit for 2 years.",hint:"Orbital speed balances the star's pull. Start near circular speed and observe the blue orbit outline.",budget:8.0,hold_years:2.0,unlock:"Ice worlds"},
 Mission {name:"A place for life",brief:"Keep a world entirely inside the habitable band for 3 years.",hint:"Both the closest and farthest point must fit. Adjust speed as well as distance.",budget:12.0,hold_years:3.0,unlock:"Stellar mass control"},
 Mission {name:"A powerful neighbor",brief:"Keep 3 small worlds calm for 8 years beside the existing giant.",hint:"The giant bends nearby paths. Compare its pull in the inspector and leave room around its whole orbit.",budget:10.0,hold_years:8.0,unlock:"Formation chapter"},
 Mission {name:"From dust to worlds",brief:"Form 2 calm planets from debris and keep them for 4 years. Only debris can be placed.",hint:"A narrow disk makes encounters likely. Too much speed disorder can destroy the calm orbits you need.",budget:8.0,hold_years:4.0,unlock:"Garden formation"},
 Mission {name:"A garden from dust",brief:"Form a calm debris-born world while preserving the original garden for 6 years.",hint:"The original garden is World 1. Form another world without swallowing or disturbing it.",budget:8.0,hold_years:6.0,unlock:"Giant sculpting"},
 Mission {name:"The giant's nursery",brief:"Form 2 calm worlds from debris inside the giant's orbit; keep them for 8 years.",hint:"The outer giant perturbs the nursery. Disk width and disorder decide which fragments collide and which survive.",budget:10.0,hold_years:8.0,unlock:"Gravity assists"},
 Mission {name:"Borrowed momentum",brief:"Use the giant to eject a world that began on a bound orbit. Launches are capped at 135%; burns are disabled.",hint:"A close flyby can borrow the giant's orbital momentum. Launch just inside its orbit, trailing it, and compare nearby starting angles.",budget:8.0,hold_years:0.0,unlock:"Moon creation"},
 Mission {name:"A family of moons",brief:"Keep 2 moons bound to the existing giant for 10 years.",hint:"Select World 1 and create moons. Space their orbits apart; compare prograde and retrograde motion.",budget:2.0,hold_years:10.0,unlock:"Resonance observatory"},
 Mission {name:"Celestial clockwork",brief:"Observe a bounded resonant angle between two worlds, then hold it for 3 years.",hint:"Try two massive worlds with periods near 2:1. A near ratio alone is insufficient: the resonant angle must swing back and forth across many orbits.",budget:1000.0,hold_years:3.0,unlock:"System synthesis"},
 Mission {name:"A system of your own",brief:"Keep 2 debris-born calm worlds, a potential garden, and a bound moon together for 10 years.",hint:"Combine what you learned: accretion, orbital spacing, a gentle garden and a protected satellite orbit.",budget:1000.0,hold_years:10.0,unlock:"Master sculptor"},
];

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
    pub fn new(config: Config) -> Result<Self, String> {
        Self::with_rules(config, SAVE_VERSION)
    }
    fn with_rules(config: Config, rules_version: u32) -> Result<Self, String> {
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
            radius: Kind::Star.radius_for(config.star_mass, rules_version),
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
            rules_version,
            history: history::History::default(),
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
        if rules_version >= 3 {
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
    fn random(&mut self) -> f64 {
        let mut x = self.rng;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.rng = x;
        x as f64 / u32::MAX as f64
    }
    pub fn max_bodies(&self) -> usize {
        if self.rules_version >= 6 && self.config.mission.is_none() {
            MAX_BODIES
        } else {
            LEGACY_MAX_BODIES
        }
    }
    pub fn budget(&self) -> f64 {
        self.mission().map_or(10_000.0, |m| m.budget)
    }
    pub fn mission(&self) -> Option<Mission> {
        self.config.mission.map(|m| {
            if self.rules_version < 3 {
                LEGACY_MISSIONS[m]
            } else {
                MISSIONS[m]
            }
        })
    }
    pub fn allowed(&self, kind: Kind) -> bool {
        if self.rules_version >= 3 {
            if let Some(m) = self.config.mission {
                return match m {
                    3..=5 => kind == Kind::Dust,
                    6 => matches!(kind, Kind::Rocky | Kind::Ice),
                    7 => false,
                    8 | 9 => kind != Kind::Star,
                    _ => {
                        kind != Kind::Star && (kind == Kind::Rocky || (m >= 1 && kind == Kind::Ice))
                    }
                };
            }
        }

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
            Command::SeedSwarm { count, disorder } => {
                if self.rules_version < 6
                    || self.config.mission.is_some()
                    || !(4..MAX_BODIES as u32).contains(&count)
                    || self.bodies.len() + count as usize > self.max_bodies()
                    || !disorder.is_finite()
                    || !(0.0..=1.0).contains(&disorder)
                    || self.spent + 16.0 > self.budget() + 1e-8
                {
                    return Err("Choose 4–8191 swarm particles in a new sandbox, with disorder from 0 to 100%".into());
                }
                // Fixed total mass as resolution increases; every particle both feels
                // and sources gravity, with volume-derived physical contact radii.
                for i in 0..count {
                    let radius = 0.8 + 4.4 * self.random().sqrt();
                    let angle =
                        (i as f64 * 2.399_963_229_728_653 + self.random() * 0.1).rem_euclid(TAU);
                    let speed = 1.0 + (self.random() - 0.5) * disorder * 0.3;
                    self.launch_mass(
                        Kind::Dust,
                        16.0 * EARTH / f64::from(count),
                        radius,
                        angle,
                        speed,
                    );
                }
            }

            Command::Generate {
                style,
                count,
                chaos,
            }
            | Command::GenerateSystem {
                style,
                count,
                chaos,
            } => {
                let modern = matches!(command, Command::GenerateSystem { .. });
                if style == generator::SystemStyle::Swarm && self.rules_version < 6 {
                    return Err("Swarm generation requires current simulation rules".into());
                }
                if self.rules_version < 3
                    || modern && self.rules_version < 4
                    || self.config.mission.is_some()
                    || self.bodies.len() != 1
                    || self.tick != 0
                {
                    return Err("Generate a random system from an empty sandbox".into());
                }
                let commands = if modern {
                    generation::commands(
                        self.config.seed,
                        style,
                        count,
                        chaos,
                        self.config.star_mass,
                    )?
                } else {
                    generator::commands(self.config.seed, style, count, chaos)?
                };
                let mut generated = self.clone();
                let previous = generated.commands.len();
                for command in commands {
                    generated.apply(command)?;
                }
                generated.commands.truncate(previous);
                *self = generated;
            }

            Command::Migration { id, timescale } => {
                if self.rules_version < 3
                    || self.config.mission.is_some()
                    || !timescale.is_finite()
                    || (timescale != 0.0 && !(20.0..=2000.0).contains(&timescale))
                {
                    return Err("Disk migration is a sandbox tool: use 20–2000 years, or zero to turn it off".into());
                }
                let body = self
                    .bodies
                    .iter_mut()
                    .find(|b| b.id == id && id != 0 && b.parent.is_none())
                    .ok_or("Select a planet for disk migration")?;
                body.migration_rate = if timescale == 0.0 {
                    0.0
                } else {
                    1.0 / timescale
                };
                self.emit("migration",id,if timescale==0.0{"Disk migration stopped".into()}else{format!("Disk torque: World {id} migrates inward on a {timescale:.0}-year timescale")});
            }

            Command::LaunchMoon {
                parent,
                kind,
                mass,
                distance,
                angle,
                speed,
            } => {
                if self.rules_version < 2 || self.config.mission.is_some_and(|m| m < 4) {
                    return Err("Moon creation is available with advanced orbital tools".into());
                }
                let host = self
                    .bodies
                    .iter()
                    .find(|b| b.id == parent && b.id != 0 && b.parent.is_none())
                    .cloned()
                    .ok_or("Select a planet to host a moon")?;
                let moon_mass = mass * EARTH;
                let min = 1.3 * (host.radius + self.contact_radius(kind, moon_mass));
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
                    return Err(format!("Choose a moon below 10% of its planet's mass, at {min:.4}–{max:.4} AU, and 20–140% orbital speed"));
                }
                if self.bodies.len() >= self.max_bodies()
                    || self.spent + mass > self.budget() + 1e-8
                {
                    return Err("Not enough matter or body capacity for a moon".into());
                }
                let d = self.direction(angle);
                let soft = self.softening();
                let v = (G * (host.mass + moon_mass) * distance * distance
                    / self.pow(distance * distance + soft * soft, 1.5))
                .sqrt()
                    * speed;
                self.launch_mass(kind, moon_mass, 1.0, angle, 1.0);
                let moon = self.bodies.last_mut().expect("moon just created");
                moon.pos = host.pos.plus(d.scale(distance));
                moon.vel = host.vel.plus(V2::new(-d.y, d.x).scale(v));
                moon.parent = Some(parent);
                moon.origin_parent = Some(parent);
                self.emit(
                    "placed",
                    self.next_id - 1,
                    format!(
                        "Moon around World {parent}: {mass:.3} Earth masses at {distance:.4} AU"
                    ),
                );
            }
            Command::Spin { id, rate } => {
                if self.rules_version < 2 || !rate.is_finite() || rate.abs() > TAU * 1000.0 {
                    return Err("Choose a rotation rate up to 1000 turns per year".into());
                }
                let b = self
                    .bodies
                    .iter_mut()
                    .find(|b| b.id == id && id != 0)
                    .ok_or("Select a world to rotate")?;
                b.spin = 0.4 * b.mass * b.radius * b.radius * rate;
                self.emit(
                    "spin",
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
            }

            Command::LaunchMass {
                kind,
                mass,
                radius,
                angle,
                speed,
            } => {
                if self.rules_version < 2 {
                    return Err("Custom masses need a new experiment".into());
                }
                let (min, max) = kind.mass_range();
                if !mass.is_finite() || !(min..=max).contains(&mass) {
                    return Err(format!(
                        "Choose {min}–{max} Earth masses for this world type"
                    ));
                }
                self.validate_launch(kind, radius, angle, speed, mass)?;
                self.launch_mass(kind, mass * EARTH, radius, angle, speed);
                self.emit(
                    "placed",
                    self.next_id - 1,
                    format!(
                        "Placed {mass:.2} Earth masses at {radius:.2} AU and {:.0}% orbital speed",
                        speed * 100.0
                    ),
                );
            }
            Command::Nudge {
                id,
                tangential,
                radial,
            } => {
                if self
                    .config
                    .mission
                    .is_some_and(|m| m < 4 || (self.rules_version >= 3 && (m == 6 || m == 7)))
                {
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
                let star = if self.rules_version >= 4 {
                    self.bodies[index]
                        .parent
                        .and_then(|id| self.bodies.iter().find(|b| b.id == id))
                        .filter(|_| self.moon_orbit(&self.bodies[index]).is_some())
                        .unwrap_or(&self.bodies[0])
                } else {
                    &self.bodies[0]
                };
                let b = &self.bodies[index];
                let r = b.pos.minus(star.pos);
                let v = b.vel.minus(star.vel);
                let distance = r.norm();
                let direction = r.scale(1.0 / distance);
                let handedness = if r.cross(v) < 0.0 { -1.0 } else { 1.0 };
                let tangent = V2::new(-direction.y, direction.x).scale(handedness);
                let circular = if self.rules_version >= 4 && star.id != 0 {
                    (G * (star.mass + b.mass) * distance * distance
                        / self.pow(distance * distance + self.softening().powi(2), 1.5))
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
                if self.bodies.len() + count as usize > self.max_bodies()
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
                self.validate_launch(kind, radius, angle, speed, kind.cost())?;
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
                    || self.bodies.len() + 12 > self.max_bodies()
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
        if self.rules_version < 4 || !matches!(command, Command::Spin { .. }) {
            self.held_ticks = 0;
            self.resonances.clear();
        }
        if self.rules_version >= 4 {
            self.refresh_satellites();
        }
        self.commands.push(RecordedCommand {
            tick: self.tick,
            command,
        });
        self.observe_history(true);
        Ok(())
    }
    fn validate_launch(
        &self,
        kind: Kind,
        radius: f64,
        angle: f64,
        speed: f64,
        cost: f64,
    ) -> Result<(), String> {
        if !self.allowed(kind) {
            return Err("That body is not unlocked in this challenge".into());
        }
        if self.rules_version >= 3 && self.config.mission == Some(6) && speed.abs() > 1.35 {
            return Err("This challenge caps launch speed at 135%; use the giant's gravity".into());
        }
        if !radius.is_finite()
            || !(0.25..=6.0).contains(&radius)
            || !angle.is_finite()
            || angle.abs() > TAU * 100.0
            || !speed.is_finite()
            || !(if self.rules_version == 1 { 0.0 } else { -2.2 }..=2.2).contains(&speed)
        {
            return Err("Choose a radius of 0.25–6 AU and speed of 0–220%".into());
        }
        if self.rules_version >= 3 && self.config.mission.is_some_and(|m| (3..=5).contains(&m)) {
            let position = self.bodies[0].pos.plus(self.direction(angle).scale(radius));
            let contact = self.contact_radius(kind, cost * EARTH);
            if self
                .bodies
                .iter()
                .any(|b| b.pos.minus(position).norm() < 5.0 * (b.radius + contact))
            {
                return Err("Leave room for fragments to meet through orbital motion; overlapping placements do not count as formation".into());
            }
        }
        if self.bodies.len() >= self.max_bodies() || self.spent + cost > self.budget() + 1e-8 {
            return Err("Not enough matter or body capacity".into());
        }
        Ok(())
    }
    fn launch(&mut self, kind: Kind, radius: f64, angle: f64, speed: f64) {
        self.launch_mass(kind, kind.mass(), radius, angle, speed);
    }
    fn launch_mass(&mut self, kind: Kind, mass: f64, radius: f64, angle: f64, speed: f64) {
        let star = &self.bodies[0];
        let direction = self.direction(angle);
        let v = (G * (star.mass + mass) / radius).sqrt() * speed;
        let body = Body {
            id: self.next_id,
            kind,
            mass,
            radius: self.contact_radius(kind, mass),
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
    fn direction(&self, angle: f64) -> V2 {
        if self.rules_version >= 3 {
            V2::new(libm::cos(angle), libm::sin(angle))
        } else {
            V2::new(angle.cos(), angle.sin())
        }
    }
    fn cbrt(&self, value: f64) -> f64 {
        if self.rules_version >= 3 {
            libm::cbrt(value)
        } else {
            value.cbrt()
        }
    }
    fn pow(&self, value: f64, power: f64) -> f64 {
        if self.rules_version >= 3 {
            libm::pow(value, power)
        } else {
            value.powf(power)
        }
    }
    fn atan2(&self, y: f64, x: f64) -> f64 {
        if self.rules_version >= 3 {
            libm::atan2(y, x)
        } else {
            y.atan2(x)
        }
    }
    fn softening(&self) -> f64 {
        if self.rules_version == 1 {
            SOFTENING
        } else {
            0.0001
        }
    }
    fn contact_radius(&self, kind: Kind, mass: f64) -> f64 {
        kind.radius_for(mass, self.rules_version)
    }
    pub fn hill_radius(&self, body: &Body) -> f64 {
        self.orbit(body).periapsis * self.cbrt(body.mass / (3.0 * self.bodies[0].mass))
    }
    pub fn moon_orbit(&self, body: &Body) -> Option<Orbit> {
        let id = body.parent?;
        let parent = self.bodies.iter().find(|b| b.id == id)?;
        let mut orbit = self.orbit_around(body, parent);
        if self.rules_version >= 4 {
            orbit.calm = orbit.bound
                && orbit.eccentricity < 0.25
                && orbit.periapsis > body.radius + parent.radius
                && orbit.apoapsis < self.hill_radius(parent) * 0.7;
            orbit.habitable = orbit.calm && self.orbit(body).habitable;
        }
        (orbit.bound && orbit.distance < self.hill_radius(parent)).then_some(orbit)
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
            impact: None,
            position: if self.rules_version >= 3 {
                self.bodies.iter().find(|b| b.id == body).map(|b| b.pos)
            } else {
                None
            },
        });
        self.next_event += 1;
    }
    /// Explicit force probe for headless/GPU comparisons; physical state is unchanged.
    pub fn sample_forces(&mut self, exact: bool) -> &[V2] {
        self.forces.x.clear(); // Benchmark actual calculation, including staging/build.
        self.update_forces(!exact);
        &self.forces.output
    }
    fn update_forces(&mut self, tree_allowed: bool) {
        self.forces.update(
            &self.bodies,
            self.softening().powi(2),
            tree_allowed && self.rules_version >= 6,
        );
    }
    /// Each tick always runs four kick-drift-kick substeps. Speed never changes dt.
    pub fn step(&mut self) {
        self.integrate_tick(4);
    }
    fn integrate_tick(&mut self, substeps: u32) {
        self.integrate_tick_with_solver(substeps, true);
    }
    fn integrate_tick_with_solver(&mut self, substeps: u32, tree_allowed: bool) {
        if self.exhausted() {
            return;
        }
        self.work_units += self.tick_work();
        let h = DT / f64::from(substeps);
        self.merge_contacts(0.0);
        self.update_forces(tree_allowed);
        for _ in 0..substeps {
            for (i, b) in self.bodies.iter_mut().enumerate() {
                b.vel = b.vel.plus(self.forces.output[i].scale(h / 2.0));
                b.pos = b.pos.plus(b.vel.scale(h));
                if self.rules_version >= 2 && b.id != 0 {
                    b.rotation = (b.rotation + b.spin / (0.4 * b.mass * b.radius * b.radius) * h)
                        .rem_euclid(TAU);
                }
            }
            self.merge_contacts(h);
            self.update_forces(tree_allowed);
            for (i, b) in self.bodies.iter_mut().enumerate() {
                b.vel = b.vel.plus(self.forces.output[i].scale(h / 2.0));
            }
            let star = self.bodies[0].clone();
            for body in self.bodies.iter_mut().skip(1) {
                if body.migration_rate == 0.0 {
                    continue;
                }
                let before = body.vel;
                let r = body.pos.minus(star.pos);
                let radial = r.scale(1.0 / r.norm());
                let v = before.minus(star.vel);
                let projected = v.x * radial.x + v.y * radial.y;
                body.vel = star
                    .vel
                    .plus(v.scale(libm::exp(-h * body.migration_rate / 2.0)))
                    .minus(
                        radial
                            .scale(projected * (1.0 - libm::exp(-h * body.migration_rate * 10.0))),
                    );
                self.disk_energy += 0.5 * body.mass * (before.norm2() - body.vel.norm2());
                let exchange = before.minus(body.vel).scale(body.mass);
                self.disk_momentum = self.disk_momentum.plus(exchange);
                self.disk_angular_momentum += body.pos.cross(exchange);
            }
        }
        self.tick += 1;
        if self.rules_version >= 4 && self.tick.is_multiple_of(8) {
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
                    "escape",
                    b.id,
                    format!("World {} escaped into interstellar space", b.id),
                );
                if self.rules_version >= 3 {
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
                    "complete",
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
    fn merge_contacts(&mut self, sweep: f64) {
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
                        if self.rules_version >= 5 && self.resolve_solid_contact(i, j, sweep) {
                            if indexed {
                                self.contact_search.rebuild(&self.bodies, sweep);
                            }
                            j += 1;
                            continue;
                        }
                        let energy_before = (self.rules_version >= 5)
                            .then(|| self.affected_energy(&[self.bodies[i].id, self.bodies[j].id]));
                        let orbit_before = self
                            .moon_orbit(&self.bodies[i])
                            .unwrap_or_else(|| self.orbit(&self.bodies[i]));
                        let anchor = self.bodies[i]
                            .parent
                            .and_then(|id| self.bodies.iter().find(|b| b.id == id))
                            .unwrap_or(&self.bodies[0])
                            .pos;
                        let before = if self.rules_version >= 4 {
                            orbit_before.eccentricity
                        } else {
                            self.orbit(&self.bodies[i]).eccentricity
                        };
                        let b = self.bodies.remove(j);
                        let a = &mut self.bodies[i];
                        let mass = a.mass + b.mass;
                        let masses = [a.mass, b.mass];
                        let radius_before = a.radius;
                        let relative_speed = a.vel.minus(b.vel).norm();
                        let dissipated_energy =
                            0.5 * a.mass * b.mass / mass * relative_speed.powi(2);
                        a.migration_rate =
                            (a.migration_rate * a.mass + b.migration_rate * b.mass) / mass;
                        a.material = a.material.plus(b.material);
                        a.mergers += b.mergers + 1;
                        a.debris_origin &= b.debris_origin;
                        a.initially_bound &= b.initially_bound;
                        let angular = a.mass * a.pos.cross(a.vel)
                            + b.mass * b.pos.cross(b.vel)
                            + a.spin
                            + b.spin;
                        a.pos = a.pos.scale(a.mass / mass).plus(b.pos.scale(b.mass / mass));
                        a.vel = a.vel.scale(a.mass / mass).plus(b.vel.scale(b.mass / mass));
                        a.mass = mass;
                        a.spin = angular - mass * a.pos.cross(a.vel);
                        if self.rules_version == 1 {
                            if a.kind != Kind::Star && b.kind == Kind::Giant {
                                a.kind = Kind::Giant;
                            }
                            if a.kind == Kind::Dust && mass >= 0.5 * EARTH {
                                a.kind = Kind::Rocky;
                            }
                        } else if a.kind != Kind::Star {
                            a.kind = a.material.kind(mass);
                            if self.rules_version >= 3 && a.kind == Kind::Dust && !a.debris_origin {
                                a.kind = if a.material.ice / mass >= 0.35 {
                                    Kind::Ice
                                } else {
                                    Kind::Rocky
                                };
                            }
                        }
                        a.radius = a.kind.radius_for(mass, self.rules_version);
                        let id = a.id;
                        let position = a.pos;
                        let radius_after = a.radius;
                        if a.kind == Kind::Star {
                            self.absorbed += 1;
                            self.emit("absorb", b.id, format!("World {} fell into the star", b.id));
                            if self.rules_version >= 3 {
                                self.events
                                    .last_mut()
                                    .expect("just emitted absorption")
                                    .position = Some(position);
                            }
                        } else {
                            self.collisions += 1;
                            self.emit("collision", id, format!("Worlds {id} and {} merged", b.id));
                            if self.rules_version >= 2 {
                                let orbit_after = self
                                    .moon_orbit(&self.bodies[i])
                                    .unwrap_or_else(|| self.orbit(&self.bodies[i]));
                                let after = if self.rules_version >= 4 {
                                    orbit_after.eccentricity
                                } else {
                                    self.orbit(&self.bodies[i]).eccentricity
                                };
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
                                    orbit_before: (self.rules_version >= 4).then_some(orbit_before),
                                    orbit_after: (self.rules_version >= 4).then_some(orbit_after),
                                    anchor: (self.rules_version >= 4).then_some(anchor),
                                    outcome: (self.rules_version >= 5)
                                        .then_some(collisions::Outcome::Merge),
                                    remnants: if self.rules_version >= 5 {
                                        vec![id]
                                    } else {
                                        vec![]
                                    },
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
                        if let Some(before) = energy_before {
                            self.collision_energy += before - self.affected_energy(&[id]);
                        }
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
    pub fn zone(&self) -> (f64, f64) {
        let scale = self.pow(self.bodies[0].mass, 1.75);
        (0.85 * scale, 1.55 * scale)
    }
    pub fn orbit(&self, body: &Body) -> Orbit {
        self.orbit_around(body, &self.bodies[0])
    }
    fn orbit_around(&self, body: &Body, star: &Body) -> Orbit {
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
        let e_vector = r
            .scale(v.norm2() / mu - 1.0 / distance)
            .minus(v.scale((r.x * v.x + r.y * v.y) / mu));
        Orbit {
            periapsis_angle: if eccentricity > 1e-8 {
                self.atan2(e_vector.y, e_vector.x)
            } else {
                self.atan2(r.y, r.x)
            },
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
            grazes: self.grazes,
            disruptions: self.disruptions,
            ejections: self.ejections,
            assisted_ejections: self.assisted_ejections,
            absorbed: self.absorbed,
            available_slots: self.max_bodies().saturating_sub(self.bodies.len()),
            actions_remaining: 2048 - self.commands.len(),
            tools: [Kind::Rocky, Kind::Ice, Kind::Giant, Kind::Dust].map(|kind| ToolAvailability {
                kind,
                cost: kind.cost(),
                min_mass: kind.mass_range().0,
                max_mass: kind.mass_range().1,
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
            moons: 0,
            grown: 0,
            formed: 0,
            held_years: self.held_ticks as f64 * DT,
            progress: 0.0,
            condition: false,
            completed: self.completed,
            zone_inner: self.zone().0,
            zone_outer: self.zone().1,
        };
        for body in self.bodies.iter().skip(1) {
            let o = self.orbit(body);
            if self.moon_orbit(body).is_some() {
                s.moons += 1;
                continue;
            }
            s.grown += usize::from(body.mergers > 0 && o.calm);
            s.formed += usize::from(body.debris_origin && body.kind != Kind::Dust && o.calm);
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
            if self.rules_version >= 3 {
                let garden = self
                    .bodies
                    .iter()
                    .any(|b| b.id == 1 && b.mergers == 0 && self.orbit(b).habitable);
                let inner_formed = self
                    .bodies
                    .iter()
                    .filter(|b| {
                        b.debris_origin
                            && b.kind != Kind::Dust
                            && self.orbit(b).calm
                            && self.bodies.iter().any(|g| {
                                g.kind == Kind::Giant
                                    && self.orbit(b).apoapsis < self.orbit(g).periapsis
                            })
                    })
                    .count();
                s.objectives = match m {
                    2 => [goal("Calm small worlds", s.calm - s.giants, 3), None, None],
                    3 => [goal("Calm worlds from debris", s.formed, 2), None, None],
                    4 => [
                        goal("Calm worlds from debris", s.formed, 1),
                        goal("Original garden preserved", usize::from(garden), 1),
                        None,
                    ],
                    5 => [
                        goal("Calm inner worlds from debris", inner_formed, 2),
                        goal("Giant survives", s.giants, 1),
                        None,
                    ],
                    6 => [
                        goal(
                            "Initially bound worlds ejected",
                            self.assisted_ejections as usize,
                            1,
                        ),
                        None,
                        None,
                    ],
                    7 => [goal("Bound moons", s.moons, 2), None, None],
                    8 => [
                        goal(
                            "Librating resonant pairs",
                            self.resonances.iter().filter(|r| r.librating).count(),
                            1,
                        ),
                        None,
                        None,
                    ],
                    9 => [
                        goal("Calm worlds from debris", s.formed, 2),
                        goal("Potential gardens", s.habitable, 1),
                        goal("Bound moons", s.moons, 1),
                    ],
                    _ => s.objectives,
                };
            }
            s.condition = s.objectives.iter().flatten().all(|g| g.current >= g.target);
            s.progress = if self.completed {
                1.0
            } else if self.mission().expect("mission exists").hold_years > 0.0 {
                (s.held_years / self.mission().expect("mission exists").hold_years).min(1.0)
            } else {
                f64::from(s.condition)
            };
        }
        s
    }
    /// Only pairs touching changed bodies can change during an instantaneous impact.
    /// Legacy saves retain the original full-sum rounding; rules 6 uses O(kN).
    fn affected_energy(&self, ids: &[u32]) -> f64 {
        if self.rules_version < 6 {
            return self.energy();
        }
        let changed: Vec<_> = self.bodies.iter().filter(|b| ids.contains(&b.id)).collect();
        let mut energy = changed
            .iter()
            .map(|b| 0.5 * b.mass * b.vel.norm2())
            .sum::<f64>();
        let soft2 = self.softening().powi(2);
        for (i, a) in changed.iter().enumerate() {
            for b in &self.bodies {
                if !ids.contains(&b.id) {
                    energy -= G * a.mass * b.mass / (a.pos.minus(b.pos).norm2() + soft2).sqrt();
                }
            }
            for b in changed.iter().skip(i + 1) {
                energy -= G * a.mass * b.mass / (a.pos.minus(b.pos).norm2() + soft2).sqrt();
            }
        }
        energy
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
                        + self.softening().powi(2))
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
            version: self.rules_version,
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
        self.tick >= MAX_TICKS
    }
    pub fn from_replay(replay: Replay) -> Result<Self, String> {
        let mut reconstruction = replay::Reconstruction::new(replay)?;
        while !reconstruction.advance(512)? {}
        reconstruction.finish()
    }
}
