use celestial_sim::*;
fn system() -> World {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    for (radius, angle) in [(0.7, 0.1), (1.4, 2.0), (2.8, 4.0)] {
        w.apply(Command::Launch {
            kind: Kind::Rocky,
            radius,
            angle,
            speed: 0.95,
        })
        .unwrap();
    }
    w
}
fn rotate(v: V2, angle: f64) -> V2 {
    V2 {
        x: v.x * angle.cos() - v.y * angle.sin(),
        y: v.x * angle.sin() + v.y * angle.cos(),
    }
}
#[test]
fn gravity_is_independent_of_the_orientation_of_the_orbital_plane() {
    let mut a = system();
    let mut b = a.clone();
    let angle = 1.234;
    for body in &mut b.bodies {
        body.pos = rotate(body.pos, angle);
        body.vel = rotate(body.vel, angle);
    }
    a.advance(1024);
    b.advance(1024);
    assert_eq!(a.bodies.len(), b.bodies.len());
    for (x, y) in a.bodies.iter().zip(&b.bodies) {
        assert!(rotate(x.pos, angle).minus(y.pos).norm() < 1e-10);
        assert!(rotate(x.vel, angle).minus(y.vel).norm() < 1e-9);
    }
}
#[test]
fn gravity_and_orbit_diagnostics_are_galilean_invariant() {
    let mut a = system();
    let mut b = a.clone();
    let offset = V2 { x: 5.0, y: -3.0 };
    let boost = V2 { x: 0.17, y: -0.31 };
    for body in &mut b.bodies {
        body.pos = body.pos.plus(offset);
        body.vel = body.vel.plus(boost);
    }
    a.advance(1024);
    b.advance(1024);
    for (x, y) in a.bodies.iter().zip(&b.bodies) {
        assert!(
            x.pos
                .plus(offset)
                .plus(boost.scale(2.0))
                .minus(y.pos)
                .norm()
                < 1e-9
        );
        assert!(x.vel.plus(boost).minus(y.vel).norm() < 1e-8);
        assert!((a.orbit(x).eccentricity - b.orbit(y).eccentricity).abs() < 1e-8);
    }
}
