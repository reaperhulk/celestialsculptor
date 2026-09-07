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
fn dense_experiments_keep_running_past_the_old_work_budget() {
    let mut w = celestial_sim::benchmark::system(64);
    w.work_units = LEGACY_WORK_LIMIT;
    let before = w.clone();
    w.advance(10);
    assert_eq!(w.tick, before.tick + 10);
    assert!(!w.status().exhausted);
}
#[test]
fn rewind_restores_initial_setup_instead_of_flattening_later_interventions() {
    let mut w = world(42);
    w.apply(Command::Launch {
        kind: Kind::Rocky,
        radius: 1.0,
        angle: 0.0,
        speed: 1.0,
    })
    .unwrap();
    let setup = w.clone();
    w.advance(128);
    w.apply(Command::Launch {
        kind: Kind::Ice,
        radius: 2.0,
        angle: 1.0,
        speed: 1.0,
    })
    .unwrap();
    w.rewind().unwrap();
    assert_eq!(w, setup);
}
#[test]
fn undo_rebuilds_history_without_the_last_placement() {
    let mut w = world(42);
    w.apply(Command::Launch {
        kind: Kind::Rocky,
        radius: 1.0,
        angle: 0.0,
        speed: 1.0,
    })
    .unwrap();
    let mut expected = w.clone();
    expected.advance(200);
    w.advance(100);
    w.apply(Command::SeedBelt { radius: 2.5 }).unwrap();
    w.advance(100);
    w.undo().unwrap();
    assert_eq!(w, expected);
    let mut empty = world(42);
    let before = empty.clone();
    assert!(empty.undo().is_err());
    assert_eq!(empty, before);
}
#[test]
fn journal_records_setup_and_stays_bounded_and_replayable() {
    let mut w = world(42);
    for i in 0..30 {
        w.apply(Command::Launch {
            kind: Kind::Rocky,
            radius: 1.0 + i as f64 * 0.1,
            angle: 0.0,
            speed: 1.0,
        })
        .unwrap();
    }
    assert_eq!(w.events.len(), 24);
    assert_eq!(w.events.last().unwrap().kind, "placed");
    assert_eq!(World::from_replay(w.replay()).unwrap().events, w.events);
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

#[test]
fn debris_system_survives_sixty_years_and_rebuilds_incrementally() {
    let mut w = world(42);
    for radius in [1.5, 2.5, 3.5, 4.5] {
        w.apply(Command::SeedBelt { radius }).unwrap();
    }
    w.advance(512 * 60);
    assert_eq!(w.tick, 512 * 60);
    assert!(w.work_units > LEGACY_WORK_LIMIT);
    assert!(!w.exhausted());
    let mut rebuild = celestial_sim::replay::Reconstruction::new(w.replay()).unwrap();
    while !rebuild.advance(127).unwrap() {}
    assert_eq!(w, rebuild.finish().unwrap());
}

#[test]
fn incremental_reconstruction_preserves_timed_edits_and_validates_before_stepping() {
    let mut w = world(42);
    w.apply(Command::SeedBelt { radius: 2.5 }).unwrap();
    w.advance(130);
    w.apply(Command::Launch {
        kind: Kind::Rocky,
        radius: 1.0,
        angle: 0.0,
        speed: 1.0,
    })
    .unwrap();
    w.advance(300);
    for chunk in [1, 64, 128, 512] {
        let mut replay = celestial_sim::replay::Reconstruction::new(w.replay()).unwrap();
        while !replay.advance(chunk).unwrap() {}
        assert_eq!(w, replay.finish().unwrap());
    }
    let mut invalid = w.replay();
    invalid.commands[1].tick = invalid.end_tick + 1;
    assert!(celestial_sim::replay::Reconstruction::new(invalid).is_err());
}

proptest! {
 #![proptest_config(ProptestConfig::with_cases(64))]
 #[test]
 fn generated_multi_body_histories_survive_timed_edits_and_json_roundtrips(
  seed in any::<u32>(),
  edits in prop::collection::vec((0.3f64..5.8,0.0f64..std::f64::consts::TAU,0.5f64..1.8,0u32..128),1..10)
 ){
  let mut w=world(seed);
  for (radius,angle,speed,delay) in edits {
   w.advance(delay);w.apply(Command::Launch{kind:Kind::Rocky,radius,angle,speed}).unwrap();
   if let Some(body)=w.bodies.get(1){let id=body.id;w.apply(Command::Nudge{id,tangential:0.03,radial:-0.01}).unwrap();}
  }
  w.advance(512);
  for body in &w.bodies {prop_assert!(body.pos.norm2().is_finite()&&body.vel.norm2().is_finite());}
  let json=serde_json::to_string(&w.replay()).unwrap();let replay=serde_json::from_str(&json).unwrap();
  prop_assert_eq!(w,World::from_replay(replay).unwrap());
 }
}
