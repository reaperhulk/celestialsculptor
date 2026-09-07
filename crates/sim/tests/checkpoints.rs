use celestial_sim::*;
#[test]
fn checkpoint_continuation_preserves_rng_contacts_ledgers_and_later_commands() {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    w.apply(Command::SeedSwarm {
        count: 511,
        disorder: 0.8,
    })
    .unwrap();
    w.advance(64);
    let checkpoint = w.checkpoint().unwrap();
    w.apply(Command::SeedDisk {
        radius: 2.,
        spread: 0.1,
        disorder: 0.2,
        count: 8,
    })
    .unwrap();
    w.advance(64);
    let mut restore = replay::Reconstruction::from_checkpoint(w.replay(), &checkpoint).unwrap();
    assert_eq!(restore.tick(), 64);
    while !restore.advance(7).unwrap() {}
    assert_eq!(restore.finish().unwrap(), w);
    assert_eq!(World::from_replay(w.replay()).unwrap(), w);
}
#[test]
fn invalid_checkpoint_or_provenance_cannot_replace_an_experiment() {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    w.apply(Command::Launch {
        kind: Kind::Rocky,
        radius: 1.,
        angle: 0.,
        speed: 1.,
    })
    .unwrap();
    w.advance(32);
    let checkpoint = w.checkpoint().unwrap();
    let replay = w.replay();
    for field in ["physics", "mass", "ids"] {
        let mut value: serde_json::Value = serde_json::from_str(&checkpoint).unwrap();
        match field {
            "physics" => value["physics"] = "other".into(),
            "mass" => value["world"]["bodies"][1]["mass"] = (-1.).into(),
            _ => value["world"]["bodies"][1]["id"] = 0.into(),
        }
        assert!(World::from_checkpoint(&value.to_string(), &replay).is_err());
    }
    let mut other = replay.clone();
    other.config.seed += 1;
    assert!(World::from_checkpoint(&checkpoint, &other).is_err());
    other = replay.clone();
    other.end_tick = 0;
    assert!(World::from_checkpoint(&checkpoint, &other).is_err());
    other = replay;
    other.physics = "other".into();
    assert!(World::from_replay(other).is_err());
    assert!(World::new(Config::default()).unwrap().checkpoint().is_err());
}
