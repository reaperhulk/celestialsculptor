use celestial_sim::*;

#[test]
fn every_authored_challenge_has_a_winning_and_losing_replay() {
    let scenarios = scenarios::campaign();
    for version in [SAVE_VERSION] {
        for mission in 0..MISSIONS.len() {
            for won in [false, true] {
                assert!(
                    scenarios.iter().any(|s| s.replay.version == version
                        && s.replay.config.mission == Some(mission)
                        && s.completed == won),
                    "missing version {version} mission {mission} outcome {won}"
                );
            }
        }
    }
    for scenario in scenarios {
        scenario.run().unwrap();
    }
}

#[test]
fn continuous_hold_is_required_and_editing_resets_it() {
    let mut w = World::new(Config::default()).unwrap();
    w.apply(Command::Launch {
        kind: Kind::Rocky,
        radius: 1.0,
        angle: 0.0,
        speed: 1.0,
    })
    .unwrap();
    w.advance(512);
    assert_eq!(w.held_ticks, 512);
    assert!(!w.completed);
    w.apply(Command::Launch {
        kind: Kind::Rocky,
        radius: 2.0,
        angle: 1.0,
        speed: 1.0,
    })
    .unwrap();
    assert_eq!(w.held_ticks, 0);
    w.advance(1023);
    assert!(!w.completed);
    w.step();
    assert!(w.completed);
}

#[test]
fn unlocks_and_budgets_are_enforced_by_rust() {
    let mut w = World::new(Config::default()).unwrap();
    assert!(w
        .apply(Command::Launch {
            kind: Kind::Giant,
            radius: 1.0,
            angle: 0.0,
            speed: 1.0
        })
        .is_err());
    for _ in 0..8 {
        w.apply(Command::Launch {
            kind: Kind::Rocky,
            radius: 1.0,
            angle: 0.0,
            speed: 1.0,
        })
        .unwrap();
    }
    let before = w.clone();
    assert!(w
        .apply(Command::Launch {
            kind: Kind::Rocky,
            radius: 1.0,
            angle: 0.0,
            speed: 1.0
        })
        .is_err());
    assert_eq!(before, w);
}

#[test]
fn crossing_the_green_zone_is_not_a_habitable_orbit() {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    w.apply(Command::Launch {
        kind: Kind::Rocky,
        radius: 1.0,
        angle: 0.0,
        speed: 1.2,
    })
    .unwrap();
    assert!(!w.orbit(&w.bodies[1]).habitable);
}
#[test]
fn final_challenge_exposes_all_three_independent_requirements() {
    let w = World::new(Config {
        mission: Some(9),
        ..Config::default()
    })
    .unwrap();
    let s = w.status();
    let goals: Vec<_> = s.objectives.iter().flatten().collect();
    assert_eq!(goals.len(), 3);
    assert_eq!(
        goals.iter().map(|g| g.target).collect::<Vec<_>>(),
        vec![2, 1, 1]
    );
    assert!(goals.iter().all(|g| g.current == 0));
    assert!(!s.condition);
}
#[test]
fn tool_availability_reports_authoritative_costs_unlocks_and_capacity() {
    let mut w = World::new(Config::default()).unwrap();
    let status = w.status();
    assert_eq!(status.available_slots, 63);
    assert_eq!(status.actions_remaining, 2048);
    assert!(status.tools[0].unlocked);
    assert!(!status.tools[1].unlocked);
    assert_eq!(status.tools[2].cost, 50.0);
    assert!(!status.tools[2].affordable);
    for i in 0..8 {
        w.apply(Command::Launch {
            kind: Kind::Rocky,
            radius: 1.0,
            angle: i as f64,
            speed: 1.0,
        })
        .unwrap();
    }
    let status = w.status();
    assert!(!status.tools[0].affordable);
    assert_eq!(status.available_slots, 55);
    assert_eq!(status.actions_remaining, 2040);
}

#[test]
fn formation_requires_orbital_encounters_and_slingshots_cannot_be_bought_with_speed() {
    let mut w = World::new(Config {
        mission: Some(3),
        ..Config::default()
    })
    .unwrap();
    assert!(w
        .apply(Command::Launch {
            kind: Kind::Rocky,
            radius: 1.0,
            angle: 0.0,
            speed: 1.0
        })
        .is_err());
    w.apply(Command::Launch {
        kind: Kind::Dust,
        radius: 1.0,
        angle: 0.0,
        speed: 1.0,
    })
    .unwrap();
    let before = w.clone();
    assert!(w
        .apply(Command::Launch {
            kind: Kind::Dust,
            radius: 1.0,
            angle: 0.0,
            speed: 1.0
        })
        .is_err());
    assert_eq!(before, w);
    let mut assist = World::new(Config {
        mission: Some(6),
        ..Config::default()
    })
    .unwrap();
    let before = assist.clone();
    assert!(assist
        .apply(Command::LaunchMass {
            kind: Kind::Rocky,
            mass: 1.0,
            radius: 1.0,
            angle: 0.0,
            speed: 1.8
        })
        .is_err());
    assert!(assist
        .apply(Command::Nudge {
            id: 1,
            radial: 0.0,
            tangential: 0.1
        })
        .is_err());
    assert_eq!(assist, before);
}
