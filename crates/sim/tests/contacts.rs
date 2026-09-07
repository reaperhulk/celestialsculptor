use celestial_sim::*;
fn crossing(offset: f64) -> World {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    for angle in [0.0, 0.1] {
        w.apply(Command::Launch {
            kind: Kind::Dust,
            radius: 2.0,
            angle,
            speed: 1.0,
        })
        .unwrap();
    }
    w.bodies[1].pos = V2::new(2.0, -0.009);
    w.bodies[2].pos = V2::new(2.0 + offset, 0.009);
    w.bodies[1].vel = V2::new(0.0, 40.0);
    w.bodies[2].vel = V2::new(0.0, -40.0);
    w.rules_version = 4;
    w
}
#[test]
fn fast_crossing_bodies_cannot_tunnel_between_substeps() {
    let mut w = crossing(0.0);
    let momentum = w.momentum();
    w.step();
    assert_eq!(w.collisions, 1);
    assert_eq!(w.bodies.len(), 2);
    assert!(w.momentum().minus(momentum).norm() < 1e-13);
}
#[test]
fn nearby_fast_flyby_does_not_create_a_false_collision() {
    let mut w = crossing(0.04);
    w.step();
    assert_eq!(w.collisions, 0);
    assert_eq!(w.bodies.len(), 3);
}

#[test]
fn a_late_merger_resolves_new_contacts_with_previously_checked_bodies() {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    for angle in [0.0, 0.1, 0.2] {
        w.apply(Command::Launch {
            kind: Kind::Rocky,
            radius: 1.0,
            angle,
            speed: 1.0,
        })
        .unwrap();
    }
    w.bodies[1].pos = V2::new(1.0, 0.0);
    w.bodies[1].vel = V2::default();
    w.bodies[2].pos = V2::new(1.0043, -0.04);
    w.bodies[2].vel = V2::new(0.0, 24.0);
    w.bodies[3].pos = V2::new(1.0043, 0.04);
    w.bodies[3].vel = V2::new(0.0, -24.0);
    w.rules_version = 4;
    let momentum = w.momentum();
    w.step();
    assert_eq!(w.collisions, 2);
    assert_eq!(w.bodies.len(), 2);
    assert!(w.momentum().minus(momentum).norm() < 1e-13);
}
