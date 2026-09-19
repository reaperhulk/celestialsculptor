import test from 'node:test';
import assert from 'node:assert/strict';
import { IndexedCheckpointStore } from '../web/checkpoints.js';

// A deliberately small IndexedDB stand-in: object stores, versioned open,
// request/transaction callbacks delivered asynchronously like a browser would.
function fakeIndexedDB({ failOpen = false, blockOpen = false } = {}) {
  const stores = new Map();
  const request = (work) => {
    const r = { onsuccess: null, onerror: null, result: undefined, error: null };
    queueMicrotask(() => {
      try {
        r.result = work();
        r.onsuccess?.();
      } catch (error) {
        r.error = error;
        r.onerror?.();
      }
    });
    return r;
  };
  const objectStore = (name, tx) => ({
    get: (key) => request(() => stores.get(name).get(key)),
    getAll: () => request(() => [...stores.get(name).values()]),
    put: (value, key) => {
      const store = stores.get(name);
      store.set(key ?? value.key, value);
      tx.writes++;
    },
    delete: (key) => {
      stores.get(name).delete(key);
      tx.writes++;
    },
  });
  const db = {
    onversionchange: null,
    close() {},
    createObjectStore(name) {
      stores.set(name, new Map());
    },
    transaction() {
      const tx = { writes: 0, oncomplete: null, onerror: null, onabort: null, error: null };
      tx.objectStore = (name) => objectStore(name, tx);
      // Complete after every request queued during this task has settled.
      setTimeout(() => tx.oncomplete?.(), 0);
      return tx;
    },
  };
  return {
    stores,
    open() {
      const r = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
        result: db,
        error: null,
      };
      queueMicrotask(() => {
        if (blockOpen) return r.onblocked?.();
        if (failOpen) {
          r.error = new Error('denied');
          return r.onerror?.();
        }
        if (!stores.size) r.onupgradeneeded?.();
        r.onsuccess?.();
      });
      return r;
    },
  };
}
const meta = (key, saved, bytes = 10) => ({
  key,
  provenance: 'p',
  replay: { config: { mission: null }, commands: [], end_tick: 0 },
  digest: 'd',
  bytes,
  saved,
});

test('indexed store lists, reads, evicts by recency and size, and removes entries', async () => {
  const idb = fakeIndexedDB(),
    store = new IndexedCheckpointStore(idb);
  for (let i = 0; i < 14; i++) await store.put(meta(`k${i}`, i), `text${i}`);
  const listed = await store.list();
  assert.equal(listed.length, 12);
  assert.ok(!listed.some((e) => e.key === 'k0' || e.key === 'k1'));
  assert.equal(await store.get('k13'), 'text13');
  assert.equal(await store.get('k0'), undefined);
  await store.put(meta('huge', 100, 49_000_000), 'x');
  assert.ok(!(await store.list()).some((e) => e.key === 'huge'));
  await store.remove('k13');
  assert.equal(await store.get('k13'), undefined);
  assert.equal(idb.stores.get('index').size, idb.stores.get('states').size);
});

test('a failed or blocked open is not cached forever', async () => {
  const blocked = new IndexedCheckpointStore(fakeIndexedDB({ blockOpen: true }));
  await assert.rejects(blocked.list(), /busy/);
  assert.equal(blocked.opening, null);
  const failed = new IndexedCheckpointStore(fakeIndexedDB({ failOpen: true }));
  await assert.rejects(failed.list(), /denied/);
  assert.equal(failed.opening, null);
});
