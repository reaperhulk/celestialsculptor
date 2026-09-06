use celestial_sim::*;
fn world() -> World {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    w.apply(Command::Launch {
        kind: Kind::Rocky,
        radius: 1.0,
        angle: 0.0,
        speed: 1.0,
    })
    .unwrap();
    w
}
#[test]
fn nudge_changes_velocity_without_teleporting_or_changing_mass() {
    let mut w = world();
    let before = w.bodies[1].clone();
    w.apply(Command::Nudge {
        id: 1,
        tangential: 0.1,
        radial: 0.0,
    })
    .unwrap();
    assert_eq!(w.bodies[1].pos, before.pos);
    assert_eq!(w.bodies[1].mass, before.mass);
    assert!((w.bodies[1].vel.y / before.vel.y - 1.1).abs() < 1e-12);
    assert_eq!(w.spent, 2.0);
    w.advance(256);
    assert_eq!(w, World::from_replay(w.replay()).unwrap());
}
#[test]
fn invalid_nudges_are_atomic_and_cannot_target_the_star() {
    for command in [
        Command::Nudge {
            id: 0,
            tangential: 0.1,
            radial: 0.0,
        },
        Command::Nudge {
            id: 999,
            tangential: 0.1,
            radial: 0.0,
        },
        Command::Nudge {
            id: 1,
            tangential: f64::NAN,
            radial: 0.0,
        },
        Command::Nudge {
            id: 1,
            tangential: 0.0,
            radial: 0.0,
        },
    ] {
        let mut w = world();
        let before = w.clone();
        assert!(w.apply(command).is_err());
        assert_eq!(w, before);
    }
}
#[test]
fn combined_nudge_components_respect_the_total_impulse_limit() {
    let mut w = world();
    let before = w.clone();
    assert!(w
        .apply(Command::Nudge {
            id: 1,
            tangential: 0.25,
            radial: 0.25
        })
        .is_err());
    assert_eq!(w, before);
    w.apply(Command::Nudge {
        id: 1,
        tangential: 0.1,
        radial: 0.1,
    })
    .unwrap();
}
#[test]
fn repeated_same_tick_interventions_have_distinct_bounded_journal_entries() {
    let mut w = world();
    for i in 0..50 {
        w.apply(Command::Nudge {
            id: 1,
            tangential: if i % 2 == 0 { 0.01 } else { -0.01 },
            radial: 0.0,
        })
        .unwrap();
    }
    assert_eq!(w.events.len(), 24);
    assert!(w.events.windows(2).all(|pair| pair[0].id + 1 == pair[1].id));
    assert!(w.events.iter().all(|event| event.tick == 0));
    assert_eq!(w.events.last().unwrap().id, 51);
    assert_eq!(w, World::from_replay(w.replay()).unwrap());
}
