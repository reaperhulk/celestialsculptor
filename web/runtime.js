import {PLAYBACK_SPEEDS} from './playback.js';
import {historyView} from './history-view.js';
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
    this.send({ type: 'state', id, ...snapshot, busy:this.operation?.type||null, timeline_end:this.timelineSource?this.timelineEnd:snapshot.tick, reviewing:Boolean(this.timelineSource), playing: this.playing, speed: this.speed, event_policy:this.eventPolicy, generation: this.generation });
  }
  // Production message entrypoint. Replays yield between small WASM slices so
  // Pause, reset and status requests never sit behind years of reconstruction.
  receive(message) {
    const type=message?.type;
    if(['reset','import','seek','undo','rewind'].includes(type)||type==='play')this.operation=null;
    if(['import','seek','undo','rewind','compare','original'].includes(type)){
      if(this.operation){this.send({type:'error',id:message.id,message:'An experiment is already being reconstructed.'});return;}
      return this.rebuild(message);
    }
    if(this.operation&&['command','step'].includes(type)){this.send({type:'error',id:message.id,message:'Wait for reconstruction or pause to cancel it before editing.'});return;}
    return this.handle(message);
  }
  async reconstruct(replay,operation) {
    const input=typeof replay==='string'?replay:JSON.stringify(replay);
    if(input.length>512000)throw new Error('Experiment file is too large');
    const data=JSON.parse(input),temp=new this.Simulation(JSON.stringify(data.config));
    try {
      temp.begin_import(input);
      let slice=performance.now(),reported=-Infinity;
      for(;;){
        if(this.operation!==operation)throw new Error('Reconstruction cancelled. Your current experiment is unchanged.');
        if(temp.advance_import(32))return temp;
        const now=performance.now();
        if(now-reported>=250){this.send({type:'progress',id:operation.id,operation:operation.type,tick:temp.import_tick(),end_tick:data.end_tick});reported=now;}
        if(now-slice>=6){await new Promise(resolve=>setTimeout(resolve,0));slice=performance.now();}
      }
    }catch(error){temp.free();throw error;}
  }
  async rebuild(message) {
    const {type,id}=message;
    if(!this.sim){this.send({type:'error',id,message:'The simulation is still loading.'});return;}
    if(type==='original'&&!this.timelineSource){this.send({type:'original',id,replay:this.sim.export_replay(),snapshot:JSON.parse(this.sim.snapshot())});return;}
    const operation={type,id};this.operation=operation;this.playing=false;this.debt=0;this.state();
    let next;
    try{
      if(type==='compare'){
        if(!Array.isArray(message.replays)||message.replays.length!==2||message.replays.some(r=>typeof r!=='string'||r.length>512000))throw new Error('Choose two valid experiments');
        const replays=message.replays.map(r=>JSON.parse(r)),end=Math.min(...replays.map(r=>r.end_tick)),tick=message.tick??end;
        if(!Number.isInteger(tick)||tick<0||tick>end)throw new Error('Choose an age inside both recorded experiments');
        const states=[],histories=[];
        for(const replay of replays){next=await this.reconstruct({...replay,end_tick:tick,commands:replay.commands.filter(c=>c.tick<=tick)},operation);states.push(JSON.parse(next.snapshot()));if(message.include_history)histories.push(JSON.parse(next.observations()));next.free();next=null;}
        this.send({type:'comparison',id,tick,states,...(message.include_history?{histories}:{})});return;
      }
      let source,history,end;
      let replay=type==='import'?message.replay:this.sim.export_replay();
      if(type==='original')replay=this.timelineSource;
      if(type==='seek'){
        source=this.timelineSource||replay;history=this.timelineSource?this.timelineHistory:JSON.parse(this.sim.observations());
        replay=JSON.parse(source);end=replay.end_tick;
        if(!Number.isInteger(message.tick)||message.tick<0||message.tick>end)throw new Error('Choose a time inside the recorded experiment');
        replay.commands=replay.commands.filter(c=>c.tick<=message.tick);replay.end_tick=message.tick;
      }else if(type==='undo'||type==='rewind'){
        replay=JSON.parse(replay);
        if(type==='undo'){if(!replay.commands.pop())throw new Error('No sculpting actions to undo');}
        else{replay.commands=replay.commands.filter(c=>c.tick===0);replay.end_tick=0;}
      }
      next=await this.reconstruct(replay,operation);
      if(this.operation!==operation)throw new Error('Reconstruction cancelled. Your current experiment is unchanged.');
      if(type==='original'){this.send({type:'original',id,replay,snapshot:JSON.parse(next.snapshot())});return;}
      this.sim.free();this.sim=next;next=null;this.generation++;
      this.timelineSource=type==='seek'?source:null;this.timelineHistory=type==='seek'?history:null;if(type==='seek')this.timelineEnd=end;
      this.operation=null;this.state(id);
    }catch(error){this.send({type:'error',id,message:String(error?.message||error)});}
    finally{next?.free();if(this.operation===operation){this.operation=null;this.state();}}
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
          case 'play': if(typeof message.value!=='boolean')throw new Error('Playback requires true or false');this.playing = message.value; this.debt = 0;if(message.value){this.timelineSource=null;this.timelineHistory=null;}break;
          case 'speed':
            if (!PLAYBACK_SPEEDS.includes(message.value)) throw new Error('Invalid playback speed');
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
          case 'balances': this.send({type:'balances',id,balances:JSON.parse(this.sim.balances())});return;
          case 'snapshot': break;
          case 'event_policy':
            if(!['off','pause','slow'].includes(message.value))throw new Error('Choose how to watch major events');
            this.eventPolicy=message.value;break;
          case 'observations': {const filter=message.filter;const history=filter?(this.timelineSource?historyView(this.timelineHistory,filter):JSON.parse(this.sim.observation_view(filter.body||0,filter.inner||0,filter.outer||0))):(this.timelineSource?this.timelineHistory:JSON.parse(this.sim.observations()));this.send({type:'observations',id,history});return;}
          case 'original': {
            const replay=this.timelineSource||this.sim.export_replay();
            const temp=new this.Simulation(JSON.stringify(JSON.parse(replay).config));
            try{temp.import_replay(replay);this.send({type:'original',id,replay,snapshot:JSON.parse(temp.snapshot())});}finally{temp.free();}return;
          }
          case 'compare': {
            if(!Array.isArray(message.replays)||message.replays.length!==2||message.replays.some(r=>typeof r!=='string'||r.length>512000))throw new Error('Choose two valid experiments');
            const replays=message.replays.map(r=>JSON.parse(r));const end=Math.min(...replays.map(r=>r.end_tick)),tick=message.tick??end;if(!Number.isInteger(tick)||tick<0||tick>end)throw new Error('Choose an age inside both recorded experiments');
            const histories=[];
            const states=replays.map(replay=>{const temp=new this.Simulation(JSON.stringify(replay.config));try{temp.import_replay(JSON.stringify({...replay,end_tick:tick,commands:replay.commands.filter(c=>c.tick<=tick)}));if(message.include_history)histories.push(JSON.parse(temp.observations()));return JSON.parse(temp.snapshot());}finally{temp.free();}});
            this.send({type:'comparison',id,tick,states,...(message.include_history?{histories}:{})});return;
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
