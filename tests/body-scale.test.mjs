import test from 'node:test';
import assert from 'node:assert/strict';
import { BodyScale } from '../web/body-scale.js';
import {
  bodyDiameter,
  contactRadius,
  glyphDiameter,
  hillRadius,
  HILL_FRACTION,
  solidFraction,
} from '../web/appearance.js';
const EARTH = 3.003e-6;
const star = { id: 0, kind: 'star', mass: 1, radius: 0.055, pos: { x: 0, y: 0 } };
const body = (id, kind, earths, x, y, parent = null) => ({
  id,
  kind,
  mass: earths * EARTH,
  radius: contactRadius(kind, earths * EARTH),
  pos: { x, y },
  parent,
});
const giant = (id, x, y) => body(id, 'giant', 318, x, y);
const pixels = (height, zoom) => height / (2 * zoom);

test('a body keeps its size while neighbours pass, at every view scale', () => {
  const scale = new BodyScale(),
    positions = new Map();
  for (const height of [175, 350, 600, 1080])
    for (const zoom of [0.05, 0.5, 1, 3.5, 9])
      for (const angle of [0, 0.7, 1.57, 2.8]) {
        const a = giant(1, 3.2, 0);
        scale.update([star, a], positions, height, zoom);
        const alone = scale.diameter(1);
        assert.ok(alone > 0 && Number.isFinite(alone));
        for (const separation of [0.028, 0.05, 0.2, 0.6, 2]) {
          const b = giant(2, 3.2 + separation * Math.cos(angle), separation * Math.sin(angle));
          scale.update([star, a, b], positions, height, zoom);
          assert.equal(scale.diameter(1), alone, `size changed at zoom ${zoom}`);
        }
      }
});
test("resolved globes touch only inside each other's Hill spheres", () => {
  const scale = new BodyScale();
  for (const height of [175, 350, 600, 1080])
    for (const zoom of [0.5, 1, 3.5, 9])
      for (const tilt of [0.62, 1])
        for (const angle of [0, 0.7, 1.57, 2.8])
          for (const separation of [0.05, 0.2, 0.6, 2]) {
            const a = giant(1, 3.2, 0),
              b = giant(2, 3.2 + separation * Math.cos(angle), separation * Math.sin(angle));
            scale.update([star, a, b], new Map(), height, zoom);
            const px = pixels(height, zoom),
              screen = Math.hypot(b.pos.x - a.pos.x, (b.pos.y - a.pos.y) * tilt) * px,
              hills =
                hillRadius(a.mass, 1, Math.hypot(a.pos.x, a.pos.y)) +
                hillRadius(b.mass, 1, Math.hypot(b.pos.x, b.pos.y)),
              glyph = glyphDiameter('giant') / solidFraction('giant');
            if (scale.radius(a) + scale.radius(b) >= screen)
              assert.ok(
                separation * tilt < hills ||
                  scale.diameter(1) <= glyph ||
                  scale.diameter(2) <= glyph,
                `false contact at zoom ${zoom}, tilt ${tilt}, separation ${separation}`,
              );
          }
});
test('the Hill cap binds in system views, contact and glyph floors hold, close views keep growth', () => {
  const scale = new BodyScale(),
    jupiter = giant(1, 5.2, 0),
    earth = body(2, 'rocky', 1, 1, 0),
    moon = body(3, 'rocky', 0.01, 5.2 + 0.024, 0, 1),
    dust = body(4, 'dust', 0.001, 2, 0);
  scale.update([star, jupiter, earth, moon, dust], new Map(), 540, 3.5);
  const px = pixels(540, 3.5);
  assert.ok(
    Math.abs(scale.radius(jupiter) - HILL_FRACTION * hillRadius(jupiter.mass, 1, 5.2) * px) < 1e-9,
  );
  assert.ok(scale.radius(jupiter) < bodyDiameter(jupiter, 540, 3.5) * 0.31);
  assert.equal(scale.diameter(2) * solidFraction('rocky'), glyphDiameter('rocky'));
  assert.equal(scale.diameter(4) * solidFraction('dust'), glyphDiameter('dust'));
  assert.ok(scale.diameter(2) > scale.diameter(4));
  assert.ok(Math.abs(scale.rings(1) - 1) < 1e-12);
  scale.update([star, jupiter], new Map(), 540, 14);
  assert.equal(scale.diameter(1) * solidFraction('giant'), glyphDiameter('giant'));
  assert.equal(scale.rings(1), 0);
  scale.update([star, jupiter, earth, moon, dust], new Map(), 600, 0.12);
  const close = pixels(600, 0.12);
  assert.ok(scale.radius(moon) >= moon.radius * close - 1e-9);
  assert.ok(scale.radius(moon) < 0.024 * close);
  assert.equal(scale.diameter(1), bodyDiameter(jupiter, 600, 0.12));
  assert.ok(Math.abs(scale.rings(1) - 1) < 1e-12);
  const before = scale.diameter(1);
  jupiter.mass *= 8;
  jupiter.radius *= 2;
  scale.update([star, jupiter], new Map(), 600, 0.12);
  assert.ok(Math.abs(scale.diameter(1) / before - 2) < 1e-12);
  assert.equal(scale.indices.size, 2);
});
test('sizes follow the drawn interpolated positions of the body and its primary', () => {
  const scale = new BodyScale(),
    a = giant(1, 3.2, 0);
  scale.update([star, a], new Map(), 600, 3.5);
  const near = scale.diameter(1);
  scale.update([star, a], new Map([[1, { x: 6.4, y: 0 }]]), 600, 3.5);
  assert.ok(Math.abs(scale.diameter(1) / near - 2) < 1e-9);
  scale.update([star, a], new Map([[0, { x: 3.2, y: 0 }]]), 600, 0.12);
  assert.ok(Math.abs(scale.radius(a) - a.radius * pixels(600, 0.12)) < 1e-9);
});
test('a crowded mixed population is sized without changing physics data or allocating result buffers', () => {
  const bodies = Array.from({ length: 64 }, (_, i) => ({
    ...giant(i, (i % 8) * 0.08, Math.floor(i / 8) * 0.08),
    kind: i === 0 ? 'star' : i % 3 ? 'rocky' : 'dust',
    radius: 0.01,
    mass: i === 0 ? 1 : EARTH,
  }));
  const before = JSON.stringify(bodies),
    scale = new BodyScale(),
    buffer = scale.sizes;
  scale.update(bodies, new Map(), 600, 2);
  for (const b of bodies) assert.ok(Number.isFinite(scale.radius(b)) && scale.radius(b) > 0);
  scale.update(bodies, new Map(), 600, 2);
  assert.equal(scale.sizes, buffer);
  assert.equal(JSON.stringify(bodies), before);
});
test('sizing grows to thousands and survives reordering', () => {
  const bodies = [
      star,
      giant(1, 3.2, 0.1),
      ...Array.from({ length: 8190 }, (_, i) => body(i + 2, 'dust', 0.001, 100 + i, 100)),
    ],
    scale = new BodyScale();
  scale.update(bodies, new Map(), 600, 2);
  const before = bodies.slice(0, 2).map((b) => scale.diameter(b.id));
  const storage = scale.sizes;
  assert.ok(before.every(Number.isFinite));
  bodies.reverse();
  scale.update(bodies, new Map(), 600, 2);
  assert.equal(scale.sizes, storage);
  assert.deepEqual([scale.diameter(0), scale.diameter(1)], before);
});
