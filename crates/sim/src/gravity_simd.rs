use crate::{G, V2};
use core::arch::wasm32::*;

// Two independent pairs per vector. Keep each body's additions in scalar order
// and update both sides of every pair; no reassociation or relaxed SIMD.
pub fn accelerations(x: &[f64], y: &[f64], mass: &[f64], softening2: f64, a: &mut [V2]) {
    for i in 0..x.len() {
        range(x, y, mass, &[], softening2, a, i, i + 1, x.len());
    }
}
/// Far parts only, for a system with near/far cutoffs.
pub fn accelerations_cut(
    x: &[f64],
    y: &[f64],
    mass: &[f64],
    cut: &[f64],
    softening2: f64,
    a: &mut [V2],
) {
    for i in 0..x.len() {
        range(x, y, mass, cut, softening2, a, i, i + 1, x.len());
    }
}
#[inline]
#[allow(clippy::too_many_arguments)]
pub(crate) fn range(
    x: &[f64],
    y: &[f64],
    mass: &[f64],
    cut: &[f64],
    softening2: f64,
    a: &mut [V2],
    i: usize,
    start: usize,
    end: usize,
) {
    // Staged together by the caller; make the SAFETY argument below explicit.
    assert!(end <= x.len() && x.len() == y.len() && y.len() == mass.len() && end <= a.len());
    assert!(cut.is_empty() || cut.len() == x.len());
    let p = V2::new(x[i], y[i]);
    let mut j = start;
    // SAFETY: equal-length slices are staged together; j+1 is in bounds.
    // v128_load permits unaligned addresses and reads exactly two f64 lanes.
    while j + 1 < end {
        let dx = f64x2_sub(
            unsafe { v128_load(x.as_ptr().add(j).cast()) },
            f64x2_splat(p.x),
        );
        let dy = f64x2_sub(
            unsafe { v128_load(y.as_ptr().add(j).cast()) },
            f64x2_splat(p.y),
        );
        let raw = f64x2_add(f64x2_mul(dx, dx), f64x2_mul(dy, dy));
        let r2 = f64x2_add(raw, f64x2_splat(softening2));
        // Same operations per lane as the scalar far kernel, so scalar and
        // SIMD builds stay bit-identical.
        let numerator = if cut.is_empty() {
            f64x2_splat(G)
        } else {
            let w0 = crate::split::far_weight(f64x2_extract_lane::<0>(raw), cut[i].max(cut[j]));
            let w1 = crate::split::far_weight(f64x2_extract_lane::<1>(raw), cut[i].max(cut[j + 1]));
            f64x2_mul(f64x2_splat(G), f64x2(w0, w1))
        };
        let scale = f64x2_div(numerator, f64x2_mul(r2, f64x2_sqrt(r2)));
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
    if j < end {
        let d = V2::new(x[j], y[j]).minus(p);
        let raw = d.norm2();
        let r2 = raw + softening2;
        let numerator = if cut.is_empty() {
            G
        } else {
            G * crate::split::far_weight(raw, cut[i].max(cut[j]))
        };
        let f = d.scale(numerator / (r2 * r2.sqrt()));
        a[i] = a[i].plus(f.scale(mass[j]));
        a[j] = a[j].minus(f.scale(mass[i]));
    }
}
