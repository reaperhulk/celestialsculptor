//! Reproducible release qualification; writes JSON to stdout, progress to stderr.
use celestial_sim::{benchmark::OrbitProbe, *};
use serde_json::{json, Value};
use std::time::Instant;
fn world() -> World {
    World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap()
}
fn launch(w: &mut World, mass: f64, radius: f64, angle: f64, speed: f64) {
    w.apply(Command::LaunchMass {
        kind: if mass > 100. {
            Kind::Giant
        } else {
            Kind::Rocky
        },
        mass,
        radius,
        angle,
        speed,
    })
    .unwrap();
}
fn state(w: &World) -> Vec<f64> {
    w.bodies
        .iter()
        .flat_map(|b| [b.pos.x, b.pos.y, b.vel.x, b.vel.y, b.mass])
        .collect()
}
fn orbital(name: &str, w: World, years: u32) -> Value {
    let initial = state(&w);
    let mut runs = vec![];
    for substeps in [
        w.minimum_substeps,
        w.minimum_substeps * 2,
        w.minimum_substeps * 4,
    ] {
        let started = Instant::now();
        let mut p = OrbitProbe::new(&initial, true).unwrap();
        let mut samples = vec![];
        for year in 1..=years {
            p.advance_refined(512, substeps);
            if year % 25 == 0 || year == years {
                samples.push(json!({"year":year,"state":p.state()}));
            }
        }
        runs.push(json!({"substeps":substeps,"seconds":started.elapsed().as_secs_f64(),"samples":samples}));
    }
    eprintln!("qualified collisionless {name}: {years} years");
    json!({"name":name,"initial":initial,"years":years,"runs":runs})
}
fn evolving(name: &str, mut w: World) -> Value {
    let initial = w.balances();
    let start = Instant::now();
    let mut samples = vec![];
    for year in 1_u32..=600 {
        w.advance(512);
        if year % 25 == 0 {
            assert_eq!(w.tick, u64::from(year) * 512);
            assert!(w.history.valid_bounds());
            samples.push(json!({"year":year,"bodies":w.bodies.len(),"balances":w.balances(),"moons":w.status().moons,"resonances":w.resonances,"contacts":[w.collisions,w.grazes,w.disruptions],"ejections":w.ejections}));
            eprintln!("{name}: {year} years, {} bodies", w.bodies.len());
        }
    }
    json!({"name":name,"initial":initial,"seconds":start.elapsed().as_secs_f64(),"samples":samples})
}
fn main() {
    let mut eccentric = world();
    launch(&mut eccentric, 1., 1., 0., 0.9);
    let mut moons = world();
    launch(&mut moons, 318., 3., 0., 1.);
    for (distance, speed) in [(0.05, 1.), (0.075, -1.)] {
        moons
            .apply(Command::LaunchMoon {
                parent: 1,
                kind: Kind::Rocky,
                mass: 0.003,
                distance,
                angle: 1.,
                speed,
            })
            .unwrap();
    }
    let mut resonance = world();
    launch(
        &mut resonance,
        318.,
        1.,
        std::f64::consts::PI,
        0.95_f64.sqrt(),
    );
    launch(&mut resonance, 318., 1.5, std::f64::consts::FRAC_PI_2, 1.);
    let mut disk = world();
    launch(&mut disk, 1., 1., 0., 1.);
    disk.apply(Command::Migration {
        id: 1,
        timescale: 100.,
    })
    .unwrap();
    launch(&mut disk, 1., 3., 0., 1.7);
    let mut swarm = world();
    swarm
        .apply(Command::SeedSwarm {
            count: 1023,
            disorder: 0.,
        })
        .unwrap();
    let selected = std::env::args().nth(1);
    let collisionless: Vec<_> = [
        ("eccentric", eccentric, 4096),
        ("moons", moons.clone(), 600),
        ("resonance", resonance.clone(), 600),
    ]
    .into_iter()
    .filter(|(name, _, _)| selected.as_ref().is_none_or(|s| s == name))
    .map(|(name, w, years)| orbital(name, w, years))
    .collect();
    let worlds: Vec<_> = [
        ("moons", moons),
        ("resonance", resonance),
        ("disk-and-escape", disk),
        ("massive-swarm-1024", swarm),
    ]
    .into_iter()
    .filter(|(name, _)| selected.as_ref().is_none_or(|s| s == name))
    .map(|(name, w)| evolving(name, w))
    .collect();
    println!(
        "{}",
        json!({"schema":1,"physics":checkpoint::PHYSICS_ID,"softening":1e-4,"collisionless":collisionless,"worlds":worlds})
    );
}
