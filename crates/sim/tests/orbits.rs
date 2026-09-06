use celestial_sim::*;
#[test]
fn measured_period_follows_keplers_third_law() {
    for radius in [0.5_f64, 1.0, 2.0, 4.0] {
        let mut w = World::new(Config {
            mission: None,
            ..Config::default()
        })
        .unwrap();
        w.apply(Command::Launch {
            kind: Kind::Rocky,
            radius,
            angle: 0.0,
            speed: 1.0,
        })
        .unwrap();
        let orbit = w.orbit(&w.bodies[1]);
        let expected = (radius.powi(3) / (1.0 + EARTH)).sqrt();
        assert!((orbit.period_years.unwrap() - expected).abs() < 1e-10);
    }
}
#[test]
fn escaping_body_has_no_orbital_period() {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    w.apply(Command::Launch {
        kind: Kind::Rocky,
        radius: 1.0,
        angle: 0.0,
        speed: 1.8,
    })
    .unwrap();
    assert_eq!(w.orbit(&w.bodies[1]).period_years, None);
}
#[test]
fn simulated_return_times_follow_keplers_law_for_circular_and_elliptical_worlds() {
    for star_mass in [0.6, 1.5] {
        for radius in [0.5_f64, 1.0, 2.0] {
            for speed in [0.8_f64, 1.0, 1.1] {
                let mut w = World::new(Config {
                    star_mass,
                    mission: None,
                    ..Config::default()
                })
                .unwrap();
                w.apply(Command::Launch {
                    kind: Kind::Rocky,
                    radius,
                    angle: 0.0,
                    speed,
                })
                .unwrap();
                let semi_major = radius / (2.0 - speed * speed);
                let expected = (semi_major.powi(3) / (star_mass + EARTH)).sqrt();
                let mut previous_y = 0.0;
                let mut measured = None;
                for _ in 0..(expected * 1.1 / DT).ceil() as u32 {
                    w.step();
                    let relative = w.bodies[1].pos.minus(w.bodies[0].pos);
                    if previous_y < 0.0 && relative.y >= 0.0 && relative.x > 0.0 {
                        measured = Some(
                            (w.tick as f64 - 1.0 + (-previous_y) / (relative.y - previous_y)) * DT,
                        );
                        break;
                    }
                    previous_y = relative.y;
                }
                let actual = measured.expect("world should return across its initial direction");
                assert!(
                    (actual / expected - 1.0).abs() < 0.001,
                    "measured {actual}, predicted {expected}"
                );
            }
        }
    }
}
