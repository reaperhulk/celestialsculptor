use celestial_sim::*;
#[test]
fn observations_are_tick_based_bounded_and_replayable() {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    w.apply(Command::LaunchMass {
        kind: Kind::Rocky,
        mass: 1.,
        radius: 1.,
        angle: 0.,
        speed: 1.,
    })
    .unwrap();
    w.advance(512 * 100);
    assert!(w.history.frames.len() <= history::MAX_SAMPLES);
    assert_eq!(w.history.frames[0].tick, 0);
    assert!(w.history.frames.last().unwrap().tick > 512 * 99);
    assert!(w
        .history
        .frames
        .windows(2)
        .all(|pair| pair[0].tick < pair[1].tick));
    assert_eq!(w, World::from_replay(w.replay()).unwrap());
    for frame in &w.history.frames {
        assert!((frame.bodies[0].axis.unwrap() - 1.).abs() < 0.001);
    }
}
#[test]
fn impact_history_keeps_completed_details_and_survives_event_rollover() {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    for speed in [1., 0.8] {
        w.apply(Command::LaunchMass {
            kind: Kind::Rocky,
            mass: 1.,
            radius: 1.,
            angle: 0.,
            speed,
        })
        .unwrap();
    }
    w.advance(1);
    let impact = w
        .history
        .events
        .iter()
        .find_map(|e| e.impact.as_ref())
        .unwrap();
    assert!(impact.orbit_before.is_some() && impact.orbit_after.is_some());
    assert!(impact.radius_after > impact.radius_before);
    for i in 0..300 {
        w.apply(Command::Spin {
            id: 1,
            rate: i as f64,
        })
        .unwrap();
    }
    assert_eq!(w.history.events.len(), history::MAX_HISTORY_EVENTS);
    assert!(w.history.events.windows(2).all(|e| e[0].id + 1 == e[1].id));
    assert_eq!(w, World::from_replay(w.replay()).unwrap());
}

#[test]
fn pinned_detail_survives_large_population_decimation_without_resetting_physics() {
    let mut w = celestial_sim::World::new(celestial_sim::Config {
        mission: None,
        ..Default::default()
    })
    .unwrap();
    w.apply(celestial_sim::Command::SeedSwarm {
        count: 1023,
        disorder: 0.,
    })
    .unwrap();
    let body = w.bodies[900].clone();
    w.apply(celestial_sim::Command::TrackHistory {
        id: 900,
        enabled: true,
    })
    .unwrap();
    assert_eq!(w.bodies[900], body);
    w.advance(512);
    assert!(w.history.priority_ids.contains(&900));
    assert!(w
        .history
        .recent
        .iter()
        .all(|f| f.bodies.iter().any(|b| b.id == 900)));
    assert!(w.history.valid_bounds());
    assert_eq!(w, celestial_sim::World::from_replay(w.replay()).unwrap());
}

#[test]
fn event_log_stays_unique_and_ordered_when_one_tick_emits_more_than_the_live_buffer() {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    for i in 0..30 {
        w.apply(Command::Launch {
            kind: Kind::Rocky,
            radius: 1.0,
            angle: f64::from(i) * 0.0005,
            speed: 1.0,
        })
        .unwrap();
    }
    w.advance(1);
    assert!(w.collisions > 24, "{} merges", w.collisions);
    assert_eq!(w.events.len(), 24);
    w.apply(Command::Spin { id: 1, rate: 1.0 }).unwrap();
    w.advance(1);
    let ids: Vec<u32> = w.history.events.iter().map(|e| e.id).collect();
    assert!(ids.windows(2).all(|pair| pair[0] < pair[1]), "{ids:?}");
    for live in &w.events {
        assert_eq!(
            w.history.events.iter().find(|e| e.id == live.id),
            Some(live)
        );
    }
    assert_eq!(w, World::from_replay(w.replay()).unwrap());
}
