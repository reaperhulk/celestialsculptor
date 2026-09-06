use celestial_sim::*;
fn world() -> World {
    World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap()
}
#[test]
fn disk_generation_is_seeded_budgeted_and_replayable() {
    let mut w = world();
    w.apply(Command::SeedDisk {
        radius: 2.5,
        spread: 1.0,
        disorder: 0.3,
        count: 24,
    })
    .unwrap();
    assert_eq!(w.bodies.len(), 25);
    assert_eq!(w.spent, 6.0);
    assert!(w
        .bodies
        .iter()
        .skip(1)
        .all(|b| (2.0..=3.0).contains(&b.pos.norm())));
    w.advance(1024);
    assert!(w.energy().is_finite());
    assert_eq!(World::from_replay(w.replay()).unwrap(), w);
}
#[test]
fn invalid_disks_do_not_consume_rng_matter_or_slots() {
    for command in [
        Command::SeedDisk {
            radius: 0.3,
            spread: 1.0,
            disorder: 0.3,
            count: 24,
        },
        Command::SeedDisk {
            radius: 2.5,
            spread: 1.0,
            disorder: f64::NAN,
            count: 24,
        },
        Command::SeedDisk {
            radius: 2.5,
            spread: 1.0,
            disorder: 0.3,
            count: 41,
        },
    ] {
        let mut w = world();
        let before = w.clone();
        assert!(w.apply(command).is_err());
        assert_eq!(w, before);
    }
}
