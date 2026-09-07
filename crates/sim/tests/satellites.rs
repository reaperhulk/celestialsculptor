use celestial_sim::*;
use std::f64::consts::PI;
fn moon(speed: f64, angle: f64) -> World {
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
    w.apply(Command::LaunchMoon {
        parent: 1,
        kind: Kind::Rocky,
        mass: 0.003,
        distance: 0.05,
        angle,
        speed,
    })
    .unwrap();
    w
}
#[test]
fn moon_burns_use_the_host_frame_at_all_phases_and_in_both_directions() {
    for speed in [-1., 1.] {
        for angle in [0., PI / 2., PI] {
            let mut w = moon(speed, angle);
            let before = w.bodies[2].clone();
            let relative = before.vel.minus(w.bodies[1].vel);
            w.apply(Command::Nudge {
                id: 2,
                tangential: 0.1,
                radial: 0.,
            })
            .unwrap();
            let delta = w.bodies[2].vel.minus(before.vel);
            assert!(delta.minus(relative.scale(0.1)).norm() < 1e-12);
            assert_eq!(w.bodies[2].pos, before.pos);
            assert_eq!(w, World::from_replay(w.replay()).unwrap());
        }
    }
}
#[test]
fn circular_moons_are_calm_and_released_satellites_keep_their_origin() {
    let mut w = moon(1., PI / 2.);
    assert!(w.moon_orbit(&w.bodies[2]).unwrap().calm);
    let host = w.bodies[1].clone();
    w.bodies[2].vel = host.vel.plus(w.bodies[2].vel.minus(host.vel).scale(3.));
    w.advance(8);
    assert_eq!(w.bodies[2].parent, None);
    assert_eq!(w.bodies[2].origin_parent, Some(1));
    assert_eq!(w.status().moons, 0);
}
#[test]
fn transferred_moons_are_classified_by_their_current_host() {
    let mut w = moon(1., 0.);
    w.apply(Command::LaunchMass {
        kind: Kind::Giant,
        mass: 318.,
        radius: 5.,
        angle: PI,
        speed: 1.,
    })
    .unwrap();
    let host = w.bodies[3].clone();
    let relative = w.bodies[2].vel.minus(w.bodies[1].vel);
    w.bodies[2].pos = host.pos.plus(V2::new(0.05, 0.));
    w.bodies[2].vel = host.vel.plus(relative);
    w.advance(8);
    assert_eq!(w.bodies[2].parent, Some(3));
    assert_eq!(w.bodies[2].origin_parent, Some(1));
    assert!(w.events.iter().any(|e| e.kind == "satellite"));
}
#[test]
fn legacy_moon_burns_retain_their_original_star_frame() {
    let mut replay = moon(1., PI / 2.).replay();
    replay.version = 3;
    let mut w = World::from_replay(replay).unwrap();
    let before = w.bodies[2].vel;
    let relative = before.minus(w.bodies[1].vel).norm();
    w.apply(Command::Nudge {
        id: 2,
        tangential: 0.1,
        radial: 0.,
    })
    .unwrap();
    assert!(w.bodies[2].vel.minus(before).norm() / relative > 0.4);
    assert_eq!(w, World::from_replay(w.replay()).unwrap());
}
