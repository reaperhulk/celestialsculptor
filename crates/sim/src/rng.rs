//! The one seeded generator behind every random choice in the rules.
/// Marsaglia xorshift32 mapped to [0, 1]. A zero state would be absorbing, so
/// it is treated as one; callers seed with `seed.max(1)` for the same reason.
pub(crate) fn xorshift(state: &mut u32) -> f64 {
    let mut x = (*state).max(1);
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *state = x;
    x as f64 / u32::MAX as f64
}
