// Keep the latest user intent while older worker snapshots are in flight.
export class PlayControl {
  constructor(send, update) { this.send=send; this.update=update; this.playing=false; this.pending=0; this.sequence=0; }
  observe(state) { this.confirmed=state.playing;if(!this.pending){this.playing=state.playing;this.update(this.playing);} }
  set(value) {
    const sequence=++this.sequence;this.pending=sequence;this.playing=value;this.update(value);
    return this.send('play',{value},()=>this.pending===sequence).then(reply=>{
      if(this.pending===sequence){this.pending=0;this.playing=reply.playing;this.update(this.playing);}
      return reply;
    },error=>{if(this.pending!==sequence)return {playing:this.playing};this.pending=0;this.playing=this.confirmed??false;this.update(this.playing);throw error;});
  }
  toggle() { return this.set(!this.playing); }
}
