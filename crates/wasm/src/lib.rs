use celestial_sim::{Command, Config, Replay, World, MISSIONS};
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
        let config: Config = serde_json::from_str(config).map_err(js_error)?;
        Ok(Self {
            world: World::new(config).map_err(js_error)?,
        })
    }
    pub fn command(&mut self, command: &str) -> Result<(), JsValue> {
        let command: Command = serde_json::from_str(command).map_err(js_error)?;
        self.world.apply(command).map_err(js_error)
    }
    pub fn advance(&mut self, ticks: u32) -> Result<(), JsValue> {
        if ticks > 512 {
            return Err(js_error("A batch is limited to 512 ticks"));
        }
        self.world.advance(ticks);
        Ok(())
    }
    pub fn snapshot(&self) -> String {
        serde_json::json!({ "bodies": self.world.bodies, "status": self.world.status(), "events": self.world.events, "tick": self.world.tick, "config": self.world.config, "orbits": self.world.bodies.iter().skip(1).map(|b| (b.id, self.world.orbit(b))).collect::<Vec<_>>() }).to_string()
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
        let mut replay = self.world.replay();
        for command in &mut replay.commands {
            command.tick = 0;
        }
        replay.end_tick = 0;
        self.world = World::from_replay(replay).map_err(js_error)?;
        Ok(())
    }
}

#[wasm_bindgen]
pub fn missions() -> String {
    serde_json::to_string(&MISSIONS).expect("mission data")
}
