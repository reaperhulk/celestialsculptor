// Orbit-state packing and accuracy metrics shared by every GPU comparison.
import { BODY_FRAME_STRIDE } from './body-frame.js';

export function orbitState(frame) {
  const state = new Float64Array((frame.length / BODY_FRAME_STRIDE) * 5);
  for (let i = 0; i < state.length / 5; i++) {
    const j = i * BODY_FRAME_STRIDE;
    state.set([frame[j + 4], frame[j + 5], frame[j + 6], frame[j + 7], frame[j + 2]], i * 5);
  }
  return state;
}
export function orbitError(reference, candidate) {
  let p = 0,
    v = 0,
    ps = 0,
    vs = 0;
  for (let i = 0; i < reference.length; i += 5) {
    for (let j = 0; j < 4; j++) {
      const e = (candidate[i + j] - reference[i + j]) ** 2;
      if (j < 2) {
        p += e;
        ps += reference[i + j] ** 2;
      } else {
        v += e;
        vs += reference[i + j] ** 2;
      }
    }
  }
  return {
    positionRms: Math.sqrt(p / Math.max(ps, 1e-30)),
    velocityRms: Math.sqrt(v / Math.max(vs, 1e-30)),
  };
}
export function orbitBalances(state) {
  let energy = 0,
    px = 0,
    py = 0,
    l = 0,
    momentumScale = 0;
  for (let i = 0; i < state.length; i += 5) {
    const [x, y, vx, vy, m] = state.subarray(i, i + 5);
    energy += 0.5 * m * (vx * vx + vy * vy);
    px += m * vx;
    py += m * vy;
    l += m * (x * vy - y * vx);
    momentumScale += m * Math.hypot(vx, vy);
    for (let j = i + 5; j < state.length; j += 5)
      energy -=
        (39.47841760435743 * m * state[j + 4]) /
        Math.sqrt((x - state[j]) ** 2 + (y - state[j + 1]) ** 2 + 1e-8);
  }
  return { energy, px, py, angularMomentum: l, momentumScale };
}
