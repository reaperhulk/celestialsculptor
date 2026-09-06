use crate::{Command, Config, Kind, World};
pub fn system(bodies: usize) -> World {
    assert!((1..=64).contains(&bodies));
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    for i in 1..bodies {
        w.apply(Command::Launch {
            kind: Kind::Rocky,
            radius: 0.5 + i as f64 * 0.08,
            angle: i as f64 * 2.399_963_229_728_653,
            speed: 1.0,
        })
        .unwrap();
    }
    w
}
