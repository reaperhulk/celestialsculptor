//! Scalar pair kernels for builds without WebAssembly SIMD: native tests, tools
//! and scalar WebAssembly. The shipped SIMD kernel (`gravity_simd.rs`) performs
//! the same operations in the same order, so both give identical results.
use crate::{G, V2};

pub fn accelerations(x: &[f64], y: &[f64], mass: &[f64], softening2: f64, a: &mut [V2]) {
    for i in 0..x.len() {
        range(x, y, mass, &[], softening2, a, i, i + 1, x.len());
    }
}
/// Far parts only, for a system with near/far cutoffs. The star's row takes
/// the star rule of `split::pair_cut`.
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
/// Row `i` against bodies `start..end`, which never include `i`; both sides of
/// every pair are updated. An empty `cut` selects the plain force; otherwise
/// each pair's far part is weighted by `cut[i].max(cut[j])`.
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
    assert!(
        i < start || i >= end,
        "a row never pairs a body with itself"
    );
    let (px, py, mi) = (x[i], y[i], mass[i]);
    let ci = cut.get(i).copied().unwrap_or(0.0);
    for j in start..end {
        let dx = x[j] - px;
        let dy = y[j] - py;
        let raw = dx * dx + dy * dy;
        let numerator = if cut.is_empty() {
            G
        } else {
            G * crate::split::far_weight(raw, ci.max(cut[j]))
        };
        let r2 = raw + softening2;
        let s = numerator / (r2 * r2.sqrt());
        let (fx, fy) = (dx * s, dy * s);
        a[i].x += fx * mass[j];
        a[i].y += fy * mass[j];
        a[j].x -= fx * mi;
        a[j].y -= fy * mi;
    }
}
