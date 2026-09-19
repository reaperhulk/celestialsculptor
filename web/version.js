export const APP_VERSION = 1;
// Must equal celestial_sim::SAVE_VERSION. The Node WASM tests and the static
// check gate both assert this against the built engine, so a Rust bump that
// forgets this line fails verification instead of silently rejecting saves.
export const SAVE_VERSION = 7;
