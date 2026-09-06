use celestial_sim::*;

fn sandbox() -> World {
    World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap()
}
fn launch(w: &mut World, radius: f64, angle: f64, speed: f64) {
    w.apply(Command::Launch {
        kind: Kind::Rocky,
        radius,
        angle,
        speed,
    })
    .unwrap();
}

#[test]
fn isolated_star_does_not_move() {
    let mut w = sandbox();
    w.advance(1024);
    assert_eq!(w.bodies[0].pos, V2::default());
    assert_eq!(w.bodies[0].vel, V2::default());
    assert!(!w.completed);
}

#[test]
fn circular_orbit_conserves_energy_and_momentum_over_100_years() {
    let mut w = sandbox();
    launch(&mut w, 1.0, 0.0, 1.0);
    let energy = w.energy();
    let momentum = w.momentum();
    let angular = w.angular_momentum();
    for _ in 0..100 {
        w.advance(512);
        assert!((w.energy() / energy - 1.0).abs() < 1e-7, "energy drift");
        assert!(
            w.momentum().minus(momentum).norm() < 1e-14,
            "momentum drift"
        );
        assert!((w.angular_momentum() - angular).abs() < 1e-13);
        assert!((w.orbit(&w.bodies[1]).distance - 1.0).abs() < 0.001);
    }
}

#[test]
fn collision_conserves_mass_and_linear_and_angular_momentum() {
    let mut w = sandbox();
    launch(&mut w, 1.0, 0.0, 1.0);
    launch(&mut w, 1.0, 0.01, 0.5);
    let mass: f64 = w.bodies.iter().map(|b| b.mass).sum();
    let momentum = w.momentum();
    let angular = w.angular_momentum();
    let energy = w.energy();
    w.step();
    assert_eq!(w.collisions, 1);
    assert_eq!(w.bodies.len(), 2);
    assert!((w.bodies.iter().map(|b| b.mass).sum::<f64>() - mass).abs() < 1e-15);
    assert!(w.momentum().minus(momentum).norm() < 1e-14);
    assert!((w.angular_momentum() - angular).abs() < 1e-13);
    assert!(w.energy() < energy, "inelastic impact dissipates energy");
}

#[test]
fn simulation_is_independent_of_frame_batching() {
    let mut a = sandbox();
    launch(&mut a, 1.0, 0.0, 0.95);
    let mut b = a.clone();
    a.advance(4096);
    for _ in 0..128 {
        b.advance(32);
    }
    assert_eq!(a, b);
}

#[test]
fn replay_preserves_tick_stamped_interventions() {
    let mut a = sandbox();
    launch(&mut a, 1.0, 0.0, 1.0);
    a.advance(300);
    launch(&mut a, 2.0, 1.0, 1.0);
    a.advance(700);
    let replay: Replay =
        serde_json::from_str(&serde_json::to_string(&a.replay()).unwrap()).unwrap();
    assert_eq!(a, World::from_replay(replay).unwrap());
}

#[test]
fn invalid_input_is_atomic() {
    let mut w = sandbox();
    let before = w.clone();
    for radius in [f64::NAN, f64::INFINITY, -1.0, 0.0, 7.0] {
        assert!(w
            .apply(Command::Launch {
                kind: Kind::Rocky,
                radius,
                angle: 0.0,
                speed: 1.0
            })
            .is_err());
        assert_eq!(w, before);
    }
}
