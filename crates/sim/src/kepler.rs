//! Exact two-body drift for the Wisdom–Holman splitting: advance one body on
//! its conic about a fixed central mass by `dt`, in universal variables so
//! elliptic, parabolic and hyperbolic orbits share one path (Danby; Wisdom &
//! Hernandez 2015). Laguerre–Conway iteration converges from any start for
//! Kepler's equation, and every transcendental call goes through `libm`, so
//! every build gives the same bits.

/// Stumpff functions c2(z), c3(z).
fn stumpff(z: f64) -> (f64, f64) {
    if z > 0.5 {
        let s = z.sqrt();
        ((1.0 - libm::cos(s)) / z, (s - libm::sin(s)) / (s * s * s))
    } else if z < -0.5 {
        // sinh and cosh from exp, which the build already carries; beyond
        // s = 0.7 neither difference cancels.
        let s = (-z).sqrt();
        let (e, inverse) = (libm::exp(s), libm::exp(-s));
        let (sinh, cosh) = ((e - inverse) / 2.0, (e + inverse) / 2.0);
        ((cosh - 1.0) / -z, (sinh - s) / (s * s * s))
    } else {
        // Eight series terms in Horner form: for |z| <= 0.5 each term shrinks by
        // at least z/((2k+3)(2k+4)), so the ninth is below 1e-19.
        let mut c2 = C2[7];
        let mut c3 = C3[7];
        for k in (0..7).rev() {
            c2 = c2 * -z + C2[k];
            c3 = c3 * -z + C3[k];
        }
        (c2, c3)
    }
}
/// 1/(2k+2)! and 1/(2k+3)! for k = 0..8.
const C2: [f64; 8] = [
    1.0 / 2.0,
    1.0 / 24.0,
    1.0 / 720.0,
    1.0 / 40320.0,
    1.0 / 3628800.0,
    1.0 / 479001600.0,
    1.0 / 87178291200.0,
    1.0 / 20922789888000.0,
];
const C3: [f64; 8] = [
    1.0 / 6.0,
    1.0 / 120.0,
    1.0 / 5040.0,
    1.0 / 362880.0,
    1.0 / 39916800.0,
    1.0 / 6227020800.0,
    1.0 / 1307674368000.0,
    1.0 / 355687428096000.0,
];

/// Advance position `(x, y)` and velocity `(vx, vy)` relative to a central
/// mass with gravitational parameter `mu` by `dt`. Returns whether the body
/// came within `contact` of the centre during the interval: at either end,
/// or at a periapsis passed inside it.
pub fn drift(
    x: &mut f64,
    y: &mut f64,
    vx: &mut f64,
    vy: &mut f64,
    mu: f64,
    dt: f64,
    contact: f64,
) -> bool {
    let (x0, y0, vx0, vy0) = (*x, *y, *vx, *vy);
    let r0 = (x0 * x0 + y0 * y0).sqrt();
    if r0 == 0.0 || dt == 0.0 {
        *x += vx0 * dt;
        *y += vy0 * dt;
        return r0 < contact;
    }
    let sqmu = mu.sqrt();
    let v2 = vx0 * vx0 + vy0 * vy0;
    let sigma0 = (x0 * vx0 + y0 * vy0) / sqmu;
    let alpha = 2.0 / r0 - v2 / mu;
    let target = sqmu * dt;
    // Third-order series of Kepler's equation in chi for the starting guess:
    // target = r0 chi + sigma0 chi^2/2 + (1 - alpha r0) chi^3/6 + ...
    // Valid for steps short against the orbit, which every drift in play is.
    let first = target / r0;
    let mut chi = if (alpha * first * first).abs() < 0.1 {
        first - sigma0 * first * first / (2.0 * r0)
            + (3.0 * sigma0 * sigma0 / r0 - (1.0 - alpha * r0)) * first * first * first / (6.0 * r0)
    } else {
        first
    };
    for _ in 0..50 {
        let z = alpha * chi * chi;
        let (c2, c3) = stumpff(z);
        let chi2 = chi * chi;
        let f = sigma0 * chi2 * c2 + (1.0 - alpha * r0) * chi2 * chi * c3 + r0 * chi - target;
        let df = chi2 * c2 + sigma0 * chi * (1.0 - z * c3) + r0 * (1.0 - z * c2);
        let ddf = sigma0 * (1.0 - z * c2) + (1.0 - alpha * r0) * chi * (1.0 - z * c3);
        // Laguerre–Conway, n = 5.
        let n = 5.0;
        let disc = ((n - 1.0) * (n - 1.0) * df * df - n * (n - 1.0) * f * ddf)
            .abs()
            .sqrt();
        let delta = n * f / (df + df.signum() * disc);
        chi -= delta;
        if delta.abs() <= 1e-15 * chi.abs() {
            break;
        }
    }
    let z = alpha * chi * chi;
    let (c2, c3) = stumpff(z);
    let chi2 = chi * chi;
    let r = chi2 * c2 + sigma0 * chi * (1.0 - z * c3) + r0 * (1.0 - z * c2);
    let f = 1.0 - chi2 * c2 / r0;
    let g = dt - chi2 * chi * c3 / sqmu;
    let fdot = sqmu / (r * r0) * chi * (z * c3 - 1.0);
    let gdot = 1.0 - chi2 * c2 / r;
    *x = f * x0 + g * vx0;
    *y = f * y0 + g * vy0;
    *vx = fdot * x0 + gdot * vx0;
    *vy = fdot * y0 + gdot * vy0;
    if contact <= 0.0 {
        return false;
    }
    if r0 < contact || r < contact {
        return true;
    }
    // Approaching at the start and receding at the end: periapsis lies between.
    if x0 * vx0 + y0 * vy0 < 0.0 && *x * *vx + *y * *vy > 0.0 {
        let h = x0 * vy0 - y0 * vx0;
        let energy = 0.5 * v2 - mu / r0;
        let e = (1.0 + 2.0 * energy * h * h / (mu * mu)).max(0.0).sqrt();
        return h * h / (mu * (1.0 + e)) < contact;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    fn energy(x: f64, y: f64, vx: f64, vy: f64, mu: f64) -> f64 {
        0.5 * (vx * vx + vy * vy) - mu / (x * x + y * y).sqrt()
    }
    #[test]
    fn a_circular_orbit_returns_after_one_period() {
        let mu: f64 = 4.0 * std::f64::consts::PI * std::f64::consts::PI;
        let (mut x, mut y, mut vx, mut vy) = (1.0, 0.0, 0.0, mu.sqrt());
        for _ in 0..512 {
            drift(&mut x, &mut y, &mut vx, &mut vy, mu, 1.0 / 512.0, 0.0);
        }
        assert!((x - 1.0).abs() < 1e-11 && y.abs() < 1e-11, "{x} {y}");
    }
    #[test]
    fn conics_of_every_kind_keep_energy_and_angular_momentum() {
        let mu: f64 = 39.47841760435743;
        for &(speed, dt) in &[
            (0.3, 0.37),
            (1.0, 2.1),
            (1.2, 0.05),
            (std::f64::consts::SQRT_2, 3.0),
            (2.5, 1.7),
        ] {
            let (x0, y0, vx0, vy0) = (0.7, -0.2, -0.4 * speed * mu.sqrt(), speed * mu.sqrt());
            let (mut x, mut y, mut vx, mut vy) = (x0, y0, vx0, vy0);
            drift(&mut x, &mut y, &mut vx, &mut vy, mu, dt, 0.0);
            let (e0, e1) = (energy(x0, y0, vx0, vy0, mu), energy(x, y, vx, vy, mu));
            assert!(
                (e1 - e0).abs() <= 1e-10 * e0.abs().max(1.0),
                "{speed}: {e0} {e1}"
            );
            let (h0, h1) = (x0 * vy0 - y0 * vx0, x * vy - y * vx);
            assert!((h1 - h0).abs() <= 1e-10 * h0.abs(), "{speed}");
            // Time reversal returns to the start.
            drift(&mut x, &mut y, &mut vx, &mut vy, mu, -dt, 0.0);
            assert!((x - x0).abs() + (y - y0).abs() < 1e-9, "{speed} reversal");
        }
    }
    #[test]
    fn a_periapsis_inside_the_contact_radius_is_reported() {
        let mu: f64 = 39.47841760435743;
        // Falling past the centre on a narrow orbit: periapsis 0.01 between samples.
        let (mut x, mut y, mut vx, mut vy) = (1.0, 0.01, -mu.sqrt() * 1.4, 0.0);
        let mut hit = false;
        for _ in 0..64 {
            hit |= drift(&mut x, &mut y, &mut vx, &mut vy, mu, 1.0 / 128.0, 0.05);
        }
        assert!(hit);
        let (mut x, mut y, mut vx, mut vy) = (1.0, 0.0, 0.0, mu.sqrt());
        assert!(!drift(&mut x, &mut y, &mut vx, &mut vy, mu, 0.3, 0.5));
    }
}
