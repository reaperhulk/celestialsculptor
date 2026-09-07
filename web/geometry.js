export function project(x, y, width, height, zoom, tilt) {
  return [width / 2 + x * height / (2 * zoom), height / 2 - y * tilt * height / (2 * zoom)];
}
export function unproject(x, y, width, height, zoom, tilt) {
  return [(x - width / 2) * 2 * zoom / height, -(y - height / 2) * 2 * zoom / (height * tilt)];
}
// Analytic two-body preview. Subsequent N-body interactions can change this orbit.
export function launchPath(radius, angle, speed) {
  if (Math.abs(speed) < 0.02) return [[radius * Math.cos(angle), radius * Math.sin(angle)], [0, 0]];
  const e = speed * speed - 1, p = radius * speed * speed;
  const end = e >= 1 ? Math.acos(-1 / e) - 0.02 : Math.PI * 2;
  const points = [];
  for (let i = 0; i <= 240; i++) {
    const a = Math.sign(speed) * end * i / 240, d = p / (1 + e * Math.cos(a));
    if (d > 12 || d < 0) break;
    points.push([d * Math.cos(a + angle), d * Math.sin(a + angle)]);
  }
  return points;
}
