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
