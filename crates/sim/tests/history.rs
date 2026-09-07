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
