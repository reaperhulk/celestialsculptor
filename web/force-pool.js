// Owner-side pool of gravity helpers. Group pairs (g, T-1-g) carry equal work,
// so pairs are dealt round-robin; outputs are returned in group order.
export const GROUPS = 16;
export function helperCount(hardwareConcurrency = 1, max = GROUPS / 2) {
  const cores = Number.isInteger(hardwareConcurrency) ? hardwareConcurrency : 1;
  return Math.max(0, Math.min(max, cores - 1));
}
export function assignments(helpers, groups = GROUPS) {
  const lists = Array.from({ length: helpers }, () => []);
  for (let pair = 0; pair < groups / 2; pair++) lists[pair % helpers].push(pair, groups - 1 - pair);
  return lists.map((list) => list.sort((a, b) => a - b));
}
export class ForcePool {
  /** `spawn()` returns an object with postMessage and an onmessage/on('message') hook. */
  constructor(spawn, count, { timeoutMs = 5000 } = {}) {
    this.workers = [];
    this.pending = new Map();
    this.sequence = 0;
    this.timeoutMs = timeoutMs;
    this.broken = false;
    this.groups = assignments(count);
    for (let k = 0; k < count; k++) {
      const worker = spawn();
      const handle = (data) => {
        const request = this.pending.get(data.id);
        if (!request) return;
        this.pending.delete(data.id);
        clearTimeout(request.timer);
        if (data.error) request.reject(new Error(data.error));
        else request.resolve(data.output);
      };
      const fail = (message) => this.fail(new Error(message || 'A gravity helper failed'));
      if (typeof worker.on === 'function') {
        worker.on('message', handle);
        worker.on('error', (error) => fail(error?.message));
        worker.on('exit', () => fail('A gravity helper exited'));
      } else {
        worker.onmessage = (event) => handle(event.data);
        worker.onerror = (event) => fail(event?.message);
      }
      this.workers.push(worker);
    }
  }
  /** A pool that failed once stays out of the loop; the engine carries on alone. */
  fail(error) {
    this.broken = true;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
  get size() {
    return this.broken ? 0 : this.workers.length;
  }
  /** Evaluate one force request; resolves to the group buffers in group order. */
  async evaluate(state, rebuild) {
    if (this.broken) throw new Error('Gravity helpers are unavailable');
    const results = await Promise.all(
      this.workers.map((worker, k) => {
        const id = ++this.sequence;
        const copy = state.slice();
        return new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => this.fail(new Error('A gravity helper did not answer')),
            this.timeoutMs,
          );
          this.pending.set(id, { resolve, reject, timer });
          worker.postMessage({ id, state: copy, rebuild, groups: this.groups[k] }, [copy.buffer]);
        });
      }),
    );
    // Each helper returns its groups concatenated in ascending order; the
    // owner needs all groups ascending, so interleave by the assignment lists.
    const byGroup = new Map();
    results.forEach((output, k) => {
      let offset = 0;
      for (const group of this.groups[k]) {
        const length = output[offset];
        if (!Number.isInteger(length) || offset + 1 + length > output.length)
          throw new Error('A gravity helper returned a malformed group');
        byGroup.set(group, output.subarray(offset + 1, offset + 1 + length));
        offset += 1 + length;
      }
    });
    let total = 0;
    for (let g = 0; g < GROUPS; g++) total += byGroup.get(g)?.length ?? 0;
    const merged = new Float64Array(total);
    let at = 0;
    for (let g = 0; g < GROUPS; g++) {
      const buffer = byGroup.get(g);
      if (!buffer) continue;
      merged.set(buffer, at);
      at += buffer.length;
    }
    return merged;
  }
  terminate() {
    this.broken = true;
    for (const worker of this.workers) worker.terminate?.();
    this.workers = [];
    this.fail(new Error('Gravity helpers stopped'));
  }
}
