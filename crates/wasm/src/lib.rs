use celestial_sim::{Body, Command, Config, Event, Orbit, Replay, Status, World, MISSIONS};
use serde::Serialize;

#[derive(Serialize)]
struct Snapshot<'a> {
    rules_version: u32,
    burns_available: bool,
    mission_definition: Option<celestial_sim::Mission>,
    resonances: &'a [celestial_sim::resonance::Resonance],
    bodies: &'a [Body],
    status: Status,
    events: &'a [Event],
    tick: u64,
    config: &'a Config,
    orbits: Vec<(u32, Orbit)>,
    moon_orbits: Vec<(u32, Orbit)>,
}
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Simulation {
    world: World,
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
        serde_json::to_string(&Snapshot {
            rules_version: self.world.rules_version,
            burns_available: self.world.burns_available(),
            mission_definition: self.world.mission(),
            resonances: &self.world.resonances,
            bodies: &self.world.bodies,
            status: self.world.status(),
            events: &self.world.events,
            tick: self.world.tick,
            config: &self.world.config,
            moon_orbits: self
                .world
                .bodies
                .iter()
                .filter_map(|b| self.world.moon_orbit(b).map(|o| (b.id, o)))
                .collect(),
            orbits: self
                .world
                .bodies
                .iter()
                .skip(1)
                .map(|body| (body.id, self.world.orbit(body)))
                .collect(),
        })
        .expect("finite snapshot")
    }
    pub fn flags(&self) -> u8 {
        u8::from(self.world.completed) | (u8::from(self.world.exhausted()) << 1)
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
        Ok(())
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
