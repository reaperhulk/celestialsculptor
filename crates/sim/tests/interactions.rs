use celestial_sim::*;

fn sandbox() -> World {
    World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap()
}
fn place(w: &mut World, kind: Kind, mass: f64, radius: f64, angle: f64, speed: f64) {
    w.apply(Command::LaunchMass {
        kind,
        mass,
        radius,
        angle,
        speed,
    })
    .unwrap();
}

#[test]
fn a_neighbor_changes_both_orbits_through_mutual_gravity() {
    let mut together = sandbox();
    place(&mut together, Kind::Rocky, 10.0, 1.8, 0.08, 1.0);
    let mut alone = together.clone();
    place(&mut together, Kind::Giant, 1000.0, 2.0, 0.0, 1.0);
    let mut giant_alone = together.clone();
    giant_alone.bodies.remove(1);
    let p = together.momentum();
    together.advance(256);
    alone.advance(256);
    giant_alone.advance(256);
    assert_eq!(together.bodies.len(), 3, "This is a flyby, not an impact");
    assert!(together.bodies[1].vel.minus(alone.bodies[1].vel).norm() > 0.01);
    assert!(
        together.bodies[2]
            .vel
            .minus(giant_alone.bodies[1].vel)
            .norm()
            > 0.00001
    );
    assert!(together.momentum().minus(p).norm() < 1e-13);
}

#[test]
fn an_impact_grows_volume_and_changes_the_survivors_orbit() {
    let mut w = sandbox();
    place(&mut w, Kind::Rocky, 1.0, 1.0, 0.0, 1.0);
    place(&mut w, Kind::Rocky, 3.0, 1.0, 0.0, 0.6);
    let before = w.orbit(&w.bodies[1]);
    let radius = w.bodies[1].radius;
    let momentum = w.momentum();
    let angular = w.angular_momentum();
    w.step();
    let b = &w.bodies[1];
    let orbit = w.orbit(b);
    assert_eq!(w.bodies.len(), 2);
    assert!((b.mass / EARTH - 4.0).abs() < 1e-12);
    assert!((b.radius / radius - 4.0_f64.cbrt()).abs() < 1e-12);
    assert!(orbit.eccentricity > before.eccentricity + 0.4);
    assert!(orbit.periapsis < 0.4);
    assert!(w.momentum().minus(momentum).norm() < 1e-13);
    assert!((w.angular_momentum() - angular).abs() < 1e-13);
    let impact = w
        .events
        .iter()
        .find_map(|event| event.impact.as_ref())
        .unwrap();
    assert!(impact.dissipated_energy > 0.0);
    assert_eq!(impact.mass, b.mass);
    assert!(impact.eccentricity_after > impact.eccentricity_before + 0.4);
}

#[test]
fn material_and_collision_type_do_not_depend_on_placement_order() {
    let mut outcomes = vec![];
    for kinds in [[Kind::Ice, Kind::Rocky], [Kind::Rocky, Kind::Ice]] {
        let mut w = sandbox();
        for kind in kinds {
            place(
                &mut w,
                kind,
                if kind == Kind::Ice { 2.0 } else { 1.0 },
                1.0,
                0.0,
                0.9,
            );
        }
        w.step();
        outcomes.push(w.bodies[1].clone());
    }
    assert_eq!(outcomes[0].kind, Kind::Ice);
    assert_eq!(outcomes[0].kind, outcomes[1].kind);
    assert_eq!(outcomes[0].material, outcomes[1].material);
    assert!((outcomes[0].material.ice / EARTH - 2.0).abs() < 1e-12);
    assert!((outcomes[0].material.rock / EARTH - 1.0).abs() < 1e-12);
    assert!(outcomes[0].vel.minus(outcomes[1].vel).norm() < 1e-12);
}

#[test]
fn custom_masses_are_bounded_atomic_and_replayable() {
    let mut w = sandbox();
    for mass in [0.0, -1.0, 1001.0, f64::NAN, f64::INFINITY] {
        let before = w.clone();
        assert!(w
            .apply(Command::LaunchMass {
                kind: Kind::Giant,
                mass,
                radius: 2.0,
                angle: 0.0,
                speed: 1.0
            })
            .is_err());
        assert_eq!(before, w);
    }
    place(&mut w, Kind::Giant, 318.0, 2.0, 0.0, 1.0);
    w.advance(256);
    assert!((w.spent - 318.0).abs() < 1e-10);
    assert_eq!(w, World::from_replay(w.replay()).unwrap());
}

#[test]
fn legacy_replays_retain_the_original_physical_outcomes() {
    let fixtures: serde_json::Value =
        serde_json::from_str(include_str!("../../../scenarios/legacy-v1.json")).unwrap();
    for fixture in fixtures.as_array().unwrap() {
        let replay: Replay = serde_json::from_value(fixture["replay"].clone()).unwrap();
        let w = World::from_replay(replay).unwrap();
        assert_eq!(w.replay().version, 1);
        for (actual, expected) in w.bodies.iter().zip(fixture["bodies"].as_array().unwrap()) {
            assert_eq!(serde_json::to_value(actual.kind).unwrap(), expected["kind"]);
            for (name, vector) in [("pos", actual.pos), ("vel", actual.vel)] {
                assert!((vector.x - expected[name]["x"].as_f64().unwrap()).abs() < 1e-10);
                assert!((vector.y - expected[name]["y"].as_f64().unwrap()).abs() < 1e-10);
            }
        }
    }
}
