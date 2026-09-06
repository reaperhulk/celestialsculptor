use celestial_sim::{scenarios, Replay, World};
use std::{env, fs, process};
fn run() -> Result<(), String> {
    let args: Vec<_> = env::args().collect();
    match args.get(1).map(String::as_str).unwrap_or("verify") {
        "verify" | "fixtures" => {
            let mut output = vec![];
            for scenario in scenarios::campaign() {
                let w = scenario.run()?;
                output.push(serde_json::json!({"name": scenario.name, "replay": scenario.replay, "bodies": w.bodies, "status": w.status(), "events": w.events}));
            }
            println!(
                "{}",
                serde_json::to_string(&output).map_err(|e| e.to_string())?
            );
        }
        "replay" => {
            let path = args
                .get(2)
                .ok_or("Usage: sculptor replay experiment.json")?;
            let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
            if content.len() > 512_000 {
                return Err("Replay exceeds 512 KB".into());
            }
            let replay: Replay = serde_json::from_str(&content).map_err(|e| e.to_string())?;
            let w = World::from_replay(replay)?;
            println!(
                "{}",
                serde_json::json!({"bodies": w.bodies, "status": w.status(), "events": w.events})
            );
        }
        _ => return Err("Usage: sculptor [verify|fixtures|replay FILE]".into()),
    }
    Ok(())
}
fn main() {
    if let Err(e) = run() {
        eprintln!("{e}");
        process::exit(1);
    }
}
