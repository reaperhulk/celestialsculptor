use crate::{generator::SystemStyle, Command, Config, World, DT};
use serde_json::{json, Value};
fn run_case(
    style: SystemStyle,
    seed: u32,
    star_mass: f64,
    count: u32,
    chaos: f64,
    set: &str,
) -> Result<Value, String> {
    let mut world = World::new(Config {
        seed,
        mission: None,
        star_mass,
    })?;
    world.apply(Command::GenerateSystem {
        style,
        count,
        chaos,
    })?;
    let mass = world.bodies.iter().map(|b| b.mass).sum::<f64>();
    let momentum = world.momentum();
    let years = if style == SystemStyle::Resonance {
        120
    } else {
        24
    };
    let mut first = None;
    while world.tick < 512 * years && !world.exhausted() {
        world.advance(256);
        if first.is_none() {
            first = world
                .history
                .events
                .iter()
                .find(|e| {
                    matches!(
                        e.kind.as_str(),
                        "collision" | "graze" | "disruption" | "escape" | "absorb" | "satellite"
                    )
                })
                .map(|e| e.tick as f64 * DT);
        }
    }
    let status = world.status();
    let finite = world.energy().is_finite()
        && world
            .bodies
            .iter()
            .all(|b| b.pos.norm2().is_finite() && b.vel.norm2().is_finite() && b.spin.is_finite());
    let mass_error =
        (world.bodies.iter().map(|b| b.mass).sum::<f64>() + world.escaped_mass - mass).abs();
    let momentum_error = world
        .momentum()
        .plus(world.disk_momentum)
        .minus(momentum)
        .norm();
    let passed = finite
        && mass_error < 1e-10
        && (world.ejections > 0 || momentum_error < 1e-10)
        && world.history.frames.len() <= 256;
    Ok(
        json!({"style":style,"set":set,"seed":seed,"star_mass":star_mass,"count":count,"chaos":chaos,"years":years,"observed_years":status.years,"first_event_years":first,"bodies":world.bodies.len(),"calm":status.calm,"formed":status.formed,"moons":status.moons,"collisions":world.collisions,"ejections":world.ejections,"librating":world.resonances.iter().any(|r|r.librating),"finite":finite,"mass_error":mass_error,"momentum_error":momentum_error,"passed":passed,"replay":world.replay(),"final_bodies":world.bodies}),
    )
}
pub fn run() -> Result<Value, String> {
    let mut cases = vec![];
    for style in [
        SystemStyle::Calm,
        SystemStyle::Nursery,
        SystemStyle::Chaos,
        SystemStyle::Moons,
        SystemStyle::Resonance,
    ] {
        for seed in 1..=8 {
            cases.push(run_case(style, seed, 1., 12, 0.6, "tuning")?);
        }
        for seed in [101, 373, 719, 2026] {
            cases.push(run_case(style, seed, 1., 12, 0.6, "regression")?);
        }
        for seed in [31337, 271828, 314159, 987654] {
            cases.push(run_case(style, seed, 1., 12, 0.6, "validation")?);
        }
        for star_mass in [0.6, 1.5] {
            for count in [4, 32] {
                for chaos in [0., 1.] {
                    cases.push(run_case(style, 719, star_mass, count, chaos, "boundary")?);
                }
            }
        }
    }
    let mut expectations = vec![];
    for set in ["tuning", "regression", "validation"] {
        for (style, metric, minimum, threshold) in [
            ("calm", "calm", 10., 1.),
            ("nursery", "formed", 1., 0.75),
            ("chaos", "ejections", 1., 0.5),
            ("moons", "moons", 2., 1.),
            ("resonance", "librating", 1., 0.5),
        ] {
            let population: Vec<_> = cases
                .iter()
                .filter(|c| c["style"] == style && c["set"] == set)
                .collect();
            let hits = population
                .iter()
                .filter(|c| {
                    if metric == "librating" {
                        c[metric] == true
                    } else {
                        c[metric].as_f64().unwrap_or(0.) >= minimum
                    }
                })
                .count();
            let ratio = hits as f64 / population.len() as f64;
            expectations.push(json!({"style":style,"set":set,"metric":metric,"hits":hits,"cases":population.len(),"minimum_fraction":threshold,"passed":ratio>=threshold}));
        }
    }
    let passed = cases.iter().all(|c| c["passed"] == true)
        && expectations.iter().all(|e| e["passed"] == true);
    Ok(json!({"years":24,"passed":passed,"expectations":expectations,"cases":cases}))
}
