use celestial_sim::{generator::SystemStyle, *};
#[test]
fn modern_generators_support_boundary_stars_and_counts_without_partial_setup() {
    for star_mass in [0.6, 1.5] {
        for count in [4, 32] {
            for chaos in [0., 1.] {
                for style in [
                    SystemStyle::Calm,
                    SystemStyle::Nursery,
                    SystemStyle::Chaos,
                    SystemStyle::Moons,
                    SystemStyle::Resonance,
                ] {
                    let mut w = World::new(Config {
                        seed: 719,
                        mission: None,
                        star_mass,
                    })
                    .unwrap();
                    w.apply(Command::GenerateSystem {
                        style,
                        count,
                        chaos,
                    })
                    .unwrap();
                    assert!(w.bodies.len() <= MAX_BODIES);
                    assert_eq!(w.commands.len(), 1);
                    w.advance(512 * 4);
                    assert!(w.energy().is_finite());
                    assert_eq!(w, World::from_replay(w.replay()).unwrap());
                }
            }
        }
    }
}
#[test]
fn different_resonance_seeds_change_mass_spacing_and_migration_not_just_spin() {
    let generate = |seed| {
        let mut w = World::new(Config {
            seed,
            mission: None,
            star_mass: 1.,
        })
        .unwrap();
        w.apply(Command::GenerateSystem {
            style: SystemStyle::Resonance,
            count: 12,
            chaos: 0.6,
        })
        .unwrap();
        w
    };
    let a = generate(1);
    let b = generate(719);
    assert_ne!(a.bodies[1].mass, b.bodies[1].mass);
    assert_ne!(
        a.orbit(&a.bodies[1]).distance,
        b.orbit(&b.bodies[1]).distance
    );
    assert_ne!(a.bodies[2].migration_rate, b.bodies[2].migration_rate);
}
