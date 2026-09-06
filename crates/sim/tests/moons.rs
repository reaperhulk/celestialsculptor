use celestial_sim::*;
fn system(speed: f64) -> World {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    w.apply(Command::LaunchMass {
        kind: Kind::Giant,
        mass: 318.0,
        radius: 3.0,
        angle: 0.0,
        speed: 1.0,
    })
    .unwrap();
    w.apply(Command::LaunchMoon {
        parent: 1,
        kind: Kind::Rocky,
        mass: 0.1,
        distance: 0.05,
        angle: 0.0,
        speed,
    })
    .unwrap();
    w
}
#[test]
fn prograde_and_retrograde_moons_remain_bound_under_all_body_gravity() {
    for speed in [-1.0, 1.0] {
        let mut w = system(speed);
        let p = w.momentum();
        let initial = w.bodies[2]
            .pos
            .minus(w.bodies[1].pos)
            .cross(w.bodies[2].vel.minus(w.bodies[1].vel));
        assert_eq!(initial.signum(), speed);
        for _ in 0..20 {
            w.advance(512);
            assert_eq!(w.bodies.len(), 3);
            assert!(w.moon_orbit(&w.bodies[2]).is_some());
            assert!(w.bodies[2].pos.minus(w.bodies[1].pos).norm() < 0.09);
        }
        assert!(w.momentum().minus(p).norm() < 1e-12);
        assert_eq!(w.status().moons, 1);
        assert_eq!(w, World::from_replay(w.replay()).unwrap());
    }
}
#[test]
fn unsafe_moon_orbits_are_rejected_atomically() {
    let mut w = system(1.0);
    for distance in [0.0, 0.01, 0.5, f64::NAN] {
        let before = w.clone();
        assert!(w
            .apply(Command::LaunchMoon {
                parent: 1,
                kind: Kind::Rocky,
                mass: 0.1,
                distance,
                angle: 0.0,
                speed: 1.0
            })
            .is_err());
        assert_eq!(w, before);
    }
}
#[test]
fn reversing_spin_does_not_reverse_or_translate_an_orbit() {
    let mut w = system(1.0);
    let body = w.bodies[1].clone();
    w.apply(Command::Spin { id: 1, rate: -1.0 }).unwrap();
    assert_eq!(body.pos, w.bodies[1].pos);
    assert_eq!(body.vel, w.bodies[1].vel);
    assert!(w.bodies[1].spin < 0.0);
    w.step();
    assert!(w.bodies[1].rotation > 6.0);
}
