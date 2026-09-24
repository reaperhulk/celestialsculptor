//! Native pair kernels with the same contract as the WebAssembly SIMD kernels:
//! every pair's force is the same IEEE operations as the scalar
//! `direct_pair`/`direct_pair_far`, and each body's sum receives its terms in
//! scalar order, so results are bit-identical to scalar and to the shipped
//! WebAssembly build. Lanes only batch the independent per-pair arithmetic
//! (subtract, multiply, divide, square root; never fused multiply-add). The
//! lane count is chosen once per process from the CPU; `set_scalar_kernels`
//! selects one lane, the scalar reference, for tests that prove the identity.
use crate::{G, V2};
use std::sync::atomic::{AtomicU8, Ordering};

pub fn accelerations(x: &[f64], y: &[f64], mass: &[f64], softening2: f64, a: &mut [V2]) {
    for i in 0..x.len() {
        range(x, y, mass, &[], softening2, a, i, i + 1, x.len());
    }
}
/// Far parts only, for a system with near/far cutoffs. The star's row takes
/// the star rule of `split::pair_cut`, which the batched rows do not express.
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

const UNSET: u8 = 0;
const SCALAR: u8 = 1;
/// Two lanes everywhere (SSE2 or NEON, part of the baseline).
const BASE: u8 = 2;
/// Four AVX lanes on long direct rows, two on short (tree leaf) rows.
#[cfg(target_arch = "x86_64")]
const AVX_LONG: u8 = 3;
/// Four AVX lanes on every row.
#[cfg(target_arch = "x86_64")]
const AVX_ALL: u8 = 4;
static KERNEL: AtomicU8 = AtomicU8::new(UNSET);

/// Use the one-lane scalar reference (`true`) or the fastest kernel for this
/// CPU (`false`). Results are identical either way; tests use this to prove it.
#[doc(hidden)]
pub fn set_scalar_kernels(scalar: bool) {
    KERNEL.store(if scalar { SCALAR } else { detect() }, Ordering::Relaxed);
}
/// Every kernel this CPU can run, by name, for tests that compare each with
/// the scalar reference. Selecting one returns false if it is unsupported.
#[doc(hidden)]
pub fn kernel_names() -> &'static [&'static str] {
    &["scalar", "base", "avx-long", "avx-all"]
}
#[doc(hidden)]
pub fn select_kernel(name: &str) -> bool {
    let kernel = match name {
        "scalar" => SCALAR,
        "base" => BASE,
        #[cfg(target_arch = "x86_64")]
        "avx-long" if std::is_x86_feature_detected!("avx") => AVX_LONG,
        #[cfg(target_arch = "x86_64")]
        "avx-all" if std::is_x86_feature_detected!("avx") => AVX_ALL,
        _ => return false,
    };
    KERNEL.store(kernel, Ordering::Relaxed);
    true
}
/// The kernel in use, as named by `kernel_names`, for logs.
#[doc(hidden)]
pub fn selected_kernel() -> &'static str {
    kernel_names()[usize::from(kernel()) - 1]
}
fn detect() -> u8 {
    #[cfg(target_arch = "x86_64")]
    if std::is_x86_feature_detected!("avx") {
        return x86::calibrate();
    }
    BASE
}
fn kernel() -> u8 {
    match KERNEL.load(Ordering::Relaxed) {
        UNSET => {
            let k = detect();
            KERNEL.store(k, Ordering::Relaxed);
            k
        }
        k => k,
    }
}

/// Row `i` against bodies `start..end`, which never include `i`; both sides of
/// every pair are updated. An empty `cut` selects the plain force.
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
    block(
        x,
        y,
        mass,
        cut,
        softening2,
        a,
        (i, i + 1),
        (start, end),
        false,
    );
}
/// Rows `rows.0..rows.1` in order, each against `cols.0..cols.1` or, for a
/// `triangle`, against the bodies after it up to `cols.1`. Rows never pair a
/// body with itself. Checks and the kernel choice happen once per block; the
/// arithmetic and its order are `range`'s, row by row.
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
    let n = x.len();
    assert!(y.len() == n && mass.len() == n && a.len() >= n);
    assert!(cut.is_empty() || cut.len() == n);
    assert!(rows.1 <= n && cols.1 <= n);
    assert!(
        triangle || rows.1 <= cols.0 || cols.1 <= rows.0,
        "a row never pairs a body with itself"
    );
    match kernel() {
        // Four lanes always pay off on long direct rows. On short tree leaf
        // rows it depends on the CPU's divide and square-root units (four lanes
        // win on AMD Zen 4, two on recent Intel), so `x86::calibrate` measures.
        #[cfg(target_arch = "x86_64")]
        // SAFETY: selected only after runtime detection of the feature.
        AVX_ALL => unsafe { x86::block_avx(x, y, mass, cut, softening2, a, rows, cols, triangle) },
        #[cfg(target_arch = "x86_64")]
        // SAFETY: as above.
        AVX_LONG if cols.1 - cols.0 >= 16 => unsafe {
            x86::block_avx(x, y, mass, cut, softening2, a, rows, cols, triangle)
        },
        #[cfg(target_arch = "x86_64")]
        // SSE2 is part of the x86_64 baseline.
        BASE | AVX_LONG => {
            rows_of::<x86::Sse2>(x, y, mass, cut, softening2, a, rows, cols, triangle)
        }
        #[cfg(target_arch = "aarch64")]
        // NEON is part of the AArch64 baseline.
        BASE => rows_of::<arm::Neon>(x, y, mass, cut, softening2, a, rows, cols, triangle),
        _ => rows_of::<Scalar>(x, y, mass, cut, softening2, a, rows, cols, triangle),
    }
}
#[inline(always)]
#[allow(clippy::too_many_arguments)]
fn rows_of<V: Lanes>(
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
        row::<V>(x, y, mass, cut, softening2, a, i, start, cols.1);
    }
}

/// `L` independent f64 lanes with IEEE-exact element-wise operations.
trait Lanes: Copy {
    const L: usize;
    /// Loads `L` values from `v[at..at + L]`, which the caller has bounds-checked.
    unsafe fn load(v: &[f64], at: usize) -> Self;
    fn splat(v: f64) -> Self;
    fn from_slice(v: &[f64]) -> Self;
    fn add(self, b: Self) -> Self;
    fn sub(self, b: Self) -> Self;
    fn mul(self, b: Self) -> Self;
    fn div(self, b: Self) -> Self;
    fn sqrt(self) -> Self;
    fn store(self, out: &mut [f64]);
}
#[derive(Clone, Copy)]
struct Scalar(f64);
impl Lanes for Scalar {
    const L: usize = 1;
    unsafe fn load(v: &[f64], at: usize) -> Self {
        Self(v[at])
    }
    fn splat(v: f64) -> Self {
        Self(v)
    }
    fn from_slice(v: &[f64]) -> Self {
        Self(v[0])
    }
    fn add(self, b: Self) -> Self {
        Self(self.0 + b.0)
    }
    fn sub(self, b: Self) -> Self {
        Self(self.0 - b.0)
    }
    fn mul(self, b: Self) -> Self {
        Self(self.0 * b.0)
    }
    fn div(self, b: Self) -> Self {
        Self(self.0 / b.0)
    }
    fn sqrt(self) -> Self {
        Self(self.0.sqrt())
    }
    fn store(self, out: &mut [f64]) {
        out[0] = self.0;
    }
}

/// The scalar kernel's arithmetic, `V::L` pairs at a time. The row body's
/// sum takes each lane in order, then the remainder pair by pair.
#[inline(always)]
#[allow(clippy::too_many_arguments)]
fn row<V: Lanes>(
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
    let (px, py, mi) = (x[i], y[i], mass[i]);
    let weighted = !cut.is_empty();
    let ci = if weighted { cut[i] } else { 0.0 };
    let (mut aix, mut aiy) = (a[i].x, a[i].y);
    let (vpx, vpy, vmi, vsoft, vg) = (
        V::splat(px),
        V::splat(py),
        V::splat(mi),
        V::splat(softening2),
        V::splat(G),
    );
    const { assert!(V::L <= 4, "lane scratch holds four values") };
    let mut lanes = [[0.0; 4]; 4];
    let mut j = start;
    while j + V::L <= end {
        // SAFETY: j + L <= end <= len for all three equal-length slices.
        let (dx, dy, m) = unsafe {
            (
                V::load(x, j).sub(vpx),
                V::load(y, j).sub(vpy),
                V::load(mass, j),
            )
        };
        let raw = dx.mul(dx).add(dy.mul(dy));
        // Pairs where neither body has a cutoff have weight exactly 1, and
        // G * 1.0 is G: such blocks skip the per-lane weight.
        let numerator = if weighted && (ci != 0.0 || cut[j..j + V::L].iter().any(|&c| c != 0.0)) {
            raw.store(&mut lanes[0]);
            for k in 0..V::L {
                lanes[1][k] = G * crate::split::far_weight(lanes[0][k], ci.max(cut[j + k]));
            }
            V::from_slice(&lanes[1])
        } else {
            vg
        };
        let r2 = raw.add(vsoft);
        let s = numerator.div(r2.mul(r2.sqrt()));
        let (fx, fy) = (dx.mul(s), dy.mul(s));
        fx.mul(m).store(&mut lanes[0]);
        fy.mul(m).store(&mut lanes[1]);
        fx.mul(vmi).store(&mut lanes[2]);
        fy.mul(vmi).store(&mut lanes[3]);
        for k in 0..V::L {
            aix += lanes[0][k];
            aiy += lanes[1][k];
            a[j + k].x -= lanes[2][k];
            a[j + k].y -= lanes[3][k];
        }
        j += V::L;
    }
    while j < end {
        let dx = x[j] - px;
        let dy = y[j] - py;
        let raw = dx * dx + dy * dy;
        let numerator = if weighted {
            G * crate::split::far_weight(raw, ci.max(cut[j]))
        } else {
            G
        };
        let r2 = raw + softening2;
        let s = numerator / (r2 * r2.sqrt());
        let (fx, fy) = (dx * s, dy * s);
        aix += fx * mass[j];
        aiy += fy * mass[j];
        a[j].x -= fx * mi;
        a[j].y -= fy * mi;
        j += 1;
    }
    a[i] = V2::new(aix, aiy);
}

#[cfg(target_arch = "x86_64")]
mod x86 {
    use super::{rows_of, Lanes, V2};
    use core::arch::x86_64::*;

    macro_rules! lanes {
        ($name:ident, $t:ty, $l:expr, $load:ident, $set1:ident, $add:ident, $sub:ident,
         $mul:ident, $div:ident, $sqrt:ident, $store:ident) => {
            #[derive(Clone, Copy)]
            pub(super) struct $name($t);
            impl Lanes for $name {
                const L: usize = $l;
                #[inline(always)]
                unsafe fn load(v: &[f64], at: usize) -> Self {
                    // SAFETY: the caller checked at + L <= v.len(); loads are unaligned.
                    unsafe { Self($load(v.as_ptr().add(at))) }
                }
                #[inline(always)]
                fn splat(v: f64) -> Self {
                    // SAFETY: only reached inside a function with this feature enabled.
                    unsafe { Self($set1(v)) }
                }
                #[inline(always)]
                fn from_slice(v: &[f64]) -> Self {
                    assert!(v.len() >= $l);
                    // SAFETY: bounds asserted above.
                    unsafe { Self($load(v.as_ptr())) }
                }
                #[inline(always)]
                fn add(self, b: Self) -> Self {
                    unsafe { Self($add(self.0, b.0)) }
                }
                #[inline(always)]
                fn sub(self, b: Self) -> Self {
                    unsafe { Self($sub(self.0, b.0)) }
                }
                #[inline(always)]
                fn mul(self, b: Self) -> Self {
                    unsafe { Self($mul(self.0, b.0)) }
                }
                #[inline(always)]
                fn div(self, b: Self) -> Self {
                    unsafe { Self($div(self.0, b.0)) }
                }
                #[inline(always)]
                fn sqrt(self) -> Self {
                    unsafe { Self($sqrt(self.0)) }
                }
                #[inline(always)]
                fn store(self, out: &mut [f64]) {
                    assert!(out.len() >= $l);
                    // SAFETY: bounds asserted above.
                    unsafe { $store(out.as_mut_ptr(), self.0) }
                }
            }
        };
    }
    lanes!(
        Sse2,
        __m128d,
        2,
        _mm_loadu_pd,
        _mm_set1_pd,
        _mm_add_pd,
        _mm_sub_pd,
        _mm_mul_pd,
        _mm_div_pd,
        _mm_sqrt_pd,
        _mm_storeu_pd
    );
    lanes!(
        Avx,
        __m256d,
        4,
        _mm256_loadu_pd,
        _mm256_set1_pd,
        _mm256_add_pd,
        _mm256_sub_pd,
        _mm256_mul_pd,
        _mm256_div_pd,
        _mm256_sqrt_pd,
        _mm256_storeu_pd
    );

    /// Four lanes on every row, or only on long ones: whichever runs a
    /// synthetic set of tree leaf blocks faster here. Results do not depend
    /// on the choice, so timing noise can only cost speed.
    pub(super) fn calibrate() -> u8 {
        use std::time::Instant;
        let n = 64;
        let mut state = 0x9e37_79b9_7f4a_7c15_u64;
        let mut random = || {
            state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
            (state >> 11) as f64 / (1_u64 << 53) as f64
        };
        let x: Vec<f64> = (0..n).map(|_| random()).collect();
        let y: Vec<f64> = (0..n).map(|_| random()).collect();
        let mass: Vec<f64> = (0..n).map(|_| 1e-6 * (1.0 + random())).collect();
        let mut a = vec![V2::default(); n];
        let mut run = |wide: bool| {
            let start = Instant::now();
            for _ in 0..40 {
                for leaf in (0..n).step_by(8) {
                    let rows = (leaf, leaf + 8);
                    let next = ((leaf + 8) % n, (leaf + 8) % n + 8);
                    for (cols, triangle) in [(rows, true), (next, false)] {
                        if wide {
                            // SAFETY: only called after AVX was detected.
                            unsafe {
                                block_avx(&x, &y, &mass, &[], 1e-8, &mut a, rows, cols, triangle)
                            }
                        } else {
                            rows_of::<Sse2>(&x, &y, &mass, &[], 1e-8, &mut a, rows, cols, triangle)
                        }
                    }
                }
            }
            start.elapsed()
        };
        let (mut narrow, mut wide) = (std::time::Duration::MAX, std::time::Duration::MAX);
        for _ in 0..5 {
            narrow = narrow.min(run(false));
            wide = wide.min(run(true));
        }
        std::hint::black_box(&a);
        if wide < narrow {
            super::AVX_ALL
        } else {
            super::AVX_LONG
        }
    }
    #[target_feature(enable = "avx")]
    #[allow(clippy::too_many_arguments)]
    pub(super) unsafe fn block_avx(
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
        rows_of::<Avx>(x, y, mass, cut, softening2, a, rows, cols, triangle)
    }
}

#[cfg(target_arch = "aarch64")]
mod arm {
    use super::Lanes;
    use core::arch::aarch64::*;
    #[derive(Clone, Copy)]
    pub(super) struct Neon(float64x2_t);
    impl Lanes for Neon {
        const L: usize = 2;
        #[inline(always)]
        unsafe fn load(v: &[f64], at: usize) -> Self {
            // SAFETY: the caller checked at + 2 <= v.len().
            unsafe { Self(vld1q_f64(v.as_ptr().add(at))) }
        }
        #[inline(always)]
        fn splat(v: f64) -> Self {
            // SAFETY: NEON is part of the AArch64 baseline.
            unsafe { Self(vdupq_n_f64(v)) }
        }
        #[inline(always)]
        fn from_slice(v: &[f64]) -> Self {
            assert!(v.len() >= 2);
            // SAFETY: bounds asserted above.
            unsafe { Self(vld1q_f64(v.as_ptr())) }
        }
        #[inline(always)]
        fn add(self, b: Self) -> Self {
            unsafe { Self(vaddq_f64(self.0, b.0)) }
        }
        #[inline(always)]
        fn sub(self, b: Self) -> Self {
            unsafe { Self(vsubq_f64(self.0, b.0)) }
        }
        #[inline(always)]
        fn mul(self, b: Self) -> Self {
            unsafe { Self(vmulq_f64(self.0, b.0)) }
        }
        #[inline(always)]
        fn div(self, b: Self) -> Self {
            unsafe { Self(vdivq_f64(self.0, b.0)) }
        }
        #[inline(always)]
        fn sqrt(self) -> Self {
            unsafe { Self(vsqrtq_f64(self.0)) }
        }
        #[inline(always)]
        fn store(self, out: &mut [f64]) {
            assert!(out.len() >= 2);
            // SAFETY: bounds asserted above.
            unsafe { vst1q_f64(out.as_mut_ptr(), self.0) }
        }
    }
}
