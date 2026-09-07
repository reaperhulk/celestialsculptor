use celestial_sim::*;
use std::f64::consts::PI;
fn pair(radius: f64, timescale: f64) -> World {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    for (r, a, speed) in [(1.0, PI, 0.95_f64.sqrt()), (radius, PI / 2.0, 1.0)] {
        w.apply(Command::LaunchMass {
            kind: Kind::Giant,
            mass: 318.0,
            radius: r,
            angle: a,
            speed,
        })
        .unwrap();
    }
    if timescale > 0.0 {
        w.apply(Command::Migration { id: 2, timescale }).unwrap();
    }
    w
}
#[test]
fn gravitational_resonance_librates_across_many_outer_orbits() {
    let mut w = pair(1.5, 0.0);
    w.advance(512 * 160);
    let r = w
        .resonances
        .iter()
        .find(|r| r.librating)
        .expect("bounded resonant angle");
    assert_eq!((r.p, r.q), (2, 1));
    assert!(r.observed_years > 150.0);
    assert!(r.span < PI * 1.7);
    assert_eq!(w, World::from_replay(w.replay()).unwrap());
}
#[test]
fn convergent_disk_migration_can_capture_a_pair_into_resonance() {
    let mut migrated = pair(1.7, 500.0);
    let mut control = pair(1.7, 0.0);
    let p = migrated.momentum();
    let angular = migrated.angular_momentum();
    migrated.advance(512 * 160);
    control.advance(512 * 160);
    assert!(migrated
        .resonances
        .iter()
        .any(|r| r.librating && r.p == 2 && r.q == 1));
    assert!(!control.resonances.iter().any(|r| r.librating));
    assert!(
        migrated
            .momentum()
            .plus(migrated.disk_momentum)
            .minus(p)
            .norm()
            < 1e-11
    );
    assert!((migrated.angular_momentum() + migrated.disk_angular_momentum - angular).abs() < 1e-10);
}
#[test]
fn a_near_integer_period_ratio_is_not_sufficient_evidence_of_libration() {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    for r in [1.0, 2.0_f64.powf(2.0 / 3.0)] {
        w.apply(Command::Launch {
            kind: Kind::Rocky,
            radius: r,
            angle: 0.0,
            speed: 1.0,
        })
        .unwrap();
    }
    w.advance(512 * 100);
    assert!(!w.resonances.iter().any(|r| r.librating));
}

#[test]
fn axial_rotation_preserves_observed_resonance_and_hold_time() {
    let mut w = pair(1.5, 0.);
    w.advance(512 * 160);
    let readings = w.resonances.clone();
    let held = w.held_ticks;
    assert!(readings.iter().any(|r| r.librating));
    w.apply(Command::Spin { id: 1, rate: -1. }).unwrap();
    assert_eq!(w.resonances, readings);
    assert_eq!(w.held_ticks, held);
    assert_eq!(w, World::from_replay(w.replay()).unwrap());
}
