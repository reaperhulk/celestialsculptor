use celestial_sim::*;
fn swarm(count: u32) -> World {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    w.apply(Command::SeedSwarm {
        count: count - 1,
        disorder: 0.,
    })
    .unwrap();
    w
}
#[test]
fn large_swarms_are_massive_bounded_and_replayable() {
    let mut w = swarm(1024);
    assert_eq!(w.bodies.len(), 1024);
    assert!((w.bodies.iter().skip(1).map(|b| b.mass).sum::<f64>() / EARTH - 16.).abs() < 1e-10);
    w.advance(128);
    assert_eq!(w.tick, 128);
    assert_eq!(World::from_replay(w.replay()).unwrap(), w);
    let max = swarm(MAX_BODIES as u32);
    assert_eq!(max.bodies.len(), MAX_BODIES);
    let mut restored = World::from_replay(max.replay()).unwrap();
    let before = restored.clone();
    assert!(restored
        .apply(Command::SeedSwarm {
            count: 4,
            disorder: 0.
        })
        .is_err());
    assert_eq!(restored, before);
    let mut legacy = max.replay();
    legacy.version = 5;
    assert!(World::from_replay(legacy).is_err());
}
#[test]
fn large_orbital_system_converges_with_direct_gravity_and_conserves_balances() {
    let mut tree = swarm(512);
    let mut exact = tree.clone();
    let energy = tree.energy();
    let momentum = tree.momentum();
    let angular = tree.angular_momentum();
    for _ in 0..4 {
        tree.advance(256);
        benchmark::advance_exact(&mut exact, 256);
    }
    assert_eq!(tree.bodies.len(), exact.bodies.len());
    let error = tree
        .bodies
        .iter()
        .zip(&exact.bodies)
        .map(|(a, b)| a.pos.minus(b.pos).norm2())
        .sum::<f64>();
    assert!(
        (error / tree.bodies.len() as f64).sqrt() < 1e-4,
        "trajectory RMS {error}"
    );
    assert!(tree.momentum().minus(momentum).norm() < 1e-12);
    assert!((tree.angular_momentum() - angular).abs() < 1e-12);
    assert!(((tree.energy() + tree.collision_energy - energy) / energy).abs() < 1e-4);
}
#[test]
fn moons_and_retrograde_orbits_survive_with_a_gravitating_swarm() {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    w.apply(Command::LaunchMass {
        kind: Kind::Giant,
        mass: 318.,
        radius: 3.,
        angle: 0.,
        speed: 1.,
    })
    .unwrap();
    for (distance, speed) in [(0.035, 1.), (0.075, -1.)] {
        w.apply(Command::LaunchMoon {
            parent: 1,
            kind: Kind::Rocky,
            mass: 0.003,
            distance,
            angle: 1.,
            speed,
        })
        .unwrap();
    }
    w.apply(Command::SeedSwarm {
        count: 508,
        disorder: 0.,
    })
    .unwrap();
    w.advance(2048);
    assert!(w
        .moon_orbit(w.bodies.iter().find(|b| b.id == 2).unwrap())
        .is_some());
    assert!(w
        .moon_orbit(w.bodies.iter().find(|b| b.id == 3).unwrap())
        .is_some());
}
