use celestial_sim::{Body, Command, Config, Event, Orbit, Replay, Status, World, MISSIONS};
use serde::Serialize;

#[derive(Serialize)]
struct Snapshot<'a> {
    rules_version: u32,
    burns_available: bool,
    observation_stamp: (u64, usize, u32),
    assessment: celestial_sim::assessment::Assessment,
    mission_definition: Option<celestial_sim::Mission>,
    resonances: &'a [celestial_sim::resonance::Resonance],
    #[serde(skip_serializing_if = "Option::is_none")]
    bodies: Option<&'a [Body]>,
    status: Status,
    events: &'a [Event],
    tick: u64,
    config: &'a Config,
    orbits: Vec<(u32, Orbit)>,
    moon_orbits: Vec<(u32, Orbit)>,
}
use wasm_bindgen::prelude::*;

/// Build provenance for headless differential tests and performance reports.
#[wasm_bindgen]
pub fn gravity_backend() -> String {
    if cfg!(all(target_arch = "wasm32", target_feature = "simd128")) {
        "wasm-simd-f64x2".into()
    } else {
        "scalar-f64".into()
    }
}

#[wasm_bindgen]
pub struct Simulation {
    world: World,
    reconstruction: Option<celestial_sim::replay::Reconstruction>,
}

fn js_error(e: impl ToString) -> JsValue {
    JsValue::from_str(&e.to_string())
}

#[wasm_bindgen]
impl Simulation {
    #[wasm_bindgen(constructor)]
    pub fn new(config: &str) -> Result<Simulation, JsValue> {
        if config.len() > 1024 {
            return Err(js_error("Configuration exceeds 1 KB"));
        }
        let config: Config = serde_json::from_str(config).map_err(js_error)?;
        Ok(Self {
            world: World::new(config).map_err(js_error)?,
            reconstruction: None,
        })
    }
    pub fn command(&mut self, command: &str) -> Result<(), JsValue> {
        if command.len() > 2048 {
            return Err(js_error("Command exceeds 2 KB"));
        }
        let command: Command = serde_json::from_str(command).map_err(js_error)?;
        self.world.apply(command).map_err(js_error)
    }
    pub fn advance(&mut self, ticks: f64) -> Result<(), JsValue> {
        if !ticks.is_finite() || ticks.fract() != 0.0 || !(0.0..=512.0).contains(&ticks) {
            return Err(js_error("Use a whole number of ticks from 0 to 512"));
        }
        self.world.advance(ticks as u32);
        Ok(())
    }
    pub fn snapshot(&self) -> String {
        self.snapshot_selected(None)
    }
    pub fn compact_snapshot(&self, selected: u32) -> String {
        self.snapshot_selected(Some(selected))
    }
    /// Version 1 display wire format: twenty exact f64 values per body.
    pub fn body_frame(&self) -> Vec<f64> {
        self.world
            .bodies
            .iter()
            .flat_map(|b| {
                [
                    f64::from(b.id),
                    match b.kind {
                        celestial_sim::Kind::Star => 0.,
                        celestial_sim::Kind::Rocky => 1.,
                        celestial_sim::Kind::Ice => 2.,
                        celestial_sim::Kind::Giant => 3.,
                        celestial_sim::Kind::Dust => 4.,
                    },
                    b.mass,
                    b.radius,
                    b.pos.x,
                    b.pos.y,
                    b.vel.x,
                    b.vel.y,
                    b.spin,
                    b.material.rock,
                    b.material.ice,
                    b.material.gas,
                    b.birth_mass,
                    f64::from(b.initially_bound),
                    b.parent.map_or(-1., f64::from),
                    b.origin_parent.map_or(-1., f64::from),
                    b.rotation,
                    f64::from(b.mergers),
                    f64::from(b.debris_origin),
                    b.migration_rate,
                ]
            })
            .collect()
    }
    pub fn force_snapshot(&mut self, exact: bool) -> Vec<f64> {
        self.world
            .sample_forces(exact)
            .iter()
            .flat_map(|a| [a.x, a.y])
            .collect()
    }
    pub fn benchmark_gravity(&mut self, exact: bool, repeats: f64) -> Result<f64, JsValue> {
        if !repeats.is_finite() || repeats.fract() != 0. || !(1.0..=16.0).contains(&repeats) {
            return Err(js_error("Use 1–16 force samples"));
        }
        let mut checksum = 0.;
        for _ in 0..repeats as u32 {
            checksum += std::hint::black_box(self.world.sample_forces(exact))[0].x;
        }
        Ok(checksum)
    }
    pub fn body_count(&self) -> u32 {
        self.world.bodies.len() as u32
    }
    pub fn flags(&self) -> u8 {
        u8::from(self.world.completed) | (u8::from(self.world.exhausted()) << 1)
    }
    /// Large histories are requested explicitly, never copied with each display snapshot.
    pub fn balances(&self) -> String {
        serde_json::to_string(&self.world.balances()).expect("finite balances")
    }
    pub fn observations(&self) -> String {
        serde_json::to_string(&self.world.history).expect("finite observations")
    }
    pub fn observation_view(&self, body: u32, inner: u32, outer: u32) -> String {
        serde_json::to_string(&self.world.history.view(body, inner, outer)).expect("finite view")
    }
    pub fn event_serial(&self) -> u32 {
        self.world
            .events
            .iter()
            .rev()
            .find(|e| {
                matches!(
                    e.kind.as_str(),
                    "collision" | "graze" | "disruption" | "escape" | "absorb" | "satellite"
                )
            })
            .map_or(0, |e| e.id)
    }
    pub fn export_replay(&self) -> String {
        serde_json::to_string(&self.world.replay()).expect("finite replay")
    }
    pub fn import_replay(&mut self, input: &str) -> Result<(), JsValue> {
        if input.len() > 512_000 {
            return Err(js_error("Experiment file is too large"));
        }
        let replay: Replay = serde_json::from_str(input).map_err(js_error)?;
        let world = World::from_replay(replay).map_err(js_error)?;
        self.world = world;
        self.reconstruction = None;
        Ok(())
    }
    /// Rebuild off to the side; no partial or untrusted state replaces the live world.
    pub fn begin_import(&mut self, input: &str) -> Result<(), JsValue> {
        if input.len() > 512_000 {
            return Err(js_error("Experiment file is too large"));
        }
        let replay: Replay = serde_json::from_str(input).map_err(js_error)?;
        self.reconstruction =
            Some(celestial_sim::replay::Reconstruction::new(replay).map_err(js_error)?);
        Ok(())
    }
    pub fn advance_import(&mut self, ticks: f64) -> Result<bool, JsValue> {
        if !ticks.is_finite() || ticks.fract() != 0.0 || !(1.0..=512.0).contains(&ticks) {
            return Err(js_error("Use a whole number of ticks from 1 to 512"));
        }
        let pending = self
            .reconstruction
            .as_mut()
            .ok_or_else(|| js_error("No reconstruction in progress"))?;
        let done = pending.advance(ticks as u32).map_err(js_error)?;
        if done {
            self.world = self
                .reconstruction
                .take()
                .expect("active reconstruction")
                .finish()
                .map_err(js_error)?;
        }
        Ok(done)
    }
    pub fn import_tick(&self) -> f64 {
        self.reconstruction
            .as_ref()
            .map_or(self.world.tick, |r| r.tick()) as f64
    }
    pub fn rewind(&mut self) -> Result<(), JsValue> {
        self.world.rewind().map_err(js_error)
    }
    pub fn undo(&mut self) -> Result<(), JsValue> {
        self.world.undo().map_err(js_error)
    }
}

#[wasm_bindgen]
pub fn missions() -> String {
    serde_json::to_string(&MISSIONS).expect("mission data")
}

/// Isolated force-kernel benchmark; it cannot modify a live simulation.
#[cfg(feature = "benchmarks")]
#[wasm_bindgen]
pub struct GravityProbe {
    inner: celestial_sim::benchmark::ForceProbe,
}
#[cfg(feature = "benchmarks")]
#[wasm_bindgen]
impl GravityProbe {
    #[wasm_bindgen(constructor)]
    pub fn new(
        count: u32,
        seed: u32,
        cluster: bool,
        star_mass: f64,
    ) -> Result<GravityProbe, JsValue> {
        if !(2..=8192).contains(&count)
            || !star_mass.is_finite()
            || !(0.0..=1.5).contains(&star_mass)
        {
            return Err(JsValue::from_str("Invalid gravity benchmark configuration"));
        }
        Ok(Self {
            inner: celestial_sim::benchmark::ForceProbe::new(
                count as usize,
                seed,
                cluster,
                star_mass,
            ),
        })
    }
    pub fn run(&mut self, theta: f64, repeats: u32) -> Result<f64, JsValue> {
        if !theta.is_finite() || !(-1.0..=0.7).contains(&theta) || !(1..=128).contains(&repeats) {
            return Err(JsValue::from_str("Invalid gravity benchmark workload"));
        }
        Ok(self.inner.run(theta, repeats))
    }
    pub fn forces(&self) -> Vec<f64> {
        self.inner.output.iter().flat_map(|a| [a.x, a.y]).collect()
    }
    pub fn run_config(&mut self, theta: f64, leaf_size: u32, repeats: u32) -> Result<f64, JsValue> {
        if !theta.is_finite()
            || !(-1.0..=0.7).contains(&theta)
            || ![2, 4, 8, 16, 32].contains(&leaf_size)
            || !(1..=128).contains(&repeats)
        {
            return Err(JsValue::from_str("Invalid gravity benchmark workload"));
        }
        Ok(self.inner.run_config(theta, leaf_size as usize, repeats))
    }
    pub fn particles(&self) -> Vec<f64> {
        (0..self.inner.x.len())
            .flat_map(|i| [self.inner.x[i], self.inner.y[i], self.inner.mass[i]])
            .collect()
    }
    pub fn statistics(&self) -> String {
        self.inner.statistics().to_string()
    }
}

impl Simulation {
    fn snapshot_selected(&self, selected: Option<u32>) -> String {
        let host = selected
            .and_then(|id| self.world.bodies.iter().find(|b| b.id == id))
            .and_then(|b| b.parent);
        let included = |b: &&Body| {
            selected.is_none_or(|id| b.id == id || Some(b.id) == host || b.parent == Some(id))
        };
        let limit = if selected.is_some() { 65 } else { usize::MAX };
        let status = self.world.status();
        let assessment = self.world.assessment(&status);
        serde_json::to_string(&Snapshot {
            assessment,
            rules_version: self.world.rules_version,
            burns_available: self.world.burns_available(),
            observation_stamp: (
                self.world.history.frames.last().map_or(0, |f| f.tick),
                self.world.commands.len(),
                self.world.history.events.last().map_or(0, |e| e.id),
            ),
            mission_definition: self.world.mission(),
            resonances: &self.world.resonances,
            bodies: selected.is_none().then_some(self.world.bodies.as_slice()),
            status,
            events: &self.world.events,
            tick: self.world.tick,
            config: &self.world.config,
            moon_orbits: self
                .world
                .bodies
                .iter()
                .filter(included)
                .take(limit)
                .filter_map(|b| self.world.moon_orbit(b).map(|o| (b.id, o)))
                .collect(),
            orbits: self
                .world
                .bodies
                .iter()
                .skip(1)
                .filter(included)
                .take(limit)
                .map(|body| (body.id, self.world.orbit(body)))
                .collect(),
        })
        .expect("finite snapshot")
    }
}
