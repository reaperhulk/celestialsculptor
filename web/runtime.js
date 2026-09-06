// Worker-owned controller. Its protocol is tested with real WASM without graphics.
export class Runtime {
  constructor(Simulation, send) {
    this.Simulation = Simulation;
    this.send = send;
    this.sim = null;
    this.playing = false;
    this.speed = 1;
    this.debt = 0;
    this.generation = 0;
  }
  state(id) {
    if (!this.sim) return;
    const snapshot = JSON.parse(this.sim.snapshot());
    this.send({ type: 'state', id, ...snapshot, playing: this.playing, speed: this.speed, generation: this.generation });
  }
  handle(message) {
    const { type, id } = message ?? {};
    try {
      if (type === 'reset') {
        const next = new this.Simulation(JSON.stringify(message.config));
        this.sim?.free(); this.sim = next; this.playing = false; this.debt = 0;
      } else {
        if (!this.sim) throw new Error('The simulation is still loading.');
        switch (type) {
          case 'command': this.sim.command(JSON.stringify(message.command)); break;
          case 'play': if(typeof message.value!=='boolean')throw new Error('Playback requires true or false');this.playing = message.value; this.debt = 0; break;
          case 'speed':
            if (![0.25, 1, 4, 16].includes(message.value)) throw new Error('Invalid playback speed');
            this.speed = message.value; break;
          case 'step': this.playing = false; this.sim.advance(16); break;
          case 'rewind': this.sim.rewind(); this.playing = false; this.debt = 0; break;
          case 'undo': this.sim.undo(); this.playing = false; this.debt = 0; break;
          case 'export': this.send({type: 'export', id, replay: this.sim.export_replay()}); return;
          case 'import': this.sim.import_replay(message.replay); this.playing = false; this.debt = 0; break;
          case 'snapshot': break;
          default: throw new Error('Unknown simulation command');
        }
      }
      if(['reset','import','rewind','undo'].includes(type))this.generation++;
      this.state(id);
    } catch (error) { this.send({ type: 'error', id, message: String(error?.message || error) }); }
  }
  advanceElapsed(seconds) {
    if (!this.playing || !this.sim || !Number.isFinite(seconds) || seconds <= 0) return;
    // Backpressure is explicit. A slow worker slows simulated time; dt never grows.
    this.debt = Math.min(128, this.debt + Math.max(0, Math.min(0.1, seconds)) * 102.4 * this.speed);
    const ticks = Math.floor(this.debt);
    this.debt -= ticks;
    if (ticks) {
      const previous = this.sim.flags();
      this.sim.advance(ticks);
      const current = this.sim.flags();
      if ((current & 2) || (!(previous & 1) && (current & 1))) this.playing = false;
    }
  }
}
