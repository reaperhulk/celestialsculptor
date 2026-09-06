use celestial_sim::*;
use proptest::prelude::*;

fn world(seed: u32) -> World {
    World::new(Config {
        mission: None,
        seed,
        ..Config::default()
    })
    .unwrap()
}

#[test]
fn seeded_generation_is_repeatable_and_seed_sensitive() {
    let mut a = world(42);
    let mut b = world(42);
    let mut c = world(43);
    for w in [&mut a, &mut b, &mut c] {
        w.apply(Command::SeedBelt { radius: 2.5 }).unwrap();
    }
    assert_eq!(a, b);
    assert_ne!(a.bodies, c.bodies);
    a.advance(512);
    b.advance(512);
    assert_eq!(a, b);
}

#[test]
fn malformed_replay_is_rejected_without_unbounded_work() {
    let mut r = world(42).replay();
    r.version = 999;
    assert!(World::from_replay(r.clone()).is_err());
    r.version = SAVE_VERSION;
    r.end_tick = MAX_TICKS + 1;
    assert!(World::from_replay(r.clone()).is_err());
    r.end_tick = 0;
    r.commands.push(RecordedCommand {
        tick: 1,
        command: Command::SeedBelt { radius: 2.5 },
    });
    assert!(World::from_replay(r.clone()).is_err());
    r.commands = vec![
        RecordedCommand {
            tick: 0,
            command: Command::SeedBelt { radius: 2.5 }
        };
        2049
    ];
    assert!(World::from_replay(r).is_err());
}

#[test]
fn body_limit_rejects_whole_belt_without_rng_or_budget_changes() {
    let mut w = world(42);
    for _ in 0..5 {
        w.apply(Command::SeedBelt { radius: 2.5 }).unwrap();
    }
    let before = w.clone();
    assert!(w.apply(Command::SeedBelt { radius: 2.5 }).is_err());
    assert_eq!(w, before);
}

#[test]
fn experiment_stops_at_exportable_time_limit() {
    let mut w = world(42);
    w.tick = MAX_TICKS;
    let before = w.clone();
    w.step();
    assert_eq!(w, before);
    assert!(w.status().exhausted);
}
#[test]
fn dense_experiments_stop_at_a_replayable_work_budget() {
    let mut w = celestial_sim::benchmark::system(64);
    w.work_units = MAX_WORK_UNITS;
    let before = w.clone();
    w.advance(10);
    assert_eq!(w, before);
    assert!(w.status().exhausted);
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]
    #[test]
    fn random_valid_experiments_are_finite_and_exactly_replayable(seed in any::<u32>(), radius in 0.3f64..5.0, angle in -6.0f64..6.0, speed in 0.0f64..2.2) {
        let mut w = world(seed);
        w.apply(Command::Launch { kind: Kind::Rocky, radius, angle, speed }).unwrap();
        w.advance(100);
        for b in &w.bodies { prop_assert!(b.pos.x.is_finite() && b.pos.y.is_finite() && b.vel.x.is_finite() && b.vel.y.is_finite()); }
        let text = serde_json::to_string(&w.replay()).unwrap();
        let rebuilt = World::from_replay(serde_json::from_str(&text).unwrap()).unwrap();
        prop_assert_eq!(w, rebuilt);
    }
}
