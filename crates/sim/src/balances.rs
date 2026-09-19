//! Resolved balances plus transfers to removed bodies and the unresolved disk.
//! Commands are external interventions: compare balances between edits.
use crate::{World, G, SOFTENING, V2};
use serde::Serialize;
#[derive(Serialize)]
pub struct Balances {
    pub mass: f64,
    pub momentum: V2,
    pub angular_momentum: f64,
    pub resolved_energy: f64,
    pub collision_transfer: f64,
    pub disk_transfer: f64,
    pub escape_transfer: f64,
    pub energy_balance: f64,
    pub complete_contact_ledger: bool,
}
impl World {
    pub fn balances(&self) -> Balances {
        let energy = self.energy();
        Balances {
            mass: self.bodies.iter().map(|b| b.mass).sum::<f64>() + self.escaped_mass,
            momentum: self
                .momentum()
                .plus(self.disk_momentum)
                .plus(self.escaped_momentum),
            angular_momentum: self.angular_momentum()
                + self.disk_angular_momentum
                + self.escaped_angular_momentum,
            resolved_energy: energy,
            collision_transfer: self.collision_energy,
            disk_transfer: self.disk_energy,
            escape_transfer: self.escaped_energy,
            energy_balance: energy + self.collision_energy + self.disk_energy + self.escaped_energy,
            complete_contact_ledger: true,
        }
    }
    /// Only pairs touching changed bodies can change during an instantaneous impact.
    /// Compute the O(kN) ledger without summing unchanged interactions.
    pub(crate) fn affected_energy(&self, ids: &[u32]) -> f64 {
        let changed: Vec<_> = self.bodies.iter().filter(|b| ids.contains(&b.id)).collect();
        let mut energy = changed
            .iter()
            .map(|b| 0.5 * b.mass * b.vel.norm2())
            .sum::<f64>();
        let soft2 = SOFTENING.powi(2);
        for (i, a) in changed.iter().enumerate() {
            for b in &self.bodies {
                if !ids.contains(&b.id) {
                    energy -= G * a.mass * b.mass / (a.pos.minus(b.pos).norm2() + soft2).sqrt();
                }
            }
            for b in changed.iter().skip(i + 1) {
                energy -= G * a.mass * b.mass / (a.pos.minus(b.pos).norm2() + soft2).sqrt();
            }
        }
        energy
    }
    pub fn energy(&self) -> f64 {
        let mut e: f64 = self
            .bodies
            .iter()
            .map(|b| 0.5 * b.mass * b.vel.norm2())
            .sum();
        for i in 0..self.bodies.len() {
            for j in i + 1..self.bodies.len() {
                e -= G * self.bodies[i].mass * self.bodies[j].mass
                    / (self.bodies[i].pos.minus(self.bodies[j].pos).norm2() + SOFTENING.powi(2))
                        .sqrt();
            }
        }
        e
    }
    pub fn momentum(&self) -> V2 {
        self.bodies
            .iter()
            .fold(V2::default(), |p, b| p.plus(b.vel.scale(b.mass)))
    }
    pub fn angular_momentum(&self) -> f64 {
        self.bodies
            .iter()
            .map(|b| b.mass * b.pos.cross(b.vel) + b.spin)
            .sum()
    }
}
