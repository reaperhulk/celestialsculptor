// Candidate gravity accelerator. Live integration remains in the qualified f64
// solver; this module measures f32 GPU accuracy and complete dispatch/readback.
export const GRAVITY_SHADER=`
struct Params {count:u32, soft2:f32, gravity:f32, padding:f32,}
@group(0) @binding(0) var<storage,read> particles:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> forces:array<vec2f>;
@group(0) @binding(2) var<uniform> params:Params;
var<workgroup> tile:array<vec4f,64>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid:vec3u,@builtin(local_invocation_index) lane:u32){
 let index=gid.x;var position=vec2f(0.0);if(index<params.count){position=particles[index].xy;}
 var acceleration=vec2f(0.0);
 for(var base=0u;base<params.count;base+=64u){
  if(base+lane<params.count){tile[lane]=particles[base+lane];}else{tile[lane]=vec4f(0.0);}
  workgroupBarrier();
  if(index<params.count){
   for(var j=0u;j<min(64u,params.count-base);j++){
    if(base+j!=index){let d=tile[j].xy-position;let r2=dot(d,d)+params.soft2;acceleration+=d*(params.gravity/(r2*sqrt(r2)))*tile[j].z;}
   }
  }
  workgroupBarrier();
 }
 if(index<params.count){forces[index]=acceleration;}
}`;
export class GpuGravity {
 static async create({fallback=false,shaderCode=GRAVITY_SHADER}={}){
  const adapter=await globalThis.navigator?.gpu?.requestAdapter({forceFallbackAdapter:fallback,powerPreference:'high-performance'});
  if(!adapter)return null;
  const device=await adapter.requestDevice();
  try{
   const shader=device.createShaderModule({code:shaderCode});
   const diagnostics=await shader.getCompilationInfo();const errors=diagnostics.messages.filter(m=>m.type==='error');if(errors.length)throw new Error(errors.map(m=>m.message).join('\n'));
   const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:shader,entryPoint:'main'}});
   return new GpuGravity(device,pipeline,adapter.info);
  }catch(error){device.destroy();throw error;}
 }
 constructor(device,pipeline,info){this.device=device;this.pipeline=pipeline;this.info={vendor:info?.vendor,architecture:info?.architecture,device:info?.device,description:info?.description};this.capacity=0;this.buffers=[];}
 ensure(count){
  if(count<=this.capacity)return;for(const b of this.buffers)b.destroy();this.capacity=2**Math.ceil(Math.log2(count));
  const d=this.device;this.input=d.createBuffer({size:this.capacity*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});this.output=d.createBuffer({size:this.capacity*8,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});this.readback=d.createBuffer({size:this.capacity*8,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});this.params=d.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.buffers=[this.input,this.output,this.readback,this.params];this.packed=new Float32Array(this.capacity*4);
  this.bindings=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.input}},{binding:1,resource:{buffer:this.output}},{binding:2,resource:{buffer:this.params}}]});
 }
 async compute(particles){
  const count=particles.length/3;if(!Number.isInteger(count)||count<2||count>8192||!particles.every(Number.isFinite))throw new Error('Use 2–8192 finite gravity particles');
  if(this.busy)throw new Error('A gravity dispatch is already running');this.busy=true;
  try{
   this.ensure(count);for(let i=0;i<count;i++){this.packed[i*4]=particles[i*3];this.packed[i*4+1]=particles[i*3+1];this.packed[i*4+2]=particles[i*3+2];}
   const params=new ArrayBuffer(16);new Uint32Array(params)[0]=count;new Float32Array(params).set([1e-8,39.47841760435743,0],1);
   const d=this.device;d.queue.writeBuffer(this.input,0,this.packed,0,count*4);d.queue.writeBuffer(this.params,0,params);
   const encoder=d.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bindings);pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();encoder.copyBufferToBuffer(this.output,0,this.readback,0,count*8);d.queue.submit([encoder.finish()]);
   await this.readback.mapAsync(GPUMapMode.READ,0,count*8);const result=new Float32Array(this.readback.getMappedRange(0,count*8).slice(0));this.readback.unmap();return result;
  }finally{if(this.readback?.mapState==='mapped')this.readback.unmap();this.busy=false;}
 }
 dispose(){for(const b of this.buffers)b.destroy();this.device.destroy();}
}
