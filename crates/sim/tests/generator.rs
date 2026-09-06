use celestial_sim::generator::SystemStyle;
use celestial_sim::*;
#[test]
fn generated_systems_are_seeded_bounded_replayable_and_finite() {
    for style in [
        SystemStyle::Calm,
        SystemStyle::Nursery,
        SystemStyle::Chaos,
        SystemStyle::Moons,
        SystemStyle::Resonance,
    ] {
        for seed in [1, 42, 719] {
            let mut w = World::new(Config {
                seed,
                mission: None,
                star_mass: 1.0,
            })
            .unwrap();
            w.apply(Command::Generate {
                style,
                count: 16,
                chaos: 0.6,
            })
            .unwrap();
            assert!(w.bodies.len() <= MAX_BODIES);
            assert_eq!(w.commands.len(), 1);
            assert!(w.spent <= w.budget());
            w.advance(2048);
            assert!(w.energy().is_finite());
            assert_eq!(w, World::from_replay(w.replay()).unwrap());
            if style == SystemStyle::Moons {
                assert!(w.status().moons >= 2);
            }
        }
    }
}
#[test]
fn invalid_generation_or_replacing_an_existing_world_is_atomic() {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    let before = w.clone();
    assert!(w
        .apply(Command::Generate {
            style: SystemStyle::Chaos,
            count: 64,
            chaos: 1.0
        })
        .is_err());
    assert_eq!(w, before);
    w.apply(Command::Generate {
        style: SystemStyle::Calm,
        count: 8,
        chaos: 0.0,
    })
    .unwrap();
    let before = w.clone();
    assert!(w
        .apply(Command::Generate {
            style: SystemStyle::Chaos,
            count: 8,
            chaos: 0.5
        })
        .is_err());
    assert_eq!(w, before);
}
