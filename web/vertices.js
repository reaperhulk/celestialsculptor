export const LINE_CAPACITY = 64 * 192 * 12 + 2400 * 12;
export class VertexStream {
  constructor(capacity) {
    this.data = new Float32Array(capacity);
    this.length = 0;
  }
  ensure(capacity) {
    if (capacity <= this.data.length) return false;
    const data = new Float32Array(2 ** Math.ceil(Math.log2(capacity)));
    data.set(this.data);
    this.data = data;
    return true;
  }
  reset() {
    this.length = 0;
    return this;
  }
  view() {
    return this.data.subarray(0, this.length);
  }
  line(ax, ay, bx, by, c, alpha) {
    let i = this.length;
    if (i + 12 > this.data.length) throw new RangeError('Line vertex capacity exceeded');
    const d = this.data;
    d[i++] = ax;
    d[i++] = ay;
    d[i++] = c[0];
    d[i++] = c[1];
    d[i++] = c[2];
    d[i++] = alpha;
    d[i++] = bx;
    d[i++] = by;
    d[i++] = c[0];
    d[i++] = c[1];
    d[i++] = c[2];
    d[i++] = alpha;
    this.length = i;
  }
}
const NO_STYLE = [0, 0, 0, 0],
  DEFAULT_LIGHT = [-0.6, 0.5, 1];
export class PlanetStream extends VertexStream {
  point(x, y, size, c, kind, selected, style = NO_STYLE, light = DEFAULT_LIGHT, heat = 0) {
    let i = this.length;
    if (i + 16 > this.data.length) throw new RangeError('Planet vertex capacity exceeded');
    const d = this.data;
    d[i++] = x;
    d[i++] = y;
    d[i++] = size;
    d[i++] = c[0];
    d[i++] = c[1];
    d[i++] = c[2];
    d[i++] = kind;
    d[i++] = selected;
    d[i++] = style[0];
    d[i++] = style[1];
    d[i++] = style[2];
    d[i++] = style[3];
    d[i++] = light[0];
    d[i++] = light[1];
    d[i++] = light[2];
    d[i++] = heat;
    this.length = i;
  }
}
