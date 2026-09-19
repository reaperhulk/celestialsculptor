//! Forces reduced from task groups, however they were split across helpers,
//! are bit-identical to the engine's own evaluation.
use celestial_sim::gravity::ForceHelper;
use celestial_sim::*;

fn swarm(count: u32, disorder: f64) -> World {
    let mut w = World::new(Config {
        mission: None,
        ..Config::default()
    })
    .unwrap();
    w.apply(Command::SeedSwarm { count, disorder }).unwrap();
    w
}

/// Drive a tick with forces from `helpers` independent helper kernels, each
/// owning a fixed subset of the sixteen task groups.
fn parallel_tick(w: &mut World, helpers: usize) {
    let mut kernels: Vec<ForceHelper> = (0..helpers).map(|_| ForceHelper::new()).collect();
    let mut request = w.tick_begin(w.substeps(), true);
    while let Some(rebuild) = request {
        let state = w.force_request();
        let mut groups = vec![Vec::new(); 16];
        for (k, kernel) in kernels.iter_mut().enumerate() {
            let mine: Vec<u32> = (0..16u32)
                .filter(|g| (*g as usize) % helpers == k)
                .collect();
            let out = kernel.compute(&state, rebuild, &mine).unwrap();
            let mut at = 0;
            for g in mine {
                let len = out[at] as usize;
                groups[g as usize] = out[at + 1..at + 1 + len].to_vec();
                at += 1 + len;
            }
        }
        let merged: Vec<f64> = groups.concat();
        assert!(w.force_reduce(&merged, rebuild));
        request = w.tick_resume();
    }
}

#[test]
#[cfg_attr(
    debug_assertions,
    ignore = "large-system workload runs in the release profile"
)]
fn helper_reduction_matches_the_engine_for_any_helper_count() {
    for (count, disorder) in [(600u32, 0.0), (1100, 0.6)] {
        let mut reference = swarm(count, disorder);
        reference.advance(6);
        for helpers in [1usize, 3, 5] {
            let mut w = swarm(count, disorder);
            for _ in 0..6 {
                parallel_tick(&mut w, helpers);
            }
            assert_eq!(w, reference, "{count} bodies with {helpers} helpers");
            assert!(!w.tick_pending());
        }
    }
}

#[test]
#[cfg_attr(
    debug_assertions,
    ignore = "large-system workload runs in the release profile"
)]
fn a_tick_can_fall_back_to_the_engine_mid_flight() {
    let mut reference = swarm(700, 0.3);
    reference.advance(3);
    let mut w = swarm(700, 0.3);
    let mut helper = ForceHelper::new();
    for tick in 0..3 {
        let mut request = w.tick_begin(w.substeps(), true);
        let mut evaluations = 0;
        // Once an evaluation falls back to the engine, the rest of that tick
        // stays there: helpers resynchronise at the next tick's rebuild.
        let mut local = false;
        while let Some(rebuild) = request {
            evaluations += 1;
            local |= (tick + evaluations) % 2 == 0;
            request = if local {
                w.tick_local(rebuild)
            } else {
                let state = w.force_request();
                if !rebuild {
                    // A helper without the tick's partition must decline.
                    assert!(ForceHelper::new().compute(&state, false, &[0]).is_err());
                }
                let out = helper
                    .compute(&state, rebuild, &(0..16).collect::<Vec<u32>>())
                    .unwrap();
                let mut merged = Vec::new();
                let mut at = 0;
                for _ in 0..16 {
                    let len = out[at] as usize;
                    merged.extend_from_slice(&out[at + 1..at + 1 + len]);
                    at += 1 + len;
                }
                assert!(w.force_reduce(&merged, rebuild));
                w.tick_resume()
            };
        }
        // The first tick has no cached forces; later ticks reuse the last evaluation.
        assert_eq!(evaluations, w.substeps() as usize + usize::from(tick == 0));
    }
    assert_eq!(w, reference);
    let mut bad = swarm(700, 0.3);
    let rebuild = bad.tick_begin(bad.substeps(), true).unwrap();
    assert!(!bad.force_reduce(&[0.0; 10], rebuild));
    assert!(bad.tick_pending());
    assert!(bad.tick_local(rebuild).is_some());
}

#[test]
#[cfg_attr(
    debug_assertions,
    ignore = "large-system workload runs in the release profile"
)]
fn a_merge_inside_a_tick_keeps_helpers_in_step() {
    // A merge adds a collision and removes a body in the same substep; the
    // partition must be rebuilt and helpers told so.
    let build = || {
        let mut w = swarm(600, 0.2);
        for angle in [0.0, 0.0004] {
            w.apply(Command::Launch {
                kind: Kind::Rocky,
                radius: 1.5,
                angle,
                speed: 1.0,
            })
            .unwrap();
        }
        w
    };
    let mut reference = build();
    reference.advance(4);
    assert!(reference.collisions > 0, "fixture must merge");
    let mut w = build();
    for _ in 0..4 {
        parallel_tick(&mut w, 2);
    }
    assert_eq!(w, reference);
}
