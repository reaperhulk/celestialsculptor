import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bodyDiameter,
  displayDiameter,
  contactRadius,
  hillRadius,
  HILL_FRACTION,
  orbitPath,
  strongestPerturber,
  fitZoom,
} from '../web/appearance.js';
import { PlanetStream } from '../web/vertices.js';
test('visible collision growth preserves the radius/volume law across viewports', () => {
  for (const height of [240, 400, 620, 1000])
    for (const zoom of [1, 3.5, 9]) {
      const a = bodyDiameter({ kind: 'rocky', mass: 3.003e-6 }, height, zoom),
        b = bodyDiameter({ kind: 'rocky', mass: 8 * 3.003e-6 }, height, zoom);
      assert.ok(Math.abs(b / a - 2) < 1e-12);
    }
});
test('selected orbit overlay reaches the physical periapsis and apoapsis', () => {
  const path = orbitPath({ eccentricity: 0.5, periapsis: 1, periapsis_angle: 0.8 });
  const radii = path.map(([x, y]) => Math.hypot(x, y));
  assert.ok(Math.abs(Math.min(...radii) - 1) < 1e-10);
  assert.ok(Math.abs(Math.max(...radii) - 3) < 1e-10);
  for (const e of [0, 0.99, 1, 1.5])
    for (const point of orbitPath({ eccentricity: e, periapsis: 0.4, periapsis_angle: 1 }))
      assert.ok(point.every(Number.isFinite));
});
test('nearby massive neighbors dominate the nonstellar attraction reading', () => {
  const bodies = [
    { id: 0, mass: 1, pos: { x: 0, y: 0 } },
    { id: 1, mass: 3e-6, pos: { x: 2, y: 0 } },
    { id: 2, mass: 0.003, pos: { x: 2.1, y: 0 } },
    { id: 3, mass: 3e-6, pos: { x: 3, y: 0 } },
  ];
  const source = strongestPerturber(bodies[1], bodies);
  assert.equal(source.body.id, 2);
  assert.ok(source.ratio > 1);
  assert.equal(strongestPerturber(bodies[0], bodies), null);
  assert.ok(fitZoom(bodies, 390, 400, 0.62) > 2);
});
test('planet vertices carry complete style and light data without buffer overrun', () => {
  const stream = new PlanetStream(32);
  stream.point(1, 2, 30, [1, 0.5, 0.2], 2, 1, [0.3, 0.7, 1, 0], [1, 0, 0.4], 0.2);
  assert.equal(stream.length, 16);
  stream.point(0, 0, 2, [1, 1, 1], 4, 0);
  assert.equal(stream.length, 32);
  assert.throws(() => stream.point(0, 0, 2, [1, 1, 1], 4, 0), RangeError);
});
test('selecting the star has no osculating planetary path', () => {
  assert.deepEqual(orbitPath(undefined), []);
  assert.deepEqual(orbitPath(null), []);
});
test('satellite-scale exaggeration leaves the inner moon outside the giant globe', () => {
  const giant = { kind: 'giant', mass: 318 * 3.003e-6 };
  for (const height of [240, 400, 620]) {
    const globeRadius = bodyDiameter(giant, height, 0.12) * 0.31,
      innerMoonSeparation = ((0.024 * height) / (2 * 0.12)) * 0.62;
    assert.ok(
      globeRadius < innerMoonSeparation,
      'giant must not swallow the inner moon path on screen',
    );
  }
});
test('display sizes cap at the Hill fraction, floor at the glyph, and pass stars and unbound bodies through', () => {
  const mass = 318 * 3.003e-6,
    jupiter = { kind: 'giant', mass, radius: contactRadius('giant', mass) };
  const hill = hillRadius(mass, 1, 5.2);
  assert.ok(Math.abs(hill - 5.2 * Math.cbrt(mass / (3 * (1 + mass)))) < 1e-15);
  assert.ok(
    Math.abs(displayDiameter(jupiter, 540, 3.5, hill) * 0.31 - (HILL_FRACTION * hill * 540) / 7) <
      1e-9,
  );
  assert.equal(displayDiameter(jupiter, 540, 3.5), bodyDiameter(jupiter, 540, 3.5));
  const earth = { kind: 'rocky', mass: 3.003e-6, radius: contactRadius('rocky', 3.003e-6) };
  assert.ok(
    Math.abs(displayDiameter(earth, 540, 3.5, hillRadius(earth.mass, 1, 1)) * 0.31 - 6) < 1e-12,
  );
  const sun = { kind: 'star', mass: 1 };
  assert.equal(displayDiameter(sun, 540, 3.5, 0), bodyDiameter(sun, 540, 3.5));
  assert.ok(Math.abs(contactRadius('star', 1) - 0.055) < 1e-15);
});
