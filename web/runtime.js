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
    this.timelineSource=null;this.timelineHistory=null;this.timelineEnd=0;
    this.eventPolicy='off';
  }
  state(id) {
    if (!this.sim) return;
    const snapshot = JSON.parse(this.sim.snapshot());
    this.send({ type: 'state', id, ...snapshot, timeline_end:this.timelineSource?this.timelineEnd:snapshot.tick, reviewing:Boolean(this.timelineSource), playing: this.playing, speed: this.speed, event_policy:this.eventPolicy, generation: this.generation });
  }
  handle(message) {
    const { type, id } = message ?? {};
    try {
      if (type === 'reset') {
        const next = new this.Simulation(JSON.stringify(message.config));
        this.sim?.free(); this.sim = next; this.playing = false; this.debt = 0;this.timelineSource=null;this.timelineHistory=null;
      } else {
        if (!this.sim) throw new Error('The simulation is still loading.');
        switch (type) {
          case 'command': this.sim.command(JSON.stringify(message.command)); this.timelineSource=null;this.timelineHistory=null;break;
          case 'play': if(typeof message.value!=='boolean')throw new Error('Playback requires true or false');this.playing = message.value; this.debt = 0;if(message.value)this.timelineSource=null;this.timelineHistory=null;break;
          case 'speed':
            if (![0.25, 1, 4, 16].includes(message.value)) throw new Error('Invalid playback speed');
            this.speed = message.value; break;
          case 'seek': {
            const history=this.timelineSource?this.timelineHistory:JSON.parse(this.sim.observations());
            const source=this.timelineSource||this.sim.export_replay(),replay=JSON.parse(source),endTick=replay.end_tick;
            if(!Number.isInteger(message.tick)||message.tick<0||message.tick>replay.end_tick)throw new Error('Choose a time inside the recorded experiment');
            replay.commands=replay.commands.filter(action=>action.tick<=message.tick);replay.end_tick=message.tick;
            this.sim.import_replay(JSON.stringify(replay));this.timelineSource=source;this.timelineHistory=history;this.timelineEnd=endTick;this.playing=false;this.debt=0;break;
          }
          case 'step': this.timelineSource=null;this.timelineHistory=null; this.playing = false; this.sim.advance(16); break;
          case 'rewind': this.sim.rewind();this.timelineSource=null;this.timelineHistory=null; this.playing = false; this.debt = 0; break;
          case 'undo': this.sim.undo();this.timelineSource=null;this.timelineHistory=null; this.playing = false; this.debt = 0; break;
          case 'export': this.send({type: 'export', id, replay: this.sim.export_replay()}); return;
          case 'import': this.sim.import_replay(message.replay);this.timelineSource=null;this.timelineHistory=null; this.playing = false; this.debt = 0; break;
          case 'snapshot': break;
          case 'event_policy':
            if(!['off','pause','slow'].includes(message.value))throw new Error('Choose how to watch major events');
            this.eventPolicy=message.value;break;
          case 'observations': this.send({type:'observations',id,history:this.timelineSource?this.timelineHistory:JSON.parse(this.sim.observations())});return;
          case 'original': {
            const replay=this.timelineSource||this.sim.export_replay();
            const temp=new this.Simulation(JSON.stringify(JSON.parse(replay).config));
            try{temp.import_replay(replay);this.send({type:'original',id,replay,snapshot:JSON.parse(temp.snapshot())});}finally{temp.free();}return;
          }
          case 'compare': {
            if(!Array.isArray(message.replays)||message.replays.length!==2||message.replays.some(r=>typeof r!=='string'||r.length>512000))throw new Error('Choose two valid experiments');
            const replays=message.replays.map(r=>JSON.parse(r));const tick=Math.min(...replays.map(r=>r.end_tick));
            const states=replays.map(replay=>{const temp=new this.Simulation(JSON.stringify(replay.config));try{temp.import_replay(JSON.stringify({...replay,end_tick:tick,commands:replay.commands.filter(c=>c.tick<=tick)}));return JSON.parse(temp.snapshot());}finally{temp.free();}});
            this.send({type:'comparison',id,tick,states});return;
          }
          default: throw new Error('Unknown simulation command');
        }
      }
      if(['reset','import','rewind','undo','seek'].includes(type))this.generation++;
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
      if(this.eventPolicy==='off')this.sim.advance(ticks);
      else {
        for(let remaining=ticks;remaining>0;){
          const count=Math.min(8,remaining),serial=this.sim.event_serial();this.sim.advance(count);remaining-=count;
          if(this.sim.event_serial()!==serial){this.debt=0;if(this.eventPolicy==='pause')this.playing=false;else this.speed=.25;break;}
        }
      }
      const current = this.sim.flags();
      if ((current & 2) || (!(previous & 1) && (current & 1))) this.playing = false;
    }
  }
}
