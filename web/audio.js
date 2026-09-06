// Sound is opt-in and entirely local. No media downloads or autoplay attempts.
export class Soundscape {
  constructor(){this.enabled=false;this.context=null;this.voices=0;this.volume=.7;}
  setVolume(value){if(!Number.isFinite(value))return;this.volume=Math.max(0,Math.min(1,value));if(this.master)this.master.gain.setTargetAtTime(.12*this.volume,this.context.currentTime,.04);}
  async toggle(){
    if(!this.context){
      const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
      if(!Context)throw new Error('Sound is unavailable in this browser.');
      this.context=new Context();this.master=this.context.createGain();this.master.gain.value=.12*this.volume;
      this.master.connect(this.context.destination);
      this.ambient=this.context.createGain();this.ambient.gain.value=.04;this.ambient.connect(this.master);
      for(const frequency of [55,82.4069,110.12]){
        const oscillator=this.context.createOscillator();oscillator.type='sine';oscillator.frequency.value=frequency;oscillator.connect(this.ambient);oscillator.start();
      }
    }
    const enabled=!this.enabled;
    if(enabled)await this.context.resume();else await this.context.suspend();
    this.enabled=enabled;if(enabled)this.event('launch');
    return this.enabled;
  }
  note(frequency,start,duration=.65){
    if(!this.enabled||this.context?.state!=='running'||this.voices>=12)return;
    const ctx=this.context,osc=ctx.createOscillator(),gain=ctx.createGain(),now=ctx.currentTime+start;
    osc.type='sine';osc.frequency.setValueAtTime(frequency,now);
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.35,now+.02);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    osc.connect(gain);gain.connect(this.master);osc.start(now);osc.stop(now+duration+.05);this.voices++;
    osc.onended=()=>{osc.disconnect();gain.disconnect();this.voices--;};
  }
  event(kind){
    const notes={launch:[220,330],placed:[220,330],seed:[164.81,246.94,329.63],nudge:[293.66,349.23],collision:[130.81,196],escape:[523.25,392,261.63],absorb:[110,82.41],complete:[261.63,329.63,392,523.25]}[kind]||[];
    notes.forEach((frequency,i)=>this.note(frequency,i*.12,kind==='complete'?1.5:.7));
  }
  async visibility(hidden){if(!this.context||!this.enabled)return;if(hidden)await this.context.suspend();else await this.context.resume();}
}
