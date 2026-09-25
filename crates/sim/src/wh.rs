//! The drift half of the Wisdom–Holman splitting in democratic heliocentric
//! coordinates (Duncan, Levison & Lee 1998; Rein & Tamayo 2015), for systems
//! integrated with the near/far split. The Hamiltonian is Kepler motion about
//! the star, plus a linear "jump" from the star's momentum, plus the body–body
//! interaction. Far interaction kicks bracket each step in inertial
//! coordinates (they conserve the bodies' total momentum, so the star is
//! untouched); this module advances one tick of the rest:
//!
//! jump(dt/2) · [Kepler + near interaction](dt) · jump(dt/2)
//!
//! Near-pair members take `FINE_STEPS` fine steps of near kicks and Kepler
//! drifts (as in MERCURIUS and TRACE); every other body drifts once. Inside
//! the phase bodies hold heliocentric positions and barycentric velocities,
//! with the star at the origin moving at −P/M₀. Contacts only use relative
//! positions, relative velocities and momentum conservation, so they resolve
//! unchanged in these coordinates. The live world and the qualification probe
//! share this code, so they stay bit-identical.
use crate::split::{Near, FINE_STEPS};
use crate::{G, V2};

/// Body storage and contact handling for one drift phase.
pub(crate) trait Phase {
    fn count(&self) -> usize;
    fn id(&self, i: usize) -> u32;
    fn mass(&self, i: usize) -> f64;
    fn pos(&self, i: usize) -> V2;
    fn vel(&self, i: usize) -> V2;
    fn set(&mut self, i: usize, pos: V2, vel: V2);
    /// Distance from the star's centre at which body `i` touches it; zero
    /// when contacts are not resolved.
    fn star_contact(&self, i: usize) -> f64;
    fn near(&self) -> &Near;
    /// Near accelerations at the current positions into `near().accel`.
    fn near_accelerations(&mut self);
    /// Whether any near pair touched during a fine drift of `sweep`.
    fn near_contact_pending(&self, sweep: f64) -> bool;
    /// Resolve contacts among near pairs after a fine drift of `sweep`;
    /// returns whether the body set changed (the near set is then rebuilt).
    fn near_contacts(&mut self, sweep: f64) -> bool;
    /// Resolve star contacts for these ids, then any overlap the candidate
    /// list could not anticipate.
    fn end_contacts(&mut self, star_hits: &[u32]);
}

fn momentum(sys: &impl Phase) -> V2 {
    let mut p = V2::default();
    for i in 1..sys.count() {
        p = p.plus(sys.vel(i).scale(sys.mass(i)));
    }
    p
}
fn jump(sys: &mut impl Phase, dt: f64) {
    let shift = momentum(sys).scale(dt / sys.mass(0));
    for i in 1..sys.count() {
        let (p, v) = (sys.pos(i), sys.vel(i));
        sys.set(i, p.plus(shift), v);
    }
}
/// The star's barycentric velocity, from the bodies' momentum.
fn settle_star(sys: &mut impl Phase) {
    let v = momentum(sys).scale(-1.0 / sys.mass(0));
    let p = sys.pos(0);
    sys.set(0, p, v);
}
fn kepler(sys: &mut impl Phase, i: usize, mu: f64, dt: f64, hits: &mut Vec<u32>) {
    let (p, v) = (sys.pos(i), sys.vel(i));
    let (mut x, mut y, mut vx, mut vy) = (p.x, p.y, v.x, v.y);
    if crate::kepler::drift(
        &mut x,
        &mut y,
        &mut vx,
        &mut vy,
        mu,
        dt,
        sys.star_contact(i),
    ) {
        let id = sys.id(i);
        if !hits.contains(&id) {
            hits.push(id);
        }
    }
    sys.set(i, V2::new(x, y), V2::new(vx, vy));
}
fn near_kick(sys: &mut impl Phase, dt: f64) {
    sys.near_accelerations();
    for k in 0..sys.near().members.len() {
        let i = sys.near().members[k] as usize;
        let a = sys.near().accel[i];
        let (p, v) = (sys.pos(i), sys.vel(i));
        sys.set(i, p, v.plus(a.scale(dt)));
    }
}
/// Bring every near member to time `t` of the phase.
fn catch_up(sys: &mut impl Phase, advanced: &mut [f64], t: f64, mu: f64, hits: &mut Vec<u32>) {
    for k in 0..sys.near().members.len() {
        let i = sys.near().members[k] as usize;
        if advanced[i] < t {
            kepler(sys, i, mu, t - advanced[i], hits);
            advanced[i] = t;
        }
    }
}

/// Advance the Kepler, jump and near parts by `dt`; returns the translation
/// applied on leaving heliocentric coordinates, for anything recorded inside.
pub(crate) fn drift(sys: &mut impl Phase, dt: f64) -> V2 {
    let n = sys.count();
    let (mut total, mut mx, mut mv) = (0.0, V2::default(), V2::default());
    for i in 0..n {
        let m = sys.mass(i);
        total += m;
        mx = mx.plus(sys.pos(i).scale(m));
        mv = mv.plus(sys.vel(i).scale(m));
    }
    let (centre, velocity) = (mx.scale(1.0 / total), mv.scale(1.0 / total));
    let star = sys.pos(0);
    for i in 0..n {
        let (p, v) = (sys.pos(i), sys.vel(i));
        sys.set(i, p.minus(star), v.minus(velocity));
    }
    let mu = G * sys.mass(0);
    let mut hits = Vec::new();
    jump(sys, dt / 2.0);
    let mut advanced = vec![0.0; n];
    if sys.near().active {
        let d = dt / f64::from(FINE_STEPS);
        for step in 0..FINE_STEPS {
            let t = d * f64::from(step);
            catch_up(sys, &mut advanced, t, mu, &mut hits);
            near_kick(sys, d / 2.0);
            let after = d * f64::from(step + 1);
            for k in 0..sys.near().members.len() {
                let i = sys.near().members[k] as usize;
                kepler(sys, i, mu, after - advanced[i], &mut hits);
                advanced[i] = after;
            }
            if sys.near_contact_pending(d) {
                // Orbits recorded with a contact are relative to the star.
                settle_star(sys);
                let ids: Vec<u32> = (0..sys.count()).map(|i| sys.id(i)).collect();
                if sys.near_contacts(d) {
                    // Bodies were merged, split or renumbered: carry each
                    // survivor's time by id; new fragments start now.
                    let mut was: Vec<(u32, f64)> =
                        ids.into_iter().zip(advanced.iter().copied()).collect();
                    was.sort_unstable_by_key(|&(id, _)| id);
                    advanced = (0..sys.count())
                        .map(
                            |i| match was.binary_search_by_key(&sys.id(i), |&(id, _)| id) {
                                Ok(k) => was[k].1,
                                Err(_) => after,
                            },
                        )
                        .collect();
                    catch_up(sys, &mut advanced, after, mu, &mut hits);
                }
            }
            near_kick(sys, d / 2.0);
        }
    }
    for (i, &done) in advanced.iter().enumerate().skip(1) {
        if done < dt {
            kepler(sys, i, mu, dt - done, &mut hits);
        }
    }
    jump(sys, dt / 2.0);
    settle_star(sys);
    sys.end_contacts(&hits);
    // Back to inertial coordinates: the barycentre moved uniformly.
    let (mut total, mut mx) = (0.0, V2::default());
    for i in 0..sys.count() {
        let m = sys.mass(i);
        total += m;
        mx = mx.plus(sys.pos(i).scale(m));
    }
    let shift = centre.plus(velocity.scale(dt)).minus(mx.scale(1.0 / total));
    for i in 0..sys.count() {
        let (p, v) = (sys.pos(i), sys.vel(i));
        sys.set(i, p.plus(shift), v.plus(velocity));
    }
    shift
}
