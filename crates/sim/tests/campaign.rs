use celestial_sim::*;

#[test]
fn every_authored_challenge_has_a_winning_and_losing_replay() {
    let scenarios = scenarios::campaign();
    assert_eq!(scenarios.len(), MISSIONS.len() * 2);
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
        vec![5, 1, 1]
    );
    assert!(goals.iter().all(|g| g.current == 0));
    assert!(!s.condition);
}
