// Gravity helper: computes every task touching its own subtrees of the mutual
// tree for one force evaluation and returns those subtrees. Runs as a browser
// Worker or a Node worker thread; each subtree's sums are the same additions in
// the same order whoever owns it, so the result never depends on how many
// helpers exist or which finished first.
import init, { ForceHelper } from './pkg/celestial_wasm.js';

const node = typeof self === 'undefined';
const port = node ? (await import('node:worker_threads')).parentPort : self;
let helper = null;
let ready = null;
// The pool's first message carries the owner's compiled module, if any.
async function load(module) {
  if (module) await init({ module_or_path: module });
  else if (node) {
    const { readFile } = await import('node:fs/promises');
    await init({
      module_or_path: await readFile(new URL('./pkg/celestial_wasm_bg.wasm', import.meta.url)),
    });
  } else await init();
  helper = new ForceHelper();
}
const receive = async (message) => {
  if (!ready) {
    ready = load(message?.init);
    try {
      await ready;
      port.postMessage({ ready: true });
    } catch (error) {
      port.postMessage({ ready: false, error: String(error?.message || error) });
    }
    return;
  }
  try {
    await ready;
    const { id, state, rebuild, owned } = message;
    const output = helper.compute(state, rebuild, Uint32Array.from(owned));
    port.postMessage({ id, output }, [output.buffer]);
  } catch (error) {
    port.postMessage({ id: message?.id, error: String(error?.message || error) });
  }
};
if (node) port.on('message', receive);
else port.onmessage = (event) => receive(event.data);
