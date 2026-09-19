//! The ten-challenge campaign: definitions, unlock rules, budgets and the
//! objective evaluation that decides when a challenge is complete.
use crate::*;

#[derive(Clone, Copy, Debug, Serialize)]
pub struct Mission {
    pub name: &'static str,
    pub brief: &'static str,
    pub hint: &'static str,
    pub budget: f64,
    pub hold_years: f64,
    pub unlock: &'static str,
}

/// The first three lessons introduce orbits; the next five form a physical
/// formation chapter. The final challenges combine the unlocked mechanics.
pub const MISSIONS: [Mission; 10] = [
    Mission {
        name: "First light",
        brief: "Keep a planet in a calm orbit for 2 years.",
        hint: concat!(
            "Orbital speed balances the star's pull. Start near circular speed and observe ",
            "the blue orbit outline.",
        ),
        budget: 8.0,
        hold_years: 2.0,
        unlock: "Ice worlds",
    },
    Mission {
        name: "A place for life",
        brief: "Keep a world entirely inside the habitable band for 3 years.",
        hint: concat!(
            "Both the closest and farthest point must fit. Adjust speed as well as ",
            "distance.",
        ),
        budget: 12.0,
        hold_years: 3.0,
        unlock: "Stellar mass control",
    },
    Mission {
        name: "A powerful neighbor",
        brief: "Keep 3 small worlds calm for 8 years beside the existing giant.",
        hint: concat!(
            "The giant bends nearby paths. Compare its pull in the inspector and leave room ",
            "around its whole orbit.",
        ),
        budget: 10.0,
        hold_years: 8.0,
        unlock: "Formation chapter",
    },
    Mission {
        name: "From dust to worlds",
        brief: concat!(
            "Form 2 calm planets from debris and keep them for 4 years. Only debris can be ",
            "placed.",
        ),
        hint: concat!(
            "A narrow disk makes encounters likely. Too much speed disorder can destroy the ",
            "calm orbits you need.",
        ),
        budget: 8.0,
        hold_years: 4.0,
        unlock: "Garden formation",
    },
    Mission {
        name: "A garden from dust",
        brief: concat!(
            "Form a calm debris-born world while preserving the original garden for 6 ",
            "years.",
        ),
        hint: concat!(
            "The original garden is World 1. Form another world without swallowing or ",
            "disturbing it.",
        ),
        budget: 8.0,
        hold_years: 6.0,
        unlock: "Giant sculpting",
    },
    Mission {
        name: "The giant's nursery",
        brief: concat!(
            "Form 2 calm worlds from debris inside the giant's orbit; keep them for 8 ",
            "years.",
        ),
        hint: concat!(
            "The outer giant perturbs the nursery. Disk width and disorder decide which ",
            "fragments collide and which survive.",
        ),
        budget: 10.0,
        hold_years: 8.0,
        unlock: "Gravity assists",
    },
    Mission {
        name: "Borrowed momentum",
        brief: concat!(
            "Use the giant to eject a world that began on a bound orbit. Launches are ",
            "capped at 135%; burns are disabled.",
        ),
        hint: concat!(
            "A close flyby can borrow the giant's orbital momentum. Launch just inside its ",
            "orbit, trailing it, and compare nearby starting angles.",
        ),
        budget: 8.0,
        hold_years: 0.0,
        unlock: "Moon creation",
    },
    Mission {
        name: "A family of moons",
        brief: "Keep 2 moons bound to the existing giant for 10 years.",
        hint: concat!(
            "Select World 1 and create moons. Space their orbits apart; compare prograde ",
            "and retrograde motion.",
        ),
        budget: 2.0,
        hold_years: 10.0,
        unlock: "Resonance observatory",
    },
    Mission {
        name: "Celestial clockwork",
        brief: "Observe a bounded resonant angle between two worlds, then hold it for 3 years.",
        hint: concat!(
            "Try two massive worlds with periods near 2:1. A near ratio alone is ",
            "insufficient: the resonant angle must swing back and forth across many orbits.",
        ),
        budget: 1000.0,
        hold_years: 3.0,
        unlock: "System synthesis",
    },
    Mission {
        name: "A system of your own",
        brief: concat!(
            "Keep 2 debris-born calm worlds, a potential garden, and a bound moon together ",
            "for 10 years.",
        ),
        hint: concat!(
            "Combine what you learned: accretion, orbital spacing, a gentle garden and a ",
            "protected satellite orbit.",
        ),
        budget: 1000.0,
        hold_years: 10.0,
        unlock: "Master sculptor",
    },
];

impl World {
    pub fn max_bodies(&self) -> usize {
        if self.config.mission.is_none() {
            MAX_BODIES
        } else {
            MISSION_MAX_BODIES
        }
    }
    pub fn budget(&self) -> f64 {
        self.mission().map_or(10_000.0, |m| m.budget)
    }
    pub fn mission(&self) -> Option<Mission> {
        self.config.mission.map(|m| MISSIONS[m])
    }
    pub fn allowed(&self, kind: Kind) -> bool {
        match self.config.mission {
            Some(3..=5) => kind == Kind::Dust,
            Some(6) => matches!(kind, Kind::Rocky | Kind::Ice),
            Some(7) => false,
            Some(8 | 9) | None => kind != Kind::Star,
            Some(m) => kind == Kind::Rocky || (m >= 1 && kind == Kind::Ice),
        }
    }
    pub fn status(&self) -> Status {
        let mut s = Status {
            collisions: self.collisions,
            grazes: self.grazes,
            disruptions: self.disruptions,
            ejections: self.ejections,
            assisted_ejections: self.assisted_ejections,
            absorbed: self.absorbed,
            available_slots: self.max_bodies().saturating_sub(self.bodies.len()),
            actions_remaining: 2048 - self.commands.len(),
            tools: [Kind::Rocky, Kind::Ice, Kind::Giant, Kind::Dust].map(|kind| ToolAvailability {
                kind,
                cost: kind.cost(),
                min_mass: kind.mass_range().0,
                max_mass: kind.mass_range().1,
                unlocked: self.allowed(kind),
                affordable: self.spent + kind.cost() <= self.budget() + 1e-8,
            }),
            objectives: [None; 3],
            exhausted: self.exhausted(),
            years: self.tick as f64 * DT,
            remaining: (self.budget() - self.spent).max(0.0),
            planets: 0,
            calm: 0,
            habitable: 0,
            giants: 0,
            debris: 0,
            moons: 0,
            grown: 0,
            formed: 0,
            held_years: self.held_ticks as f64 * DT,
            progress: 0.0,
            condition: false,
            completed: self.completed,
            zone_inner: self.zone().0,
            zone_outer: self.zone().1,
        };
        for body in self.bodies.iter().skip(1) {
            let o = self.orbit(body);
            if self.moon_orbit(body).is_some() {
                s.moons += 1;
                continue;
            }
            s.grown += usize::from(body.mergers > 0 && o.calm);
            s.formed += usize::from(body.debris_origin && body.kind != Kind::Dust && o.calm);
            if body.kind == Kind::Dust {
                s.debris += usize::from(o.calm);
            } else {
                s.planets += 1;
                s.calm += usize::from(o.calm);
            }
            s.habitable += usize::from(o.habitable);
            s.giants += usize::from(body.kind == Kind::Giant && o.calm);
        }
        if let Some(m) = self.config.mission {
            let goal = |label, current, target| {
                Some(Objective {
                    label,
                    current,
                    target,
                })
            };
            {
                let garden = self
                    .bodies
                    .iter()
                    .any(|b| b.id == 1 && b.mergers == 0 && self.orbit(b).habitable);
                let inner_formed = self
                    .bodies
                    .iter()
                    .filter(|b| {
                        b.debris_origin
                            && b.kind != Kind::Dust
                            && self.orbit(b).calm
                            && self.bodies.iter().any(|g| {
                                g.kind == Kind::Giant
                                    && self.orbit(b).apoapsis < self.orbit(g).periapsis
                            })
                    })
                    .count();
                s.objectives = match m {
                    2 => [goal("Calm small worlds", s.calm - s.giants, 3), None, None],
                    3 => [goal("Calm worlds from debris", s.formed, 2), None, None],
                    4 => [
                        goal("Calm worlds from debris", s.formed, 1),
                        goal("Original garden preserved", usize::from(garden), 1),
                        None,
                    ],
                    5 => [
                        goal("Calm inner worlds from debris", inner_formed, 2),
                        goal("Giant survives", s.giants, 1),
                        None,
                    ],
                    6 => [
                        goal(
                            "Initially bound worlds ejected",
                            self.assisted_ejections as usize,
                            1,
                        ),
                        None,
                        None,
                    ],
                    7 => [goal("Bound moons", s.moons, 2), None, None],
                    8 => [
                        goal(
                            "Librating resonant pairs",
                            self.resonances.iter().filter(|r| r.librating).count(),
                            1,
                        ),
                        None,
                        None,
                    ],
                    9 => [
                        goal("Calm worlds from debris", s.formed, 2),
                        goal("Potential gardens", s.habitable, 1),
                        goal("Bound moons", s.moons, 1),
                    ],
                    0 => [goal("Calm worlds", s.calm, 1), None, None],
                    1 => [goal("Potential gardens", s.habitable, 1), None, None],
                    _ => [None; 3],
                };
            }
            s.condition = s.objectives.iter().flatten().all(|g| g.current >= g.target);
            s.progress = if self.completed {
                1.0
            } else if self.mission().expect("mission exists").hold_years > 0.0 {
                (s.held_years / self.mission().expect("mission exists").hold_years).min(1.0)
            } else {
                f64::from(s.condition)
            };
        }
        s
    }
}
