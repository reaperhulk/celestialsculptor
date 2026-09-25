use crate::{G, V2};
use core::arch::wasm32::*;

// Two independent pairs per vector. Keep each body's additions in scalar order
// and update both sides of every pair; no reassociation or relaxed SIMD.
pub fn accelerations(x: &[f64], y: &[f64], mass: &[f64], softening2: f64, a: &mut [V2]) {
    for i in 0..x.len() {
        range(x, y, mass, &[], softening2, a, i, i + 1, x.len());
    }
}
/// Far parts only, for a system with near/far cutoffs. The star's row takes
/// the star rule of `split::pair_cut`, which the vector rows cannot express.
pub fn accelerations_cut(
    x: &[f64],
    y: &[f64],
    mass: &[f64],
    cut: &[f64],
    softening2: f64,
    a: &mut [V2],
) {
    for j in 1..x.len() {
        crate::gravity_tree::direct_pair_cut(0, j, x, y, mass, cut, softening2, a);
    }
    for i in 1..x.len() {
        range(x, y, mass, cut, softening2, a, i, i + 1, x.len());
    }
}
/// Rows `rows.0..rows.1` in order, each against `cols` or, for a `triangle`,
/// against the bodies after it up to `cols.1`: `range` row by row.
#[allow(clippy::too_many_arguments)]
pub(crate) fn block(
    x: &[f64],
    y: &[f64],
    mass: &[f64],
    cut: &[f64],
    softening2: f64,
    a: &mut [V2],
    rows: (usize, usize),
    cols: (usize, usize),
    triangle: bool,
) {
    for i in rows.0..rows.1 {
        let start = if triangle { i + 1 } else { cols.0 };
        range(x, y, mass, cut, softening2, a, i, start, cols.1);
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
    // Two loops rather than a per-pair test, so the plain kernel keeps its
    // original hot loop when a row has no cutoffs.
    if cut.is_empty() {
        range_plain(x, y, mass, softening2, a, i, start, end);
    } else {
        range_cut(x, y, mass, cut, softening2, a, i, start, end);
    }
}
#[inline]
#[allow(clippy::too_many_arguments)]
fn range_plain(
    x: &[f64],
    y: &[f64],
    mass: &[f64],
    softening2: f64,
    a: &mut [V2],
    i: usize,
    start: usize,
    end: usize,
) {
    // Staged together by the caller; make the SAFETY argument below explicit.
    assert!(end <= x.len() && x.len() == y.len() && y.len() == mass.len() && end <= a.len());
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
    if j < end {
        let d = V2::new(x[j], y[j]).minus(p);
        let r2 = d.norm2() + softening2;
        let f = d.scale(G / (r2 * r2.sqrt()));
        a[i] = a[i].plus(f.scale(mass[j]));
        a[j] = a[j].minus(f.scale(mass[i]));
    }
}
/// The far kernel for a row with cutoffs: the same operations per lane as the
/// scalar kernel with the larger cutoff magnitude, so scalar and SIMD builds
/// stay bit-identical. Rows never belong to the star.
#[inline]
#[allow(clippy::too_many_arguments)]
fn range_cut(
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
    assert!(end <= x.len() && x.len() == y.len() && y.len() == mass.len() && end <= a.len());
    assert!(cut.len() == x.len());
    let p = V2::new(x[i], y[i]);
    let ci = cut[i].abs();
    let mut j = start;
    // SAFETY: as in `range_plain`.
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
        // Pairs beyond their cutoff have weight exactly 1, and G * 1.0 is G:
        // when both lanes are, they skip the per-lane weight.
        let r_out = f64x2_max(
            f64x2_splat(ci),
            f64x2_abs(unsafe { v128_load(cut.as_ptr().add(j).cast()) }),
        );
        let numerator = if v128_any_true(f64x2_lt(raw, f64x2_mul(r_out, r_out))) {
            let w0 = crate::split::far_weight(
                f64x2_extract_lane::<0>(raw),
                f64x2_extract_lane::<0>(r_out),
            );
            let w1 = crate::split::far_weight(
                f64x2_extract_lane::<1>(raw),
                f64x2_extract_lane::<1>(r_out),
            );
            f64x2_mul(f64x2_splat(G), f64x2(w0, w1))
        } else {
            f64x2_splat(G)
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
        let numerator = G * crate::split::far_weight(raw, ci.max(cut[j].abs()));
        let f = d.scale(numerator / (r2 * r2.sqrt()));
        a[i] = a[i].plus(f.scale(mass[j]));
        a[j] = a[j].minus(f.scale(mass[i]));
    }
}
