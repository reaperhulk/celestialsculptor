// Fixed histograms keep a five-minute device recording independent of run length.
export class DeviceRecording {
 constructor(metadata,duration=300000){this.metadata=metadata;this.duration=duration;this.elapsed=0;this.frames=0;this.intervals=new Uint32Array(1001);this.draws=new Uint32Array(1001);this.last=null;this.lastTick=null;this.ticks=0;this.maxInterval=0;this.done=false;this.reason='recording';}
 record(time,cost,tick,active){
  if(this.done)return;if(!active){this.last=null;this.lastTick=null;return;}
  if(this.last!==null){const dt=Math.max(0,time-this.last);this.elapsed+=dt;this.frames++;this.ticks+=Math.max(0,tick-this.lastTick);this.maxInterval=Math.max(this.maxInterval,dt);this.intervals[Math.min(1000,Math.round(dt*4))]++;this.draws[Math.min(1000,Math.round(cost*4))]++;}
  this.last=time;this.lastTick=tick;if(this.elapsed>=this.duration)this.stop('completed');
 }
 stop(reason='stopped'){this.done=true;this.reason=reason;}
 report(){const percentile=(bins,p)=>{const target=Math.ceil(this.frames*p);let count=0;for(let i=0;i<bins.length;i++){count+=bins[i];if(count>=target)return i/4;}return 0;};return {format:'celestial-device-recording',version:1,...this.metadata,reason:this.reason,activeSeconds:this.elapsed/1000,frames:this.frames,fps:this.elapsed?this.frames*1000/this.elapsed:0,p50FrameMs:percentile(this.intervals,.5),p95FrameMs:percentile(this.intervals,.95),p99FrameMs:percentile(this.intervals,.99),p95DrawCpuMs:percentile(this.draws,.95),maxFrameMs:this.maxInterval,ticksPerSecond:this.elapsed?this.ticks*1000/this.elapsed:0,histogramOverflowFrames:this.intervals[1000]};}
}
export function deviceScenario(name){
 const config={mission:null,seed:42,star_mass:1};let commands;
 if(name==='stress')commands=Array.from({length:63},(_,i)=>({type:'launch',kind:'rocky',radius:.5+(i+1)*.08,angle:(i+1)*2.399963229728653,speed:1}));
 else commands=[{type:'generate_system',style:name==='moons'?'moons':'nursery',count:name==='moons'?9:32,chaos:name==='moons'?.3:.4}];
 return {version:5,config,end_tick:0,commands:commands.map(command=>({tick:0,command}))};
}
