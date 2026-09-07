//! Current gravitational membership is separate from a satellite's origin.
use crate::{Kind, World};
impl World {
    pub(crate) fn refresh_satellites(&mut self) {
        // Compute host radii once, reject distant pairs before orbital elements.
        let hosts: Vec<_> = self
            .bodies
            .iter()
            .enumerate()
            .filter(|(_, b)| b.id != 0 && b.kind != Kind::Dust && b.parent.is_none())
            .filter_map(|(i, b)| self.orbit(b).bound.then_some((i, self.hill_radius(b))))
            .collect();
        let mut changes = vec![];
        for body in self.bodies.iter().skip(1) {
            if body.parent.is_some() && self.moon_orbit(body).is_some() {
                continue;
            }
            let parent = hosts.iter().find_map(|&(i, hill)| {
                let host = &self.bodies[i];
                if body.id == host.id
                    || body.mass > host.mass * 0.1
                    || body.pos.minus(host.pos).norm2() > (hill * 0.5).powi(2)
                {
                    return None;
                }
                let orbit = self.orbit_around(body, host);
                (orbit.bound
                    && orbit.apoapsis < hill * 0.7
                    && orbit.periapsis > body.radius + host.radius)
                    .then_some(host.id)
            });
            if parent != body.parent {
                changes.push((body.id, parent));
            }
        }
        for (id, parent) in changes {
            self.bodies.iter_mut().find(|b| b.id == id).unwrap().parent = parent;
            self.emit(
                "satellite",
                id,
                match parent {
                    Some(host) => format!("World {id} is now bound to World {host}"),
                    None => format!("World {id} left its moon orbit and now travels independently"),
                },
            );
        }
    }
    pub fn burns_available(&self) -> bool {
        !self
            .config
            .mission
            .is_some_and(|m| m < 4 || (self.rules_version >= 3 && (m == 6 || m == 7)))
    }
}
