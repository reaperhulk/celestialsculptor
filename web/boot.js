// Starts the engine worker while the page's modules are still loading, so the
// WebAssembly download and compile overlap them. app.js adopts the worker and
// replays anything it reported before app.js could listen.
try {
  const worker = new Worker('./worker.js', { type: 'module' });
  const early = [];
  worker.onmessage = worker.onerror = worker.onmessageerror = (event) => early.push(event);
  self.celestialBoot = { worker, early };
} catch (error) {
  self.celestialBoot = { error };
}
