// Owner-side pool of gravity helpers. The mutual tree is cut into SUBTREES
// subtrees; subtree pairs (s, T-1-s) carry about equal work, so pairs are
// dealt round-robin across the helpers and the owner, which takes the last
// share and computes it while the helpers work. Each helper returns tagged
// records for its own subtrees, so results may be merged in any order.
export const SUBTREES = 16;
export function helperCount(hardwareConcurrency = 1, max = SUBTREES / 2) {
  const cores = Number.isInteger(hardwareConcurrency) ? hardwareConcurrency : 1;
  return Math.max(0, Math.min(max, cores - 1));
}
export function assignments(participants, subtrees = SUBTREES) {
  const lists = Array.from({ length: participants }, () => []);
  for (let pair = 0; pair < subtrees / 2; pair++)
    lists[pair % participants].push(pair, subtrees - 1 - pair);
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
    const shares = assignments(count + 1);
    this.owned = shares.slice(0, count);
    /** The subtrees the owner computes itself during every evaluation. */
    this.owner = Uint32Array.from(shares[count]);
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
  /**
   * Post one force request to every helper. Requests leave before this
   * returns, so the caller can compute the owner's share meanwhile; the
   * promise resolves to every helper's records concatenated.
   */
  evaluate(state, rebuild) {
    if (this.broken) return Promise.reject(new Error('Gravity helpers are unavailable'));
    const requests = this.workers.map((worker, k) => {
      const id = ++this.sequence;
      const copy = state.slice();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => this.fail(new Error('A gravity helper did not answer')),
          this.timeoutMs,
        );
        this.pending.set(id, { resolve, reject, timer });
        worker.postMessage({ id, state: copy, rebuild, owned: this.owned[k] }, [copy.buffer]);
      });
    });
    return Promise.all(requests).then((results) => {
      if (results.length === 1) return results[0];
      let total = 0;
      for (const output of results) total += output.length;
      const merged = new Float64Array(total);
      let at = 0;
      for (const output of results) {
        merged.set(output, at);
        at += output.length;
      }
      return merged;
    });
  }
  terminate() {
    this.broken = true;
    for (const worker of this.workers) worker.terminate?.();
    this.workers = [];
    this.fail(new Error('Gravity helpers stopped'));
  }
}
