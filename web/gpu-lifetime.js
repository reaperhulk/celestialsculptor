import {GpuOrbitProbe} from './gpu-orbit-probe.js';
import {orbitState,orbitBalances} from './gpu-orbit-benchmark.js';
export function elements(s,i,host=0){const dx=s[i*5]-s[host*5],dy=s[i*5+1]-s[host*5+1],vx=s[i*5+2]-s[host*5+2],vy=s[i*5+3]-s[host*5+3],r=Math.hypot(dx,dy),v2=vx*vx+vy*vy,mu=39.47841760435743*(s[i*5+4]+s[host*5+4]),dot=dx*vx+dy*vy,ex=((v2-mu/r)*dx-dot*vx)/mu,ey=((v2-mu/r)*dy-dot*vy)/mu;return {axis:1/(2/r-v2/mu),eccentricity:Math.hypot(ex,ey),phase:Math.atan2(dy,dx),apsis:Math.atan2(ey,ex)};}
export async function runGpuLifetime({years=600,fallback=false,progress=()=>{}}={}){
 if(!Number.isInteger(years)||years<1||years>600)throw new Error('Use a 1–600-year qualification horizon');
 const gpu=await GpuOrbitProbe.create({fallback});if(!gpu)return {supported:false};let cpu;
 try{const {default:init,Simulation,OrbitProbe}=await import('./pkg/celestial_wasm.js');await init();const sim=new Simulation(JSON.stringify({seed:42,mission:null,star_mass:1}));let initial;
  try{sim.command(JSON.stringify({type:'launch_mass',kind:'giant',mass:318,radius:3,angle:0,speed:1}));for(const [distance,speed] of [[.05,1],[.075,-1]])sim.command(JSON.stringify({type:'launch_moon',parent:1,kind:'rocky',mass:.003,distance,angle:1,speed}));initial=orbitState(sim.body_frame());}finally{sim.free();}
  // Match the GPU's initial quantization so this isolates accumulated arithmetic error.
  const effective=Float64Array.from(initial,Math.fround),before=orbitBalances(effective);cpu=new OrbitProbe(effective,true);gpu.reset(initial,16);const samples=[],budgets={energy:2e-5,axis:.002,eccentricity:.002,phase:.2,apsis:.1};let failure=null;
  for(let year=1;year<=years;year++){cpu.advance_refined(512,16);let candidate;for(let batch=0;batch<16;batch++)candidate=await gpu.advance(32);if(year%5&&year!==years)continue;
   const reference=cpu.state(),after=orbitBalances(candidate),row={year,energy:Math.abs((after.energy-before.energy)/before.energy),axis:0,eccentricity:0,phase:0,apsis:0};
   for(const id of [2,3]){const a=elements(candidate,id,1),b=elements(reference,id,1);row.axis=Math.max(row.axis,Math.abs((a.axis-b.axis)/b.axis));row.eccentricity=Math.max(row.eccentricity,Math.abs(a.eccentricity-b.eccentricity));for(const key of ['phase','apsis'])if(key==='phase'||Math.min(a.eccentricity,b.eccentricity)>1e-4){const delta=a[key]-b[key];row[key]=Math.max(row[key],Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta))));}}
   samples.push(row);progress(`GPU lifetime: ${year} years`);failure=Object.entries(budgets).filter(([key,limit])=>!Number.isFinite(row[key])||row[key]>limit).map(([key])=>key);if(failure.length)break;failure=null;
  }
  return {supported:true,adapter:gpu.gravity.info,requestedYears:years,completedYears:samples.at(-1).year,status:failure?'rejected':'passed requested horizon',failure,budgets,samples,livePhysicsEnabled:false,scope:'Four-body prograde/retrograde moon system; fixed 16 KDK substeps, same quantized initial conditions and masses in the f64 direct-force reference. Stop on the first sampled accuracy failure. Passing this fixture alone would not qualify the complete GPU game.'};
 }finally{cpu?.free();gpu.dispose();}
}
