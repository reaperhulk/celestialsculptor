//! Readable challenge feedback and optional mastery derive from authoritative state.
use crate::{Command, Status, World};
use serde::Serialize;
#[derive(Serialize)]
pub struct Mastery {
    pub code: &'static str,
    pub label: String,
    pub earned: bool,
}
#[derive(Serialize)]
pub struct Assessment {
    pub phase: &'static str,
    pub message: String,
    pub evidence: Vec<String>,
    pub mastery: Vec<Mastery>,
}
impl World {
    pub fn assessment(&self, status: &Status) -> Assessment {
        let mut result=Assessment {phase:"explore",message:"Follow a question, observe an encounter, then compare a changed starting condition.".into(),evidence:vec![],mastery:vec![]};
        let Some(mission) = self.config.mission else {
            return result;
        };
        let edits = self
            .commands
            .iter()
            .filter(|c| !matches!(c.command, Command::Spin { .. }))
            .count();
        result.phase = if status.completed {
            "complete"
        } else if edits == 0 {
            "setup"
        } else {
            "observe"
        };
        result.message = if status.completed {
            "Discovery complete. Your experiment remains available for comparison.".into()
        } else if status.condition {
            format!(
                "Conditions are met. Keep them together for {:.1} more years.",
                (self.mission().unwrap().hold_years - status.held_years).max(0.)
            )
        } else {
            "Change one condition, run the system, and inspect what it changes.".into()
        };

        let limits = match mission {
            4 => Some((6., 1)),
            6 => Some((1., 1)),
            7 => Some((0.05, 2)),
            8 => Some((250., 2)),
            _ => None,
        };
        if let Some((matter, actions)) = limits {
            result.mastery = vec![
                Mastery {
                    code: "economy",
                    label: format!("Economy · use at most {matter} matter"),
                    earned: status.completed && self.spent <= matter + 1e-8,
                },
                Mastery {
                    code: "restraint",
                    label: format!("Restraint · at most {actions} orbital edits"),
                    earned: status.completed && edits <= actions,
                },
            ];
        }
        if mission == 4 {
            let garden = self.bodies.iter().find(|b| b.id == 1 && b.mergers == 0);
            if let Some(body) = garden {
                let orbit = self.orbit(body);
                result.evidence.push(format!(
                    "Original garden: closest {:.2} AU, farthest {:.2} AU; eccentricity {:.3}.",
                    orbit.periapsis, orbit.apoapsis, orbit.eccentricity
                ));
                if !status.condition && !status.completed {
                    result.message="A compact nursery encourages meetings. Its orbit must leave room for the original garden's whole path.".into();
                }
            } else if !status.completed {
                result.phase = "recover";
                result.message="The original garden was lost or merged. Review the impact, return to before it, and try a nursery with more separation.".into();
            }
        }
        if mission == 6 && !status.completed {
            let unbound = self
                .bodies
                .iter()
                .skip(1)
                .find(|b| b.id != 1 && !self.orbit(b).bound && b.initially_bound);
            if let Some(body) = unbound {
                result.message = format!(
                    "World {} has become unbound. Keep watching until it crosses 8 AU.",
                    body.id
                );
            } else {
                result.message="Arrival time matters. Change the launch angle to meet the giant; compare orbital size before and after the flyby.".into();
            }
        }
        if mission == 8 && !status.completed {
            if self.resonances.is_empty() {
                result.message="Start by studying the resonance example. A simple period ratio creates a candidate; the resonant angle must then swing back and forth.".into();
            }
            for reading in self.resonances.iter().take(3) {
                let Some(outer) = self.bodies.iter().find(|b| b.id == reading.outer) else {
                    continue;
                };
                let orbit = self.moon_orbit(outer).unwrap_or_else(|| self.orbit(outer));
                result.evidence.push(format!("Worlds {} & {}: {:.3} period ratio; {:.1} of at least {:.1} years observed. {}",reading.inner,reading.outer,reading.ratio,reading.observed_years,8.*orbit.period_years.unwrap_or(0.),if reading.librating {"Bounded reversing angle."} else {"Watch the angle graph, not just the ratio."}));
            }
        }
        result
    }
}
