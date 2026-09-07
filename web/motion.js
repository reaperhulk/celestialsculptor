// Shared presentation sampling keeps a tracked body and its camera in the same frame.
export function interpolationAlpha(time,received,previousReceived,playing,sameGeneration){
 const interval=received-previousReceived;
 return playing&&sameGeneration&&interval>0&&interval<.25?Math.max(0,Math.min(1,(time-received)/interval)):1;
}
export function sampleBody(body,previous,alpha,out={}){
 const from=previous||body;out.x=from.pos.x+(body.pos.x-from.pos.x)*alpha;out.y=from.pos.y+(body.pos.y-from.pos.y)*alpha;
 const start=from.rotation||0,end=body.rotation||0;out.rotation=start+Math.atan2(Math.sin(end-start),Math.cos(end-start))*alpha;return out;
}
// Transport snapshots can repeat a physics tick at slow playback. They must not
// replace the two distinct states used for interpolation.
export class MotionSamples {
 push(state,time){
  const old=this.current,changed=!old||old.generation!==state.generation||old.tick!==state.tick||old.playing!==state.playing||old.observation_stamp?.[1]!==state.observation_stamp?.[1];
  if(changed){this.previous=old;this.previousTime=this.time;this.time=time;}
  this.current=state;return changed;
 }
}
