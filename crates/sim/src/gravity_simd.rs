use crate::{G, V2};
use core::arch::wasm32::*;

// Two independent pairs per vector. Keep each body's additions in scalar order
// and update both sides of every pair; no reassociation or relaxed SIMD.
pub fn accelerations(x: &[f64], y: &[f64], mass: &[f64], softening2: f64, a: &mut [V2]) {
    for i in 0..x.len() {
        let p = V2::new(x[i], y[i]);
        let mut j = i + 1;
        // SAFETY: equal-length slices are staged together; j+1 is in bounds.
        // v128_load permits unaligned addresses and reads exactly two f64 lanes.
        while j + 1 < x.len() {
            let dx = f64x2_sub(
                unsafe { v128_load(x.as_ptr().add(j).cast()) },
                f64x2_splat(p.x),
            );
            let dy = f64x2_sub(
                unsafe { v128_load(y.as_ptr().add(j).cast()) },
                f64x2_splat(p.y),
            );
            let r2 = f64x2_add(
                f64x2_add(f64x2_mul(dx, dx), f64x2_mul(dy, dy)),
                f64x2_splat(softening2),
            );
            let scale = f64x2_div(f64x2_splat(G), f64x2_mul(r2, f64x2_sqrt(r2)));
            let fx = f64x2_mul(dx, scale);
            let fy = f64x2_mul(dy, scale);
            let m = unsafe { v128_load(mass.as_ptr().add(j).cast()) };
            let ix = f64x2_mul(fx, m);
            let iy = f64x2_mul(fy, m);
            a[i].x += f64x2_extract_lane::<0>(ix);
            a[i].y += f64x2_extract_lane::<0>(iy);
            a[i].x += f64x2_extract_lane::<1>(ix);
            a[i].y += f64x2_extract_lane::<1>(iy);
            let jx = f64x2_mul(fx, f64x2_splat(mass[i]));
            let jy = f64x2_mul(fy, f64x2_splat(mass[i]));
            a[j].x -= f64x2_extract_lane::<0>(jx);
            a[j].y -= f64x2_extract_lane::<0>(jy);
            a[j + 1].x -= f64x2_extract_lane::<1>(jx);
            a[j + 1].y -= f64x2_extract_lane::<1>(jy);
            j += 2;
        }
        if j < x.len() {
            let d = V2::new(x[j], y[j]).minus(p);
            let r2 = d.norm2() + softening2;
            let f = d.scale(G / (r2 * r2.sqrt()));
            a[i] = a[i].plus(f.scale(mass[j]));
            a[j] = a[j].minus(f.scale(mass[i]));
        }
    }
}
