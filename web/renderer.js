import { project, unproject, launchPath } from './geometry.js';

const VERTEX = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in float a_size;
layout(location=2) in vec3 a_color;
layout(location=3) in vec2 a_kind;
uniform vec2 u_resolution;
uniform float u_zoom, u_tilt, u_dpr;
out vec3 v_color;
out vec2 v_kind;
void main(){
  gl_Position=vec4(a_pos.x/u_zoom*u_resolution.y/u_resolution.x,a_pos.y/u_zoom*u_tilt,0,1);
  gl_PointSize=a_size*u_dpr;
  v_color=a_color; v_kind=a_kind;
}`;
const FRAGMENT = `#version 300 es
precision highp float;
in vec3 v_color;
in vec2 v_kind;
uniform float u_time;
out vec4 outColor;
float noise(vec3 p){return sin(p.x*17.+sin(p.y*13.))*sin(p.y*21.+p.z*19.);}
void main(){
 vec2 uv=gl_PointCoord*2.-1.; float r=length(uv);
 if(r>1.)discard;
 if(v_kind.x<0.5){
  float core=1.-smoothstep(.28,.41,r);
  float corona=exp(-r*5.)*.8;
  float flare=1.+.08*sin(atan(uv.y,uv.x)*11.+u_time*.6);
  outColor=vec4(mix(v_color,vec3(1.,.96,.78),core),max(core,corona*flare)*(1.-smoothstep(.8,1.,r)));return;
 }
 if(r>.78){
  float halo=(1.-smoothstep(.78,1.,r))*.18;
  float ring=v_kind.y*exp(-pow((r-.91)*75.,2.))*.9;
  outColor=vec4(v_color,halo+ring);return;
 }
 vec2 p=uv/.78; vec3 n=vec3(p.x,-p.y,sqrt(max(0.,1.-dot(p,p))));
 float light=max(.08,dot(n,normalize(vec3(-.6,.5,1.))));
 float texture=1.+noise(n*2.)*.16;
 if(v_kind.x>2.5 && v_kind.x<3.5)texture=.85+.22*sin(n.y*24.+noise(n)*2.);
 float rim=pow(1.-n.z,3.); vec3 color=v_color*light*texture+v_color*rim*.3;
 outColor=vec4(color,1.-smoothstep(.76,.78,r));
}`;
const LINE_VERTEX = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_color;
uniform vec2 u_resolution;
uniform float u_zoom,u_tilt;
out vec4 v_color;
void main(){gl_Position=vec4(a_pos.x/u_zoom*u_resolution.y/u_resolution.x,a_pos.y/u_zoom*u_tilt,0,1);v_color=a_color;}`;
const LINE_FRAGMENT = `#version 300 es
precision highp float;
in vec4 v_color;out vec4 outColor;void main(){outColor=v_color;}`;
const BG_VERTEX = `#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0,1);}`;
const BG_FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 u_resolution,u_zone,u_star;
uniform float u_zoom,u_tilt,u_time,u_grid;
out vec4 outColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 vec2 uv=gl_FragCoord.xy/u_resolution;
 vec2 pos=(uv*2.-1.)*u_zoom*vec2(u_resolution.x/u_resolution.y,1./u_tilt);
 float r=length(pos-u_star);
 vec3 color=mix(vec3(.013,.022,.044),vec3(.027,.052,.079),exp(-length((uv-vec2(.5,.6))*2.)));
 vec2 cell=floor(gl_FragCoord.xy/75.), f=fract(gl_FragCoord.xy/75.);
 vec2 center=vec2(hash(cell),hash(cell+32.));
 float star=exp(-length(f-center)*650.)*step(.24,hash(cell+7.));
 color+=vec3(.6,.72,.85)*star*(.75+.25*sin(u_time*.3+hash(cell)*6.));
 float band=smoothstep(u_zone.x-.015,u_zone.x+.015,r)*(1.-smoothstep(u_zone.y-.015,u_zone.y+.015,r));
 color+=vec3(.016,.1,.065)*band;
 float edge=exp(-abs(r-u_zone.x)*120.)+exp(-abs(r-u_zone.y)*120.);
 color+=vec3(.03,.16,.1)*edge;
 float ring=1.-smoothstep(0.,max(fwidth(r)*1.1,.002),abs(r-floor(r+.5)));
 color+=vec3(.07,.1,.13)*ring*u_grid;
 float axis=exp(-abs(pos.x)*120.)+exp(-abs(pos.y)*120.);
 color+=vec3(.025,.035,.05)*axis*u_grid;
 outColor=vec4(color,1.);
}`;

const COLORS = {star:[1,.65,.22], rocky:[.9,.49,.3], ice:[.35,.77,.88], giant:[.75,.59,.91], dust:[.65,.69,.74]};
const KINDS = {star:0,rocky:1,ice:2,giant:3,dust:4};

export class Renderer {
  constructor(canvas, onError = () => {}) {
    this.canvas=canvas; this.onError=onError; this.zoom=3.5; this.tilt=.62;
    this.trails=new Map(); this.lastTick=-1; this.selected=null; this.showGrid=true;
    this.showTrails=true; this.state=null; this.draft=null; this.lost=false;
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'high-performance'});
    if(!gl) throw new Error('WebGL 2 is unavailable. Enable hardware acceleration or try another browser.');
    this.gl=gl; this.init();
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.lost=true;this.onError('Graphics paused. Waiting for the graphics device to recover.');});
    canvas.addEventListener('webglcontextrestored',()=>{this.lost=false;this.init();this.onError('Graphics restored.');});
  }
  program(vertex,fragment) {
    const gl=this.gl,p=gl.createProgram();
    for(const [source,type] of [[vertex,gl.VERTEX_SHADER],[fragment,gl.FRAGMENT_SHADER]]){
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(p,shader);gl.deleteShader(shader);
    }
    gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  init(){
    const gl=this.gl;
    this.points=this.program(VERTEX,FRAGMENT);this.lines=this.program(LINE_VERTEX,LINE_FRAGMENT);this.background=this.program(BG_VERTEX,BG_FRAGMENT);
    this.pointBuffer=gl.createBuffer();this.lineBuffer=gl.createBuffer();
    this.emptyVAO=gl.createVertexArray();this.pointVAO=gl.createVertexArray();this.lineVAO=gl.createVertexArray();
    gl.bindVertexArray(this.pointVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.pointBuffer);
    for(const [loc,size,offset] of [[0,2,0],[1,1,8],[2,3,12],[3,2,24]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,32,offset);}
    gl.bindVertexArray(this.lineVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.lineBuffer);
    for(const [loc,size,offset] of [[0,2,0],[1,4,8]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,24,offset);}
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  }
  setState(state){
    if(state.tick<this.lastTick || (state.tick===0 && this.lastTick!==0))this.trails.clear();
    if(state.tick!==this.lastTick){
      const live=new Set(state.bodies.map(b=>b.id));
      for(const id of this.trails.keys())if(!live.has(id))this.trails.delete(id);
      for(const b of state.bodies){
        if(b.kind==='star')continue;
        const trail=this.trails.get(b.id)||[];trail.push([b.pos.x,b.pos.y]);
        if(trail.length>192)trail.shift();this.trails.set(b.id,trail);
      }
    }
    this.state=state;this.lastTick=state.tick;
  }
  toWorld(x,y){const r=this.canvas.getBoundingClientRect();return unproject(x-r.left,y-r.top,r.width,r.height,this.zoom,this.tilt);}
  toScreen(x,y){const r=this.canvas.getBoundingClientRect();return project(x,y,r.width,r.height,this.zoom,this.tilt);}
  uniforms(program,time){
    const gl=this.gl;gl.useProgram(program);
    gl.uniform2f(gl.getUniformLocation(program,'u_resolution'),this.canvas.width,this.canvas.height);
    gl.uniform1f(gl.getUniformLocation(program,'u_zoom'),this.zoom);gl.uniform1f(gl.getUniformLocation(program,'u_tilt'),this.tilt);
    gl.uniform1f(gl.getUniformLocation(program,'u_dpr'),this.dpr);gl.uniform1f(gl.getUniformLocation(program,'u_time'),time);
  }
  draw(time){
    if(this.lost || !this.state)return;
    const gl=this.gl,canvas=this.canvas,r=canvas.getBoundingClientRect();this.dpr=Math.min(devicePixelRatio||1,2);
    const width=Math.max(1,Math.round(r.width*this.dpr)),height=Math.max(1,Math.round(r.height*this.dpr));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    gl.viewport(0,0,width,height);
    this.uniforms(this.background,time);gl.bindVertexArray(this.emptyVAO);
    const star=this.state.bodies[0];
    gl.uniform2f(gl.getUniformLocation(this.background,'u_star'),star.pos.x,star.pos.y);
    gl.uniform2f(gl.getUniformLocation(this.background,'u_zone'),this.state.status.zone_inner,this.state.status.zone_outer);
    gl.uniform1f(gl.getUniformLocation(this.background,'u_grid'),Number(this.showGrid));gl.drawArrays(gl.TRIANGLES,0,3);
    const lines=[];
    if(this.showTrails)for(const b of this.state.bodies){
      const trail=this.trails.get(b.id)||[],c=COLORS[b.kind];
      for(let i=1;i<trail.length;i++){
        lines.push(...trail[i-1],...c,i/trail.length*.4,...trail[i],...c,i/trail.length*.4);
      }
    }
    if(this.draft){
      const path=launchPath(this.draft.radius,this.draft.angle,this.draft.speed);
      for(let i=1;i<path.length;i++)if(i%4<2){
        for(const p of [path[i-1],path[i]])lines.push(p[0]+star.pos.x,p[1]+star.pos.y,.94,.76,.4,.5);
      }
    }
    this.uniforms(this.lines,time);gl.bindVertexArray(this.lineVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(lines),gl.DYNAMIC_DRAW);gl.drawArrays(gl.LINES,0,lines.length/6);
    const points=[];
    for(const b of [...this.state.bodies].sort((a,b)=>a.pos.y-b.pos.y)){
      const o=this.state.orbits.find(([id])=>id===b.id)?.[1];
      const c=o?.habitable?[.35,.82,.62]:COLORS[b.kind];
      const size=b.kind==='star'?116:b.kind==='dust'?8:b.kind==='giant'?41:25+Math.min(8,Math.cbrt(b.mass/3e-6));
      points.push(b.pos.x,b.pos.y,size,...c,KINDS[b.kind],Number(this.selected===b.id));
    }
    if(this.draft)points.push(star.pos.x+this.draft.radius*Math.cos(this.draft.angle),star.pos.y+this.draft.radius*Math.sin(this.draft.angle),25,.96,.76,.4,1,1);
    this.uniforms(this.points,time);gl.bindVertexArray(this.pointVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.pointBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.DYNAMIC_DRAW);gl.drawArrays(gl.POINTS,0,points.length/8);
  }
}
