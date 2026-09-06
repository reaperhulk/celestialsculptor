use celestial_sim::*;
#[test]
fn sandbox_recipes_exhibit_their_advertised_outcomes() {
    let recipes: Vec<serde_json::Value> =
        serde_json::from_str(include_str!("../../../web/recipes.json")).unwrap();
    assert_eq!(recipes.len(), 9);
    for recipe in recipes {
        let config: Config = serde_json::from_value(recipe["config"].clone()).unwrap();
        assert_eq!(config.mission, None);
        let mut w = World::new(config).unwrap();
        for value in recipe["commands"].as_array().unwrap() {
            w.apply(serde_json::from_value(value.clone()).unwrap())
                .unwrap();
        }
        w.advance(if recipe["id"] == "resonance-capture" {
            512 * 80
        } else if recipe["id"] == "resonant-pair" {
            512 * 30
        } else {
            2048
        });
        assert!(w.energy().is_finite());
        assert!(!w.completed);
        match recipe["id"].as_str().unwrap() {
            "quiet-garden" => {
                assert_eq!(w.status().calm, 3);
                assert_eq!(w.status().habitable, 1);
            }
            "crowded-nursery" => assert!(w.collisions > 0),
            "giant-shepherd" => {
                assert_eq!(w.status().calm, 5);
                assert_eq!(w.status().giants, 1);
            }
            "wanderer" => assert_eq!(w.ejections, 1),
            "gravity-assist" => assert_eq!(w.assisted_ejections, 1),
            "opposing-worlds" => assert!(w.collisions > 0 && w.absorbed > 0),
            "moon-family" => assert!(w.status().moons >= 2),
            "resonant-pair" | "resonance-capture" => {
                assert!(w.resonances.iter().any(|r| r.librating))
            }
            _ => panic!("recipe missing an outcome check"),
        }
        assert_eq!(w, World::from_replay(w.replay()).unwrap());
    }
}
