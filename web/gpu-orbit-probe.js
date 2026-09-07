import {GpuGravity} from './gpu-gravity.js';

// Collisionless qualification only. Every dependency crosses a dispatch boundary;
// no workgroup reads a neighbor's position while another is writing that position.
const INTEGRATION_SHADER=`
struct Params {count:u32, soft2:f32, gravity:f32, h:f32,}
@group(0) @binding(0) var<storage,read_write> particles:array<vec4f>;
@group(0) @binding(1) var<storage,read> forces:array<vec2f>;
@group(0) @binding(2) var<storage,read_write> velocities:array<vec2f>;
@group(0) @binding(3) var<uniform> params:Params;
@compute @workgroup_size(64)
fn drift(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=params.count){return;}
 let v=velocities[i]+forces[i]*(params.h*0.5);
 velocities[i]=v;particles[i]=vec4f(particles[i].xy+v*params.h,particles[i].zw);
}
@compute @workgroup_size(64)
fn kick(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=params.count){return;}
 velocities[i]+=forces[i]*(params.h*0.5);
}`;

export function validateOrbitState(state){
 if(!(state instanceof Float64Array)||state.length%5||state.length<10||state.length>8192*5||!state.every(x=>Number.isFinite(Math.fround(x))))throw new Error('Use 2–8192 finite orbital particles');
 for(let i=4;i<state.length;i+=5)if(Math.fround(state[i])<=0)throw new Error('Orbital masses must be positive and representable');
 return state.length/5;
}

export class GpuOrbitProbe {
 static async create(options){
  const gravity=await GpuGravity.create(options);if(!gravity)return null;
  try{
   const d=gravity.device,shader=d.createShaderModule({code:INTEGRATION_SHADER});
   const errors=(await shader.getCompilationInfo()).messages.filter(m=>m.type==='error');if(errors.length)throw new Error(errors.map(m=>m.message).join('\n'));
   const layout=d.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}}]});
   const pipelineLayout=d.createPipelineLayout({bindGroupLayouts:[layout]});
   const [drift,kick]=await Promise.all(['drift','kick'].map(entryPoint=>d.createComputePipelineAsync({layout:pipelineLayout,compute:{module:shader,entryPoint}})));
   return new GpuOrbitProbe(gravity,layout,drift,kick);
  }catch(error){gravity.dispose();throw error;}
 }
 constructor(gravity,layout,drift,kick){this.gravity=gravity;this.layout=layout;this.drift=drift;this.kick=kick;this.buffers=[];this.capacity=0;this.count=0;this.busy=false;this.disposed=false;this.ready=false;}
 reset(state){
  if(this.disposed||this.busy)throw new Error('Orbital probe is unavailable');
  const n=validateOrbitState(state),g=this.gravity,d=g.device;g.ensure(n);
  if(this.capacity<g.capacity){
   for(const b of this.buffers)b.destroy();this.capacity=g.capacity;
   this.velocity=d.createBuffer({size:this.capacity*8,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
   this.readback=d.createBuffer({size:this.capacity*24,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});this.buffers=[this.velocity,this.readback];this.packedVelocity=new Float32Array(this.capacity*2);
   this.bindings=d.createBindGroup({layout:this.layout,entries:[{binding:0,resource:{buffer:g.input}},{binding:1,resource:{buffer:g.output}},{binding:2,resource:{buffer:this.velocity}},{binding:3,resource:{buffer:g.params}}]});
  }
  this.count=n;this.ready=false;this.masses=new Float64Array(n);
  for(let i=0;i<n;i++){g.packed[i*4]=state[i*5];g.packed[i*4+1]=state[i*5+1];g.packed[i*4+2]=state[i*5+4];this.packedVelocity[i*2]=state[i*5+2];this.packedVelocity[i*2+1]=state[i*5+3];this.masses[i]=state[i*5+4];}
  const params=new ArrayBuffer(16);new Uint32Array(params)[0]=n;new Float32Array(params).set([1e-8,39.47841760435743,1/2048],1);
  d.queue.writeBuffer(g.input,0,g.packed,0,n*4);d.queue.writeBuffer(this.velocity,0,this.packedVelocity,0,n*2);d.queue.writeBuffer(g.params,0,params);
 }
 async advance(ticks){
  if(!Number.isInteger(ticks)||ticks<1||ticks>32)throw new Error('Use 1–32 whole orbital probe ticks');
  if(this.disposed||this.busy||!this.count)throw new Error('Reset an available orbital probe first');this.busy=true;
  try{
   const g=this.gravity,d=g.device,n=this.count,encoder=d.createCommandEncoder(),pass=encoder.beginComputePass(),groups=Math.ceil(n/64);
   const force=()=>{pass.setPipeline(g.pipeline);pass.setBindGroup(0,g.bindings);pass.dispatchWorkgroups(groups);};
   if(!this.ready)force();
   for(let i=0;i<ticks*4;i++){
    pass.setPipeline(this.drift);pass.setBindGroup(0,this.bindings);pass.dispatchWorkgroups(groups);
    force();
    pass.setPipeline(this.kick);pass.setBindGroup(0,this.bindings);pass.dispatchWorkgroups(groups);
   }
   pass.end();encoder.copyBufferToBuffer(g.input,0,this.readback,0,n*16);encoder.copyBufferToBuffer(this.velocity,0,this.readback,n*16,n*8);d.queue.submit([encoder.finish()]);
   await this.readback.mapAsync(GPUMapMode.READ,0,n*24);
   const packed=new Float32Array(this.readback.getMappedRange(0,n*24)),state=new Float64Array(n*5);
   for(let i=0;i<n;i++){state[i*5]=packed[i*4];state[i*5+1]=packed[i*4+1];state[i*5+2]=packed[n*4+i*2];state[i*5+3]=packed[n*4+i*2+1];state[i*5+4]=this.masses[i];}
   if(!state.every(Number.isFinite))throw new Error('GPU orbit integration produced a non-finite state');
   this.ready=true;return state;
  }catch(error){this.count=0;throw error;}
  finally{if(this.readback?.mapState==='mapped')this.readback.unmap();this.busy=false;}
 }
 dispose(){this.disposed=true;for(const b of this.buffers)b.destroy();this.gravity.dispose();}
}
