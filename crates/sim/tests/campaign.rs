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

#[test]
fn every_tool_is_gated_consistently_across_missions_and_the_sandbox() {
    let missions: Vec<Option<usize>> = (0..MISSIONS.len()).map(Some).chain([None]).collect();
    for mission in missions {
        let fresh = || {
            World::new(Config {
                mission,
                seed: 42,
                star_mass: 1.0,
            })
            .unwrap()
        };
        let mut host = fresh();
        let hosted = host
            .apply(Command::LaunchMass {
                kind: Kind::Giant,
                mass: 300.0,
                radius: 3.0,
                angle: 0.0,
                speed: 1.0,
            })
            .is_ok();
        let m = mission.map_or(usize::MAX, |m| m);
        // Planet kinds follow allowed(); missions 3-5 are dust-only, 7 places no bodies.
        for kind in [Kind::Rocky, Kind::Ice, Kind::Giant, Kind::Dust] {
            let mut w = fresh();
            let outcome = w.apply(Command::Launch {
                kind,
                radius: 1.0,
                angle: 0.0,
                speed: 1.0,
            });
            assert_eq!(outcome.is_ok(), w.allowed(kind), "{mission:?} {kind:?}");
        }
        // Debris tools exist exactly where dust is allowed.
        let mut w = fresh();
        assert_eq!(
            w.apply(Command::SeedBelt { radius: 2.0 }).is_ok(),
            w.allowed(Kind::Dust),
            "{mission:?} belt"
        );
        // Burns need a body and follow one predicate.
        if hosted {
            let mut w = host.clone();
            assert_eq!(
                w.apply(Command::Nudge {
                    id: 1,
                    tangential: 0.05,
                    radial: 0.0,
                })
                .is_ok(),
                w.burns_available(),
                "{mission:?} nudge"
            );
            // Moons follow their unlock, not the planet allow-list.
            let mut w = host.clone();
            let moon = w.apply(Command::LaunchMoon {
                parent: 1,
                kind: Kind::Rocky,
                mass: 0.01,
                distance: 0.03,
                angle: 0.0,
                speed: 1.0,
            });
            assert_eq!(
                moon.is_ok(),
                w.moons_available(),
                "{mission:?} moon {moon:?}"
            );
            assert_eq!(w.moons_available(), mission.is_none() || m >= 7);
        }
        // Sandbox-only tools are rejected in every challenge.
        let mut w = fresh();
        assert_eq!(
            w.apply(Command::SeedSwarm {
                count: 64,
                disorder: 0.1,
            })
            .is_ok(),
            mission.is_none(),
            "{mission:?} swarm"
        );
        let mut w = fresh();
        assert_eq!(
            w.apply(Command::GenerateSystem {
                style: generator::SystemStyle::Calm,
                count: 6,
                chaos: 0.1,
            })
            .is_ok(),
            mission.is_none(),
            "{mission:?} generate"
        );
        let mut w = host.clone();
        assert_eq!(
            w.apply(Command::Migration {
                id: 1,
                timescale: 200.0,
            })
            .is_ok(),
            mission.is_none() && hosted,
            "{mission:?} migration"
        );
    }
}
