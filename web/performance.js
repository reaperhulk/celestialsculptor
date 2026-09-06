export class FrameMeter {
 constructor(){this.frames=[];this.costs=[];this.lastReport=0;this.lastTick=0;}
 record(time,cost){this.frames.push(time);this.costs.push(cost);if(this.frames.length>120){this.frames.shift();this.costs.shift();}}
 report(now,tick){
  if(now-this.lastReport<500||this.frames.length<2)return null;
  const intervals=this.frames.slice(1).map((time,i)=>time-this.frames[i]).sort((a,b)=>a-b);
  const elapsed=this.frames.at(-1)-this.frames[0],costs=[...this.costs].sort((a,b)=>a-b);
  const result={fps:(this.frames.length-1)*1000/elapsed,p95:intervals[Math.floor((intervals.length-1)*.95)],drawMs:costs[Math.floor((costs.length-1)*.95)],ticksPerSecond:Math.max(0,(tick-this.lastTick)*1000/(now-this.lastReport))};
  this.lastTick=tick;this.lastReport=now;return result;
 }
 reset(){this.frames=[];this.costs=[];this.lastReport=0;this.lastTick=0;}
}
export function fpsFlag(search,persisted=false){const value=new URLSearchParams(search).get('fps');return value===null?persisted:value==='1';}
