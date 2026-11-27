import { BODY_FRAME_STRIDE } from './body-frame.js';

// Intermediate samples carry just the coordinates used by trails and their moving hosts.
export function trailFrame(frame, selected) {
  const stride = Math.max(1, Math.ceil(frame.length / BODY_FRAME_STRIDE / 256));
  const ids = new Set([0, selected]);
  let children = 0;
  for (let i = 0; i < frame.length; i += BODY_FRAME_STRIDE) {
    const id = frame[i],
      parent = frame[i + 14];
    const child = parent === selected && children < 9;
    if (child) children++;
    if (id % stride === 0 || id === selected || child) {
      ids.add(id);
      ids.add(parent);
    }
  }
  const values = [];
  for (let i = 0; i < frame.length; i += BODY_FRAME_STRIDE) {
    if (ids.has(frame[i]))
      values.push(frame[i], frame[i + 4], frame[i + 5], frame[i + 14], frame[i + 6], frame[i + 7]);
  }
  return Float64Array.from(values);
}

export function decodeTrailSamples(samples = []) {
  return samples.map(({ tick, frame }) => {
    const bodies = new Map();
    for (let i = 0; i < frame.length; i += 6)
      bodies.set(frame[i], {
        pos: { x: frame[i + 1], y: frame[i + 2] },
        parent: frame[i + 3],
        vel: { x: frame[i + 4], y: frame[i + 5] },
      });
    return { tick, bodies };
  });
}
