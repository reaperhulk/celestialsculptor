import {BASE_TICKS_PER_SECOND} from './playback.js';

export function simulationPace(ticksPerSecond,speed=1,playing=true){
 const valid=Number.isFinite(speed)&&speed>0,rate=Number.isFinite(ticksPerSecond)?Math.max(0,ticksPerSecond):0;
 return {requestedSpeed:valid?speed:null,achievedSpeed:playing?rate/BASE_TICKS_PER_SECOND:0,targetTicksPerSecond:playing&&valid?speed*BASE_TICKS_PER_SECOND:0,throughputRatio:playing&&valid?rate/(speed*BASE_TICKS_PER_SECOND):null};
}
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
 reset(now=0,tick=0){this.frames=[];this.costs=[];this.lastReport=now;this.lastTick=tick;}
}
export function fpsFlag(search,persisted=false){const value=new URLSearchParams(search).get('fps');return value===null?persisted:value==='1';}
