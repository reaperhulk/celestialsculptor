// Leaf-size and opening-angle hill climb with an independent force oracle.
import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir,arch,cpus} from 'node:os';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';
const pkg=await mkdtemp(join(tmpdir(),'celestial-tuning-')),target=resolve('target/gravity-benchmark');
execFileSync('cargo',['build','--release','--locked','-p','celestial-wasm','--features','benchmarks','--target','wasm32-unknown-unknown'],{env:{...process.env,CARGO_TARGET_DIR:target},stdio:'inherit'});
execFileSync('wasm-bindgen',[join(target,'wasm32-unknown-unknown/release/celestial_wasm.wasm'),'--target','web','--out-dir',pkg,'--out-name','celestial_wasm'],{stdio:'inherit'});
await writeFile(join(pkg,'package.json'),'{"type":"module"}');
const {default:init,GravityProbe}=await import(pathToFileURL(join(pkg,'celestial_wasm.js')).href);
await init({module_or_path:await readFile(join(pkg,'celestial_wasm_bg.wasm'))});const results=[];
try{
for(const count of [1024,4096,8192])for(const cluster of [false,true]){
 const p=new GravityProbe(count,42,cluster,0);p.run(-1,1);const ref=p.forces(),particles=p.particles();
 const configs=[2,4,8,16].flatMap(leaf=>[.25,.3,.35].map(theta=>({leaf,theta,cpu:[],wall:[]}))).concat([.001,.0001].map(tolerance=>({leaf:8,theta:.7,tolerance,cpu:[],wall:[]})));
 const run=(c,n)=>c.tolerance?p.run_error_controlled(c.theta,c.tolerance,n):p.run_config(c.theta,c.leaf,n);
 for(let round=0;round<9;round++)for(let pos=0;pos<configs.length;pos++){
  const c=configs[(pos+round*5)%configs.length],start=performance.now(),cpu=process.cpuUsage();run(c,2);const used=process.cpuUsage(cpu);if(round>=2){c.wall.push((performance.now()-start)/2);c.cpu.push((used.user+used.system)/2000);}
 }
 for(const c of configs){run(c,1);const out=p.forces();let error=0,scale=0,fx=0,fy=0,torque=0,force=0,torqueScale=0;const relative=[];
 for(let i=1;i<count;i++){const x=out[2*i],y=out[2*i+1],m=particles[3*i+2],px=particles[3*i],py=particles[3*i+1];error+=(x-ref[2*i])**2+(y-ref[2*i+1])**2;relative.push(Math.hypot(x-ref[2*i],y-ref[2*i+1])/Math.max(Math.hypot(ref[2*i],ref[2*i+1]),1e-12));scale+=ref[2*i]**2+ref[2*i+1]**2;fx+=m*x;fy+=m*y;torque+=(px*y-py*x)*m;force+=Math.hypot(x,y)*m;torqueScale+=Math.hypot(px,py)*Math.hypot(x,y)*m;}
 relative.sort((a,b)=>a-b);const rms=Math.sqrt(error/scale),momentum=Math.hypot(fx,fy)/force,angular=Math.abs(torque)/torqueScale;assert.ok(rms<.005&&momentum<1e-12&&angular<1e-12);const median=a=>[...a].sort((a,b)=>a-b)[3];const result={count,cluster,leaf:c.leaf,theta:c.theta,tolerance:c.tolerance,cpuMs:median(c.cpu),wallMs:median(c.wall),rms,p99:relative[Math.floor(relative.length*.99)],max:relative.at(-1),momentum,angular,...JSON.parse(p.statistics()),samples:c};results.push(result);console.log(JSON.stringify({...result,samples:undefined}));}
 p.free();
}
await writeFile('tree-tuning-results.json',JSON.stringify({revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),architecture:arch(),cpu:cpus()[0]?.model,node:process.version,scope:'Tree force candidates, including construction. Cyclic order and warmed CPU/wall samples. Error excludes the star. Live settings are unchanged by this probe.',cases:results},null,2)+'\n');
}finally{await rm(pkg,{recursive:true,force:true});}
