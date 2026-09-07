import {GpuGravity,GRAVITY_SHADER} from './gpu-gravity.js';
import {validateOrbitState} from './gpu-orbit-probe.js';
import {orbitError,orbitBalances} from './gpu-orbit-benchmark.js';
const CUTOFF=.2,G=39.47841760435743,H=1/2048;
// Partition the radial force continuously. The star and the close part stay f64;
// only the distant, weaker contribution uses f32. This is a research prototype.
const shader=GRAVITY_SHADER.replace('if(base+j!=index){','if(index!=0u&&base+j!=0u&&base+j!=index){').replace('acceleration+=d*','let far=smoothstep(0.1,0.2,sqrt(dot(d,d)));acceleration+=far*d*');
const weight=r=>{const t=Math.max(0,Math.min(1,(r-CUTOFF/2)/(CUTOFF/2)));return t*t*(3-2*t);};
export class MixedOrbitProbe {
 static async create(options={}){const gpu=await GpuGravity.create({...options,shaderCode:shader});return gpu?new MixedOrbitProbe(gpu):null;}
 constructor(gpu){this.gpu=gpu;this.busy=false;}
 reset(state){if(this.busy)throw new Error('Mixed probe is busy');validateOrbitState(state);this.state=state.slice();this.acceleration=null;this.particles=new Float64Array(state.length/5*3);}
 async force(){
  const s=this.state,n=s.length/5;for(let i=0;i<n;i++)this.particles.set([s[i*5],s[i*5+1],s[i*5+4]],i*3);
  const a=Float64Array.from(await this.gpu.compute(this.particles));
  const pair=(i,j,w)=>{const dx=s[j*5]-s[i*5],dy=s[j*5+1]-s[i*5+1],r2=dx*dx+dy*dy+1e-8,f=w*G/(r2*Math.sqrt(r2));a[i*2]+=dx*f*s[j*5+4];a[i*2+1]+=dy*f*s[j*5+4];a[j*2]-=dx*f*s[i*5+4];a[j*2+1]-=dy*f*s[i*5+4];};
  for(let j=1;j<n;j++)pair(0,j,1);
  const cells=new Map();for(let i=1;i<n;i++){const x=Math.floor(s[i*5]/CUTOFF),y=Math.floor(s[i*5+1]/CUTOFF);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const j of cells.get(`${x+dx}:${y+dy}`)||[]){const r=Math.hypot(s[i*5]-s[j*5],s[i*5+1]-s[j*5+1]);if(r<CUTOFF)pair(i,j,1-weight(r));}const key=`${x}:${y}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);}
  return a;
 }
 async advance(ticks){if(!Number.isInteger(ticks)||ticks<1||ticks>32||!this.state||this.busy)throw new Error('Reset an idle probe, then advance 1–32 ticks');this.busy=true;try{if(!this.acceleration)this.acceleration=await this.force();const s=this.state;for(let step=0;step<ticks*4;step++){for(let i=0;i<s.length/5;i++){s[i*5+2]+=this.acceleration[i*2]*H/2;s[i*5+3]+=this.acceleration[i*2+1]*H/2;s[i*5]+=s[i*5+2]*H;s[i*5+1]+=s[i*5+3]*H;}this.acceleration=await this.force();for(let i=0;i<s.length/5;i++){s[i*5+2]+=this.acceleration[i*2]*H/2;s[i*5+3]+=this.acceleration[i*2+1]*H/2;}}if(!s.every(Number.isFinite))throw new Error('Non-finite mixed trajectory');return s.slice();}finally{this.busy=false;}}
 dispose(){this.gpu.dispose();}
}
export async function runMixedBenchmark({fallback=false,counts=[64,1024],ticks=8}={}){
 const gpu=await MixedOrbitProbe.create({fallback});if(!gpu)return {supported:false};
 try{const {default:init,Simulation,OrbitProbe}=await import('./pkg/celestial_wasm.js');await init();const {orbitState}=await import('./gpu-orbit-benchmark.js');const cases=[];
  for(const count of counts){const sim=new Simulation(JSON.stringify({seed:42,mission:null,star_mass:1}));let initial;try{sim.command(JSON.stringify({type:'seed_swarm',count:count-1,disorder:0}));initial=orbitState(sim.body_frame());}finally{sim.free();}
   const cpu=new OrbitProbe(initial,false),start=performance.now();let reference;try{cpu.advance(ticks);reference=cpu.state();}finally{cpu.free();}const cpuMs=performance.now()-start;gpu.reset(initial);const before=performance.now(),candidate=await gpu.advance(ticks),gpuMs=performance.now()-before,balances=orbitBalances(initial),after=orbitBalances(candidate);
   cases.push({bodies:count,ticks,cpuMs,gpuMs,speedup:cpuMs/gpuMs,...orbitError(reference,candidate),relativeEnergyDrift:(after.energy-balances.energy)/Math.abs(balances.energy),momentumResidual:Math.hypot(after.px-balances.px,after.py-balances.py)/balances.momentumScale});
  }
  return {supported:true,adapter:gpu.gpu.info,cases,livePhysicsEnabled:false,scope:'Mixed-precision experiment: f64 state, stellar force and smooth short-range force; f32 distant force. Includes every force transfer, spatial neighbor search and integration step. Collisionless only. Short-run measurements do not qualify 600-year stability.'};
 }finally{gpu.dispose();}
}
