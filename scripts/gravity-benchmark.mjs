import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {cpus,arch,tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const pkg=await mkdtemp(join(tmpdir(),'celestial-gravity-'));
const target=resolve('target/gravity-benchmark');
execFileSync('cargo',['build','--release','--locked','-p','celestial-wasm','--features','benchmarks','--target','wasm32-unknown-unknown'],{env:{...process.env,CARGO_TARGET_DIR:target},stdio:'inherit'});
execFileSync('wasm-bindgen',[join(target,'wasm32-unknown-unknown/release/celestial_wasm.wasm'),'--target','web','--out-dir',pkg,'--out-name','celestial_wasm'],{stdio:'inherit'});
await writeFile(join(pkg,'package.json'),' {"type":"module"}');
const {default:init,GravityProbe}=await import(pathToFileURL(join(pkg,'celestial_wasm.js')).href);
await init({module_or_path:await readFile(join(pkg,'celestial_wasm_bg.wasm'))});
try {
const cases=[];
for(const cluster of [false,true])for(const bodies of [64,128,256,512,1024,2048,4096,8192]){
 const probe=new GravityProbe(bodies,42,cluster,0);
 try{
  probe.run(-1,1);const reference=probe.forces(),particles=probe.particles();
  const norm=Math.sqrt(reference.slice(2).reduce((s,v)=>s+v*v,0)/(bodies-1));
  const candidates=[];
  for(const theta of [0,.2,.25,.35,.5]){
   const samples=[],repeats=Math.max(1,Math.min(32,Math.floor(8192/bodies)));
   for(let round=0;round<10;round++){const start=performance.now();probe.run(theta,repeats);if(round>=3)samples.push((performance.now()-start)/repeats);}
   const forces=probe.forces(),relative=[];let error2=0,scale2=0,fx=0,fy=0,forceScale=0,torque=0,torqueScale=0;
   for(let i=1;i<bodies;i++){const x=forces[2*i],y=forces[2*i+1],rx=reference[2*i],ry=reference[2*i+1],error=Math.hypot(x-rx,y-ry);error2+=error*error;scale2+=rx*rx+ry*ry;relative.push(error/Math.max(Math.hypot(rx,ry),norm*1e-3));const px=particles[3*i],py=particles[3*i+1],m=particles[3*i+2];fx+=x*m;fy+=y*m;forceScale+=Math.hypot(x,y)*m;torque+=(px*y-py*x)*m;torqueScale+=Math.hypot(px,py)*Math.hypot(x,y)*m;}
   relative.sort((a,b)=>a-b);const rmsError=Math.sqrt(error2/scale2),momentumError=Math.hypot(fx,fy)/forceScale,torqueError=Math.abs(torque)/torqueScale;
   assert.ok(rmsError<.005,`force RMS error: ${bodies}/${cluster}/${theta}: ${rmsError}`);
   assert.ok(momentumError<1e-12&&torqueError<1e-12,'force conservation');
   if(theta===0)assert.deepEqual(forces,reference,'scalar/SIMD exact reference');
   candidates.push({theta,medianMs:[...samples].sort((a,b)=>a-b)[3],rmsError,p99Error:relative[Math.floor(relative.length*.99)],maxError:relative.at(-1),momentumError,torqueError,...JSON.parse(probe.statistics()),samples});
  }
  const direct=candidates[0].medianMs;for(const c of candidates)c.speedup=direct/c.medianMs;
  cases.push({bodies,cluster,candidates});console.log(JSON.stringify({bodies,cluster,candidates:candidates.map(({samples,...c})=>c)}));
 }finally{probe.free();}
}
await writeFile('gravity-benchmark-results.json',JSON.stringify({revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),architecture:arch(),cpu:cpus()[0]?.model,node:process.version,scope:'Force kernels only. Tree timings include construction. Error excludes the dominating star. Not whole-game FPS.',cases},null,2)+'\n');

} finally {await rm(pkg,{recursive:true,force:true});}
