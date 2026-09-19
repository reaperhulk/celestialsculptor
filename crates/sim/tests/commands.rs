//! Every command, with arbitrary (including non-finite) arguments, either
//! applies or is rejected without touching the world and without panicking.
use celestial_sim::*;
use proptest::prelude::*;

fn any_kind() -> impl Strategy<Value = Kind> {
    prop_oneof![
        Just(Kind::Star),
        Just(Kind::Rocky),
        Just(Kind::Ice),
        Just(Kind::Giant),
        Just(Kind::Dust)
    ]
}
fn any_style() -> impl Strategy<Value = generator::SystemStyle> {
    use generator::SystemStyle::*;
    prop_oneof![
        Just(Swarm),
        Just(Calm),
        Just(Nursery),
        Just(Chaos),
        Just(Moons),
        Just(Resonance)
    ]
}
fn hostile_f64() -> impl Strategy<Value = f64> {
    prop_oneof![
        4 => -10.0f64..10.0,
        1 => Just(f64::NAN),
        1 => Just(f64::INFINITY),
        1 => Just(f64::NEG_INFINITY),
        1 => Just(0.0),
        1 => Just(1e300),
        1 => Just(-0.0),
    ]
}
fn any_command() -> impl Strategy<Value = Command> {
    prop_oneof![
        (0u32..6, any::<bool>()).prop_map(|(id, enabled)| Command::TrackHistory { id, enabled }),
        (0u32..9000, hostile_f64())
            .prop_map(|(count, disorder)| Command::SeedSwarm { count, disorder }),
        (any_style(), 0u32..40, hostile_f64()).prop_map(|(style, count, chaos)| {
            Command::GenerateSystem {
                style,
                count,
                chaos,
            }
        }),
        (0u32..6, hostile_f64()).prop_map(|(id, timescale)| Command::Migration { id, timescale }),
        (
            0u32..6,
            any_kind(),
            hostile_f64(),
            hostile_f64(),
            hostile_f64(),
            hostile_f64()
        )
            .prop_map(|(parent, kind, mass, distance, angle, speed)| {
                Command::LaunchMoon {
                    parent,
                    kind,
                    mass,
                    distance,
                    angle,
                    speed,
                }
            }),
        (0u32..6, hostile_f64()).prop_map(|(id, rate)| Command::Spin { id, rate }),
        (
            any_kind(),
            hostile_f64(),
            hostile_f64(),
            hostile_f64(),
            hostile_f64()
        )
            .prop_map(|(kind, mass, radius, angle, speed)| Command::LaunchMass {
                kind,
                mass,
                radius,
                angle,
                speed,
            }),
        (0u32..6, hostile_f64(), hostile_f64()).prop_map(|(id, tangential, radial)| {
            Command::Nudge {
                id,
                tangential,
                radial,
            }
        }),
        (any_kind(), hostile_f64(), hostile_f64(), hostile_f64()).prop_map(
            |(kind, radius, angle, speed)| Command::Launch {
                kind,
                radius,
                angle,
                speed,
            }
        ),
        hostile_f64().prop_map(|radius| Command::SeedBelt { radius }),
        (hostile_f64(), hostile_f64(), hostile_f64(), 0u32..50).prop_map(
            |(radius, spread, disorder, count)| Command::SeedDisk {
                radius,
                spread,
                disorder,
                count,
            }
        ),
    ]
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(96))]
    #[test]
    fn rejected_commands_leave_the_world_untouched_and_accepted_ones_replay(
        mission in prop_oneof![Just(None), (0usize..10).prop_map(Some)],
        commands in prop::collection::vec(any_command(), 1..8),
    ) {
        let mut w = World::new(Config { mission, seed: 9, star_mass: 1.0 }).unwrap();
        for command in commands {
            let before = w.clone();
            match w.apply(command.clone()) {
                Ok(()) => {
                    prop_assert!(w.bodies.iter().all(|b| b.pos.norm2().is_finite() && b.vel.norm2().is_finite()));
                    w.advance(4);
                }
                Err(error) => {
                    prop_assert!(!error.message().is_empty());
                    prop_assert_eq!(&w, &before);
                }
            }
        }
        prop_assert_eq!(World::from_replay(w.replay()).unwrap(), w);
    }
}
