// Keep a phase clock: small RAF jitter must not turn a 60-Hz target into 30 fps.
export class FrameClock {
 constructor(){this.next=-Infinity;this.fps=0;}
 due(now,{playing=false,batterySaver=false,reduceMotion=false,hidden=false}={}){
  if(hidden){this.next=-Infinity;return false;}
  const fps=playing?(batterySaver?30:60):(reduceMotion?15:30),interval=1000/fps;
  if(fps!==this.fps){this.fps=fps;this.next=now;}
  if(now<this.next-.5)return false;
  this.next=now-this.next>interval?now+interval:this.next+interval;return true;
 }
}
