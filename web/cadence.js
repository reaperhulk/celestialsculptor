// Rendering cadence can change; the physics timestep never does.
export class FrameClock {
 constructor(){this.last=-Infinity;}
 due(now,{playing=false,batterySaver=false,reduceMotion=false,hidden=false}={}){
  if(hidden){this.last=-Infinity;return false;}
  const fps=playing?(batterySaver?30:60):(reduceMotion?15:30);
  if(now-this.last<1000/fps-.1)return false;
  this.last=now;return true;
 }
}
