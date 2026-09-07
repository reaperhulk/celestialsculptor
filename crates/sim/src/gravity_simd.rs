use crate::{Body, G, MAX_BODIES, V2};
use core::arch::wasm32::*;

// Two independent pairs per vector. Keep each body's additions in scalar order
// and update both sides of every pair; no reassociation or relaxed SIMD.
pub fn accelerations(bodies: &[Body], softening2: f64) -> [V2; MAX_BODIES] {
    let mut a = [V2::default(); MAX_BODIES];
    for i in 0..bodies.len() {
        let p = bodies[i].pos;
        let mut j = i + 1;
        while j + 1 < bodies.len() {
            let dx = f64x2_sub(
                f64x2(bodies[j].pos.x, bodies[j + 1].pos.x),
                f64x2_splat(p.x),
            );
            let dy = f64x2_sub(
                f64x2(bodies[j].pos.y, bodies[j + 1].pos.y),
                f64x2_splat(p.y),
            );
            let r2 = f64x2_add(
                f64x2_add(f64x2_mul(dx, dx), f64x2_mul(dy, dy)),
                f64x2_splat(softening2),
            );
            let scale = f64x2_div(f64x2_splat(G), f64x2_mul(r2, f64x2_sqrt(r2)));
            let fx = f64x2_mul(dx, scale);
            let fy = f64x2_mul(dy, scale);
            let m = f64x2(bodies[j].mass, bodies[j + 1].mass);
            let ix = f64x2_mul(fx, m);
            let iy = f64x2_mul(fy, m);
            a[i].x += f64x2_extract_lane::<0>(ix);
            a[i].y += f64x2_extract_lane::<0>(iy);
            a[i].x += f64x2_extract_lane::<1>(ix);
            a[i].y += f64x2_extract_lane::<1>(iy);
            let jx = f64x2_mul(fx, f64x2_splat(bodies[i].mass));
            let jy = f64x2_mul(fy, f64x2_splat(bodies[i].mass));
            a[j].x -= f64x2_extract_lane::<0>(jx);
            a[j].y -= f64x2_extract_lane::<0>(jy);
            a[j + 1].x -= f64x2_extract_lane::<1>(jx);
            a[j + 1].y -= f64x2_extract_lane::<1>(jy);
            j += 2;
        }
        if j < bodies.len() {
            let d = bodies[j].pos.minus(p);
            let r2 = d.norm2() + softening2;
            let f = d.scale(G / (r2 * r2.sqrt()));
            a[i] = a[i].plus(f.scale(bodies[j].mass));
            a[j] = a[j].minus(f.scale(bodies[i].mass));
        }
    }
    a
}
