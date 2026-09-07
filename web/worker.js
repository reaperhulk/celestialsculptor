import init, { Simulation, missions } from './pkg/celestial_wasm.js';
import { Runtime } from './runtime.js';
import {CheckpointCache,IndexedCheckpointStore} from './checkpoints.js';
import {workDelay} from './work-schedule.js';

try {
  await init();
  let provenance=null;
  try{const build=await (await fetch('./build-info.json')).json();const wasm=build.assets['pkg/celestial_wasm_bg.wasm']?.sha256;if(wasm)provenance=JSON.stringify({revision:build.revision,wasm});}catch{/* Portable replays remain available without build metadata. */}
  const checkpoints=provenance&&globalThis.indexedDB?new CheckpointCache({provenance,store:new IndexedCheckpointStore()}):null;
  const runtime = new Runtime(Simulation, (message,transfer=[]) => self.postMessage(message,transfer),{checkpoints,provenance});
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
