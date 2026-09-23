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
  /**
   * `spawn()` returns an object with postMessage and an onmessage/on('message')
   * hook. Helpers start on the first `start()`, so sessions that never reach
   * the helper threshold never pay for their threads or WASM instances.
   * `module`, a compiled WebAssembly.Module, spares each helper a compile.
   */
  constructor(spawn, count, { timeoutMs = 5000, module = null } = {}) {
    this.spawn = spawn;
    this.count = count;
    this.module = module;
    this.workers = [];
    this.pending = new Map();
    this.sequence = 0;
    this.timeoutMs = timeoutMs;
    this.broken = false;
    this.ready = 0;
    this.started = null;
    this.waiting = [];
    const shares = assignments(count + 1);
    this.owned = shares.slice(0, count);
    /** The subtrees the owner computes itself during every evaluation. */
    this.owner = Uint32Array.from(shares[count]);
  }
  /** Spawn the helpers once; resolves when every helper has loaded, or the pool failed. */
  start() {
    if (this.started) return this.started;
    const loaded = [];
    for (let k = 0; k < this.count && !this.broken; k++) {
      const worker = this.spawn();
      loaded.push(new Promise((resolve) => this.waiting.push(resolve)));
      const handle = (data) => {
        if (data && 'ready' in data) {
          if (!data.ready) return fail(data.error);
          this.ready++;
          this.waiting.shift()?.();
          return;
        }
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
      worker.postMessage({ init: this.module });
      this.workers.push(worker);
    }
    this.started = Promise.all(loaded);
    return this.started;
  }
  /** A pool that failed once stays out of the loop; the engine carries on alone. */
  fail(error) {
    this.broken = true;
    for (const resolve of this.waiting.splice(0)) resolve();
    // A broken pool never recovers, so release its threads and memory.
    for (const worker of this.workers.splice(0)) worker.terminate?.();
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
  /** Helpers ready to take work: none until every spawned helper has loaded. */
  get size() {
    return this.broken || this.ready < this.count ? 0 : this.count;
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
    this.fail(new Error('Gravity helpers stopped'));
  }
}
