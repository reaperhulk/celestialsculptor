import init, { Simulation, missions } from './pkg/celestial_wasm.js';
import { Runtime } from './runtime.js';
import {workDelay} from './work-schedule.js';

try {
  await init();
  const runtime = new Runtime(Simulation, (message,transfer=[]) => self.postMessage(message,transfer));
  self.onmessage = event => runtime.receive(event.data);
  let previous = performance.now(), lastState = previous;
  const turns=new MessageChannel();
  const pump=() => {
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
    const delay=workDelay(runtime.playing,runtime.debt,runtime.speed,performance.now()-now);
    if(delay===0)turns.port2.postMessage(null);else setTimeout(pump,delay);
  };
  turns.port1.onmessage=pump;
  setTimeout(pump,16);
  self.postMessage({type: 'ready', missions: JSON.parse(missions())});
} catch (error) {
  self.postMessage({type: 'fatal', message: `Could not load the simulation: ${String(error?.message || error)}`});
}
