//! Osculating orbital elements, habitable zone and satellite membership tests.
use crate::*;
use std::f64::consts::TAU;

/// Unit vector for a polar angle. Shared by launches, moons and orbit fits.
pub(crate) fn direction(angle: f64) -> V2 {
    V2::new(libm::cos(angle), libm::sin(angle))
}

impl World {
    pub fn hill_radius(&self, body: &Body) -> f64 {
        self.orbit(body).periapsis * libm::cbrt(body.mass / (3.0 * self.bodies[0].mass))
    }
    pub fn moon_orbit(&self, body: &Body) -> Option<Orbit> {
        let id = body.parent?;
        let parent = self.bodies.iter().find(|b| b.id == id)?;
        let mut orbit = self.orbit_around(body, parent);
        {
            orbit.calm = orbit.bound
                && orbit.eccentricity < 0.25
                && orbit.periapsis > body.radius + parent.radius
                && orbit.apoapsis < self.hill_radius(parent) * 0.7;
            orbit.habitable = orbit.calm && self.orbit(body).habitable;
        }
        (orbit.bound && orbit.distance < self.hill_radius(parent)).then_some(orbit)
    }
    pub fn zone(&self) -> (f64, f64) {
        let scale = libm::pow(self.bodies[0].mass, 1.75);
        (0.85 * scale, 1.55 * scale)
    }
    pub fn orbit(&self, body: &Body) -> Orbit {
        self.orbit_around(body, &self.bodies[0])
    }
    pub(crate) fn orbit_around(&self, body: &Body, star: &Body) -> Orbit {
        Self::orbit_in_zone(body, star, self.zone())
    }
    /// Elements about `star` with the habitable zone already known, for loops
    /// over many bodies that would otherwise recompute it for each.
    pub(crate) fn orbit_in_zone(body: &Body, star: &Body, (inner, outer): (f64, f64)) -> Orbit {
        let r = body.pos.minus(star.pos);
        let v = body.vel.minus(star.vel);
        let distance = r.norm().max(1e-12);
        let mu = G * (star.mass + body.mass);
        let energy = v.norm2() / 2.0 - mu / distance;
        let bound = energy < 0.0;
        let eccentricity = (1.0 + 2.0 * energy * r.cross(v).powi(2) / mu.powi(2))
            .max(0.0)
            .sqrt();
        let axis = if bound { -mu / (2.0 * energy) } else { 1e12 };
        let periapsis = if bound {
            axis * (1.0 - eccentricity)
        } else {
            r.cross(v).powi(2) / (mu * (1.0 + eccentricity))
        };
        let apoapsis = if bound {
            axis * (1.0 + eccentricity)
        } else {
            1e12
        };
        let habitable = body.kind != Kind::Giant
            && body.kind != Kind::Dust
            && bound
            && periapsis >= inner
            && apoapsis <= outer
            && body.mass < 10.0 * EARTH;
        let e_vector = r
            .scale(v.norm2() / mu - 1.0 / distance)
            .minus(v.scale((r.x * v.x + r.y * v.y) / mu));
        Orbit {
            periapsis_angle: if eccentricity > 1e-8 {
                libm::atan2(e_vector.y, e_vector.x)
            } else {
                libm::atan2(r.y, r.x)
            },
            period_years: bound.then(|| TAU * (axis.powi(3) / mu).sqrt()),
            distance,
            eccentricity,
            bound,
            periapsis,
            apoapsis,
            habitable,
            calm: bound && eccentricity < 0.25 && periapsis > 0.18 && apoapsis < 7.0,
        }
    }
}
