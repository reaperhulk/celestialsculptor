import { displayDiameter, hillRadius, solidFraction } from './appearance.js';

export { solidFraction };

// Allocation-stable per-body sizing. Each size depends only on the body, its primary
// and the view, never on where its neighbours are, so nothing breathes as bodies pass.
export class BodyScale {
  constructor() {
    this.capacity = 0;
    this.indices = new Map();
    this.ensure(64);
  }
  ensure(count) {
    if (count <= this.capacity) return;
    this.capacity = 2 ** Math.ceil(Math.log2(count));
    this.sizes = new Float64Array(this.capacity);
  }
  update(bodies, positions, height, zoom) {
    this.ensure(bodies.length);
    for (let i = 0; i < bodies.length; i++) this.indices.set(bodies[i].id, i);
    for (const [id, index] of this.indices) if (bodies[index]?.id !== id) this.indices.delete(id);
    const star = bodies.find((b) => b.kind === 'star') || bodies[0];
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i],
        primary = body.parent == null ? star : (bodies[this.indices.get(body.parent)] ?? star);
      let hill = Infinity;
      if (primary && primary !== body) {
        const p = positions.get(body.id) || body.pos,
          q = positions.get(primary.id) || primary.pos;
        hill = hillRadius(body.mass, primary.mass, Math.hypot(p.x - q.x, p.y - q.y));
      }
      this.sizes[i] = displayDiameter(body, height, zoom, hill);
    }
  }
  diameter(id) {
    return this.sizes[this.indices.get(id)];
  }
  radius(body) {
    return this.diameter(body.id) * solidFraction(body.kind);
  }
  // Rings need a resolved globe: fade them out as the solid radius nears the glyph.
  rings(id) {
    return Math.max(0, Math.min(1, (this.diameter(id) * 0.31 - 6) / 4));
  }
}
