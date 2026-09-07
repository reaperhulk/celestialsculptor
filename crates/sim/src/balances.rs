//! Resolved balances plus transfers to removed bodies and the unresolved disk.
//! Commands are external interventions: compare balances between edits.
use crate::{World, V2};
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
            complete_contact_ledger: self.rules_version >= 5,
        }
    }
}
