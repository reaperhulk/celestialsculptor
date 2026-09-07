use celestial_sim::*;
#[test]
fn challenge_feedback_distinguishes_recovery_and_awards_mastery_from_real_outcomes() {
    for scenario in scenarios::campaign().into_iter().filter(|s| {
        s.replay.version == 4 && [Some(4), Some(6), Some(8)].contains(&s.replay.config.mission)
    }) {
        let w = scenario.run().unwrap();
        let assessment = w.assessment(&w.status());
        assert!(!assessment.message.is_empty());
        assert_eq!(assessment.mastery.len(), 2);
        if !w.completed {
            assert!(assessment.mastery.iter().all(|m| !m.earned));
        }
        if scenario.name == "v4-4-garden-swallowed" {
            assert_eq!(assessment.phase, "recover");
        }
        if scenario.name == "v4-6-trailing-flyby" {
            assert!(assessment.mastery.iter().all(|m| m.earned));
        }
        if scenario.name == "v4-8-lighter-resonance" {
            assert!(
                assessment
                    .mastery
                    .iter()
                    .find(|m| m.code == "economy")
                    .unwrap()
                    .earned
            );
        }
    }
}
#[test]
fn resonance_feedback_tolerates_a_body_removed_between_observations() {
    let scenario = scenarios::campaign()
        .into_iter()
        .find(|s| s.name == "v4-8-resonant-giants")
        .unwrap();
    let mut w = scenario.run().unwrap();
    w.completed = false;
    w.bodies.pop();
    let _ = w.assessment(&w.status());
}
