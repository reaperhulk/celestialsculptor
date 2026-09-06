use celestial_sim::{scenarios, Replay, World};
use std::{env, fs, io::Read, process};
const USAGE: &str = "Usage: sculptor [verify|fixtures|bench|replay FILE|help]";
fn run() -> Result<(), String> {
    let args: Vec<_> = env::args().collect();
    let command = args.get(1).map(String::as_str).unwrap_or("verify");
    if args.len() > if command == "replay" { 3 } else { 2 } {
        return Err(USAGE.into());
    }
    match command {
        "help" | "--help" | "-h" => println!("{USAGE}\nReplay reconstructs an exported experiment without a browser. Verify checks every campaign fixture."),
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
        "bench" => {
            let mut results = vec![];
            for bodies in [8, 32, 64] {
                let initial = celestial_sim::benchmark::system(bodies);
                let mut timings = vec![];
                let mut final_count = 0;
                for _ in 0..7 {
                    let mut w = initial.clone();
                    let start = std::time::Instant::now();
                    w.advance(2048);
                    timings.push(start.elapsed().as_secs_f64());
                    final_count = std::hint::black_box(w.bodies.len());
                }
                timings.sort_by(f64::total_cmp);
                results.push(serde_json::json!({"bodies":bodies,"final_bodies":final_count,"ticks":2048,"median_ms":timings[3]*1000.0,"max_ms":timings[6]*1000.0,"ticks_per_second":2048.0/timings[3],"replay":initial.replay()}));
            }
            println!(
                "{}",
                serde_json::json!({"architecture":env::consts::ARCH,"os":env::consts::OS,"cases":results})
            );
        }
        "replay" => {
            let path = args
                .get(2)
                .ok_or("Usage: sculptor replay experiment.json")?;
            let mut content = String::new();
            fs::File::open(path).map_err(|e| e.to_string())?.take(600_001).read_to_string(&mut content).map_err(|e| e.to_string())?;
            if content.len() > 600_000 {return Err("Document exceeds 600 KB".into());}
            let mut value:serde_json::Value=serde_json::from_str(&content).map_err(|e|e.to_string())?;
            if value["format"]=="celestial-archive" {
                if value["version"]!=1 {return Err("Unsupported backup version".into());}
                value=value["replay"].take();
            } else if content.len()>512_000 {return Err("Replay exceeds 512 KB".into());}
            let replay: Replay = serde_json::from_value(value).map_err(|e| e.to_string())?;
            let w = World::from_replay(replay)?;
            println!(
                "{}",
                serde_json::json!({"bodies": w.bodies, "status": w.status(), "events": w.events})
            );
        }
        _ => return Err(USAGE.into()),
    }
    Ok(())
}
fn main() {
    if let Err(e) = run() {
        eprintln!("{e}");
        process::exit(1);
    }
}
