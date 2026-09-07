import init, { Simulation, missions } from './pkg/celestial_wasm.js';
import { Runtime } from './runtime.js';

try {
  await init();
  const runtime = new Runtime(Simulation, message => self.postMessage(message));
  self.onmessage = event => runtime.receive(event.data);
  let previous = performance.now(), lastState = previous;
  setInterval(() => {
    const now = performance.now();
    try {
      const wasPlaying=runtime.playing;
      runtime.advanceElapsed((now - previous) / 1000);
      const count=runtime.sim?.body_count()||0,interval=count>=2048?100:count>256?66:33;
      if ((runtime.playing && now - lastState >= interval) || (wasPlaying && !runtime.playing)) {
        runtime.state(); lastState = now;
      }
    } catch (error) {
      runtime.playing = false;
      runtime.state();
      self.postMessage({type: 'error', message: String(error?.message || error)});
    }
    previous = now;
  }, 16);
  self.postMessage({type: 'ready', missions: JSON.parse(missions())});
} catch (error) {
  self.postMessage({type: 'fatal', message: `Could not load the simulation: ${String(error?.message || error)}`});
}
