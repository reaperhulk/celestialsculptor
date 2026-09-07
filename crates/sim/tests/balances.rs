use celestial_sim::*;
#[test]
fn escapes_and_disk_torques_retain_the_open_system_balances() {
    for migrate in [false, true] {
        let mut w = World::new(Config {
            mission: None,
            ..Config::default()
        })
        .unwrap();
        w.apply(Command::LaunchMass {
            kind: Kind::Rocky,
            mass: 1.,
            radius: 1.,
            angle: 0.,
            speed: if migrate { 1. } else { 1.7 },
        })
        .unwrap();
        if migrate {
            w.apply(Command::Migration {
                id: 1,
                timescale: 100.,
            })
            .unwrap();
        }
        let initial = w.balances();
        w.advance(512 * 12);
        let final_state = w.balances();
        assert!((initial.mass - final_state.mass).abs() < 1e-14);
        assert!(initial.momentum.minus(final_state.momentum).norm() < 1e-13);
        assert!((initial.angular_momentum - final_state.angular_momentum).abs() < 1e-13);
        assert!((initial.energy_balance - final_state.energy_balance).abs() < 1e-8);
        if !migrate {
            assert_eq!(w.ejections, 1);
            assert!(w.escaped_momentum.norm() > 0.);
        } else {
            assert!(w.disk_energy > 0.);
        }
        assert_eq!(w, World::from_replay(w.replay()).unwrap());
    }
}
