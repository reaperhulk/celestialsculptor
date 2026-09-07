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
            bodies: &self.world.bodies,
            status,
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
    /// Large histories are requested explicitly, never copied with each display snapshot.
    pub fn observations(&self) -> String {
        serde_json::to_string(&self.world.history).expect("finite observations")
    }
    pub fn event_serial(&self) -> u32 {
        self.world
            .events
            .iter()
            .rev()
            .find(|e| {
                matches!(
                    e.kind.as_str(),
                    "collision" | "escape" | "absorb" | "satellite"
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
