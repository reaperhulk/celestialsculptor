// Headless convenience for tests and benchmarks: drive the bounded importer to
// completion synchronously. The browser worker never does this in one call.
export function importReplay(sim, replay) {
  sim.begin_import(typeof replay === 'string' ? replay : JSON.stringify(replay));
  while (!sim.advance_import(512));
}
