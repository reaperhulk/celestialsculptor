export function updateTrails(
  trails,
  previous,
  state,
  relative = false,
  selected = null,
  samples = [],
) {
  const replaced =
    !previous || previous.generation !== state.generation || state.tick < previous.tick;
  if (replaced) trails.clear();
  const parents = new Map(state.bodies.map((body) => [body.id, body])),
    oldParents = new Map((previous?.bodies || []).map((b) => [b.id, b.parent]));
  const stride = Math.max(1, Math.ceil(state.bodies.length / 256));
  const priority = new Set(
    state.bodies
      .filter((body) => body.id === selected || body.parent === selected)
      .slice(0, 9)
      .map((b) => b.id),
  );
  priority.add(selected);
  const recorded = state.bodies.filter(
    (body) =>
      body.kind !== 'star' &&
      (!relative || parents.has(body.parent)) &&
      (priority.has(body.id) || body.id % stride === 0),
  );
  const live = new Set(recorded.map((body) => body.id));
  for (const id of trails.keys()) if (!live.has(id)) trails.delete(id);
  const ordinary = Math.min(
    192,
    Math.max(2, Math.floor((64 * 192 - 192) / Math.max(1, recorded.length))),
  );
  for (const body of recorded) {
    const parent = relative ? parents.get(body.parent) : null;
    if (relative && oldParents.get(body.id) !== body.parent) trails.delete(body.id);
    if (!replaced && state.tick === previous.tick && trails.has(body.id)) continue;
    const trail = trails.get(body.id) || [];
    if (!replaced) {
      for (const sample of samples) {
        const point = sample.bodies.get(body.id);
        if (!point) continue;
        const host = relative ? sample.bodies.get(point.parent) : null;
        if (relative && (!host || point.parent !== body.parent)) {
          trail.length = 0;
          continue;
        }
        trail.push([
          point.pos.x - (host?.pos.x || 0),
          point.pos.y - (host?.pos.y || 0),
          sample.tick,
        ]);
      }
    }
    trail.push([body.pos.x - (parent?.pos.x || 0), body.pos.y - (parent?.pos.y || 0), state.tick]);
    const limit = body.id === selected ? 192 : ordinary;
    if (trail.length > limit) trail.splice(0, trail.length - limit);
    trails.set(body.id, trail);
  }
}
