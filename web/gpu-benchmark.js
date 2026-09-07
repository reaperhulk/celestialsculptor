import {GpuGravity} from './gpu-gravity.js';
import {BODY_FRAME_STRIDE} from './body-frame.js';
export function forceError(reference,candidate,particles){
 let error=0,scale=0,force=0,fx=0,fy=0;const relative=[];
 for(let i=0;i<candidate.length;i+=2){const dx=candidate[i]-reference[i],dy=candidate[i+1]-reference[i+1],norm=Math.hypot(reference[i],reference[i+1]),mass=particles[i/2*3+2];error+=dx*dx+dy*dy;scale+=norm*norm;relative.push(Math.hypot(dx,dy)/Math.max(norm,1e-12));fx+=candidate[i]*mass;fy+=candidate[i+1]*mass;force+=Math.hypot(candidate[i],candidate[i+1])*mass;}
 relative.sort((a,b)=>a-b);return {rmsRelativeError:Math.sqrt(error/Math.max(scale,1e-30)),p99RelativeError:relative[Math.floor((relative.length-1)*.99)],maxRelativeError:relative.at(-1),momentumResidual:Math.hypot(fx,fy)/Math.max(force,1e-30)};
}
export async function runGpuBenchmark({counts=[64,1024,4096],rounds=5,fallback=false,progress=()=>{}}={}){
 const gpu=await GpuGravity.create({fallback});if(!gpu)return {supported:false,reason:'WebGPU compute is unavailable in this browser. The WASM solver remains active.'};
 try{
  const {default:init,Simulation}=await import('./pkg/celestial_wasm.js');await init();const cases=[];
  for(const kind of ['swarm','moons'])for(const bodies of kind==='moons'?[64]:counts){
   progress(`Measuring ${bodies.toLocaleString()} bodies · ${kind}…`);
   const sim=new Simulation(JSON.stringify({seed:42,mission:null,star_mass:1}));
   try{
    if(kind==='moons'){sim.command(JSON.stringify({type:'launch_mass',kind:'giant',mass:318,radius:3,angle:0,speed:1}));for(const [distance,speed] of [[.035,1],[.075,-1]])sim.command(JSON.stringify({type:'launch_moon',parent:1,kind:'rocky',mass:.003,distance,angle:1,speed}));}
    sim.command(JSON.stringify({type:'seed_swarm',count:bodies-(kind==='moons'?4:1),disorder:0}));
    const frame=sim.body_frame(),particles=new Float64Array(bodies*3);for(let i=0;i<bodies;i++){particles[i*3]=frame[i*BODY_FRAME_STRIDE+4];particles[i*3+1]=frame[i*BODY_FRAME_STRIDE+5];particles[i*3+2]=frame[i*BODY_FRAME_STRIDE+2];}
    const reference=sim.force_snapshot(true),samples={direct:[],tree:[],gpu:[]};let candidate;
    for(let round=0;round<rounds+2;round++){
     // Alternate CPU/GPU order; GPU timing includes upload, dispatch, map and copy.
     for(const mode of round%2?['gpu','tree','direct']:['direct','tree','gpu']){
      const start=performance.now();if(mode==='gpu')candidate=await gpu.compute(particles);else sim.benchmark_gravity(mode==='direct',1);const elapsed=performance.now()-start;if(round>=2)samples[mode].push(elapsed);
     }
    }
    const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)],directMs=median(samples.direct),treeMs=median(samples.tree),gpuMs=median(samples.gpu);
    cases.push({bodies,kind,directMs,treeMs,gpuRoundTripMs:gpuMs,speedupVsBestCpu:Math.min(directMs,treeMs)/gpuMs,...forceError(reference,candidate,particles),samples});
   }finally{sim.free();}
  }
  return {supported:true,adapter:gpu.info,browser:navigator.userAgent,cases,livePhysicsEnabled:false,scope:'Force-kernel candidate including GPU transfer/readback. GPU f32 precision and cross-device replay have not been qualified for live integration; the production solver remains f64 WASM.'};
 }finally{gpu.dispose();}
}
