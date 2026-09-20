// Display scale exaggerates every body's contact radius by the same factor.
// Volume-doubling therefore grows the visible radius by cbrt(2), at any zoom.
export function bodyDiameter(body, height, zoom) {
  if (body.kind === 'star')
    return 120 * Math.cbrt(body.mass) * Math.min(1.15, height / 540) * Math.sqrt(3.5 / zoom);
  const contact = 0.002 * Math.cbrt(body.mass / 3.003e-6);
  return Math.max(
    1,
    ((contact * height) / (zoom * 0.62)) *
      (1 + (98 * (zoom / (zoom + 0.5)) ** 2 * zoom ** 4) / (zoom ** 4 + 0.5 ** 4)),
  );
}
// Fraction of the drawn quad occupied by the solid globe; the rest holds rings and haze.
export const solidFraction = (kind) => (kind === 'star' ? 0.17 : kind === 'dust' ? 0.335 : 0.31);
// Physical contact radius in AU, matching the engine's radius law.
export const contactRadius = (kind, mass) =>
  kind === 'star' ? 0.055 * Math.cbrt(mass) : 0.002 * Math.cbrt(mass / 3.003e-6);
// Hill radius of a body about its primary at its current separation.
export const hillRadius = (mass, primaryMass, distance) =>
  distance * Math.cbrt(mass / (3 * (primaryMass + mass)));
// Exaggeration never exceeds this fraction of a body's Hill radius. Two drawn globes can
// only touch once each sits deep inside the other's Hill sphere, so a visible contact is
// always a real close interaction, while sizes depend on nothing but the body itself.
export const HILL_FRACTION = 0.5;
// Unresolved bodies keep a fixed solid glyph in CSS pixels, as icons in system views do.
export const glyphDiameter = (kind) => (kind === 'dust' ? 2 : 6);
// Drawn quad diameter in CSS pixels: the exaggerated size, capped by the Hill fraction,
// never below the contact radius, and never below the glyph. A function of the body,
// its primary and the view only, so it is smooth in time and ignores neighbours.
export function displayDiameter(body, height, zoom, hill = Infinity) {
  const base = bodyDiameter(body, height, zoom);
  if (body.kind === 'star') return base;
  const fraction = solidFraction(body.kind),
    pixels = height / (2 * zoom),
    contact = body.radius ?? contactRadius(body.kind, body.mass),
    cap = (Math.max(contact, HILL_FRACTION * hill) * pixels) / fraction;
  return Math.max(glyphDiameter(body.kind) / fraction, Math.min(base, cap));
}
// The osculating path, optionally only the arc within `window.half` radians of true
// anomaly around `window.center`, so a magnified view gets its segments where it looks.
export function orbitPath(orbit, segments = 192, window = null) {
  const { eccentricity: e, periapsis: q, periapsis_angle: angle = 0 } = orbit || {};
  if (!Number.isFinite(e) || !Number.isFinite(q) || q <= 0) return [];
  const end = e >= 1 ? Math.acos(-1 / e) - 0.025 : Math.PI;
  let from = -end,
    to = end;
  if (window && window.half < end) {
    const center = Math.atan2(Math.sin(window.center), Math.cos(window.center));
    from = Math.min(end, Math.max(-end, center - window.half));
    to = Math.max(from, Math.min(end, center + window.half));
  }
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const f = from + ((to - from) * i) / segments,
      r = (q * (1 + e)) / (1 + e * Math.cos(f));
    if (r > 0 && r < 20) points.push([r * Math.cos(f + angle), r * Math.sin(f + angle)]);
  }
  return points;
}
export function strongestPerturber(body, bodies, softening = 0.0001) {
  if (!body || body.id === 0) return null;
  const force = (source) => {
    const dx = source.pos.x - body.pos.x,
      dy = source.pos.y - body.pos.y,
      r2 = dx * dx + dy * dy + softening ** 2;
    return (source.mass * Math.sqrt(dx * dx + dy * dy)) / r2 ** 1.5;
  };
  const stellar = force(bodies[0]);
  let best = null;
  for (const other of bodies) {
    if (other.id === 0 || other.id === body.id) continue;
    const pull = force(other);
    if (!best || pull > best.pull)
      best = { body: other, pull, ratio: pull / Math.max(stellar, 1e-20) };
  }
  return best;
}
export function fitZoom(bodies, width, height, tilt, center = { x: 0, y: 0 }) {
  let extent = 1.8;
  for (const b of bodies) {
    const pad = b.kind === 'star' ? 0.4 : 0.25 + Math.cbrt(b.mass / 3.003e-6) * 0.16;
    extent = Math.max(
      extent,
      (Math.abs(b.pos.x - center.x) * height) / width + pad,
      Math.abs(b.pos.y - center.y) * tilt + pad,
    );
  }
  return Math.max(1, Math.min(14, extent * 1.28));
}
