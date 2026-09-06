import init, { Simulation, missions } from './pkg/celestial_wasm.js';
import { Runtime } from './runtime.js';

try {
  await init();
  const runtime = new Runtime(Simulation, message => self.postMessage(message));
  self.onmessage = event => runtime.handle(event.data);
  let previous = performance.now(), lastState = previous;
  setInterval(() => {
    const now = performance.now();
    try {
      runtime.advanceElapsed((now - previous) / 1000);
      if (runtime.playing || now - lastState >= 50) {
        runtime.state(); lastState = now;
      }
    } catch (error) {
      runtime.playing = false;
      self.postMessage({type: 'error', message: String(error?.message || error)});
    }
    previous = now;
  }, 16);
  self.postMessage({type: 'ready', missions: JSON.parse(missions())});
} catch (error) {
  self.postMessage({type: 'fatal', message: `Could not load the simulation: ${String(error?.message || error)}`});
}
