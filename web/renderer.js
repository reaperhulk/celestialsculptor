import { project, unproject } from './geometry.js';
import { VertexStream, PlanetStream, LINE_CAPACITY } from './vertices.js';
import {planetVertex,planetFragment} from './planet-shaders.js';
import {clampZoom,sceneContext} from './camera.js';
import {interpolationAlpha,sampleBody,MotionSamples} from './motion.js';
import {bodyDiameter,orbitPath,strongestPerturber,fitZoom} from './appearance.js';
import {BodyScale} from './body-scale.js';
import {updateTrails} from './trails.js';
import {PreviewCache} from './preview.js';

const LINE_VERTEX = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_color;
uniform vec2 u_resolution,u_center;
uniform float u_zoom,u_tilt;
out vec4 v_color;
void main(){gl_Position=vec4((a_pos.x-u_center.x)/u_zoom*u_resolution.y/u_resolution.x,(a_pos.y-u_center.y)/u_zoom*u_tilt,0,1);v_color=a_color;}`;
const LINE_FRAGMENT = `#version 300 es
precision highp float;
in vec4 v_color;out vec4 outColor;void main(){outColor=v_color;}`;
const BG_VERTEX = `#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0,1);}`;
const BG_FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 u_resolution,u_zone,u_star,u_center;
uniform float u_zoom,u_tilt,u_time,u_grid;
out vec4 outColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 vec2 uv=gl_FragCoord.xy/u_resolution;
 vec2 pos=(uv*2.-1.)*u_zoom*vec2(u_resolution.x/u_resolution.y,1./u_tilt)+u_center;
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

const COLORS = {star:[1,.65,.22], rocky:[.9,.49,.3], ice:[.35,.77,.88], giant:[.93,.73,.48], dust:[.65,.69,.74]};
const KINDS = {star:0,rocky:1,ice:2,giant:3,dust:4};

export class Renderer {
  constructor(canvas, onError = () => {}) {
    this.previewCache=new PreviewCache();
    this.bodyScale=new BodyScale();
    this.canvas=canvas; this.onError=onError; this.zoom=3.5; this.tilt=.62; this.maxDpr=2;
    this.lineStream=new VertexStream(LINE_CAPACITY);this.pointStream=new PlanetStream(65*16);
    this.center={x:0,y:0};this.follow=null;this.inputMode='navigate';this.cameraActiveUntil=0;this.cameraTween=null;this.panVelocity=null;this.impacts=[];this.lastEvent=0;
    this.displayPositions=new Map();this.moonTrails=new Map();this.trails=new Map(); this.selected=null; this.showGrid=true;
    this.motion=new MotionSamples();
    this.showTrails=true; this.showPreview=true; this.reduceMotion=false; this.state=null; this.draft=null; this.lost=false;
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'high-performance'});
    if(!gl) throw new Error('WebGL 2 is unavailable. Enable hardware acceleration or try another browser.');
    this.gl=gl;this.init();
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.lost=true;this.onError('Graphics paused. Waiting for the graphics device to recover.');});
    canvas.addEventListener('webglcontextrestored',()=>{try{this.init();this.lost=false;this.onError('Graphics restored.');}catch(error){this.lost=true;this.onError('Graphics could not recover. Your experiment is intact; export it before reloading. '+error.message);}});
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
    const gl=this.gl;this.locations=new Map();
    this.points=this.program(planetVertex,planetFragment);this.lines=this.program(LINE_VERTEX,LINE_FRAGMENT);this.background=this.program(BG_VERTEX,BG_FRAGMENT);
    this.pointBuffer=gl.createBuffer();this.lineBuffer=gl.createBuffer();
    this.emptyVAO=gl.createVertexArray();this.pointVAO=gl.createVertexArray();this.lineVAO=gl.createVertexArray();
    gl.bindVertexArray(this.pointVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.pointBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,this.pointStream.data.byteLength,gl.DYNAMIC_DRAW);this.pointBufferBytes=this.pointStream.data.byteLength;
    for(const [loc,size,offset] of [[0,2,0],[1,1,8],[2,3,12],[3,2,24],[4,4,32],[5,3,48],[6,1,60]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,64,offset);gl.vertexAttribDivisor(loc,1);}
    gl.bindVertexArray(this.lineVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,this.lineStream.data.byteLength,gl.DYNAMIC_DRAW);
    for(const [loc,size,offset] of [[0,2,0],[1,4,8]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,24,offset);}
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  }
  location(program,name){
    let locations=this.locations.get(program);
    if(!locations){locations=new Map();this.locations.set(program,locations);}
    if(!locations.has(name))locations.set(name,this.gl.getUniformLocation(program,name));
    return locations.get(name);
  }
  set draft(value){this._draft=value;this.previewPath=this.previewCache.update(value);}
  get draft(){return this._draft;}
  get selected(){return this._selected;}
  set selected(id){if(id!==this._selected){this._selected=id;this.selectedPath=null;this.perturber=null;this.familyPaths=null;}}
  get previewVisible(){return this.showPreview&&this.inputMode==='place';}
  set encounterOverlay(impact){this._encounterOverlay=impact?.anchor?{anchor:impact.anchor,paths:[orbitPath(impact.orbit_before),orbitPath(impact.orbit_after)]}:null;}
  setState(state){
    if(!this.motion.push(state,performance.now()/1000)){this.state=state;return;}
    updateTrails(this.trails,this.state,state,false,this.selected);updateTrails(this.moonTrails,this.state,state,true,this.selected);
    const replaced=!this.state||state.generation!==this.state.generation||state.tick<this.state.tick;
    if(replaced||state.playing)this._encounterOverlay=null;
    if(replaced){this.cameraTween=null;this.panVelocity=null;this.impacts=[];this.lastEvent=state.events.at(-1)?.id||0;this.follow=null;this.center={x:state.bodies[0].pos.x,y:state.bodies[0].pos.y};}
    else for(const event of state.events){if(event.id>this.lastEvent&&event.impact)this.impacts.push({...event.impact,body:event.body,time:performance.now()/1000});}
    this.lastEvent=state.events.at(-1)?.id||this.lastEvent;
    this.impacts=this.impacts.slice(-12);
    const liveIds=new Set(state.bodies.map(b=>b.id));
    if(this.follow!==null&&!liveIds.has(this.follow))this.follow=null;
    for(const id of this.displayPositions.keys())if(!liveIds.has(id))this.displayPositions.delete(id);
    if(!state.bodies.some(body=>body.id===this.selected))this.selected=null;
    this.previousState=this.motion.previous;this.previousReceived=this.motion.previousTime;this.receivedAt=this.motion.time;
    this.state=state;this.orbitById=new Map(state.orbits);this.moonOrbitById=new Map(state.moon_orbits||[]);this.sortedBodies=[...state.bodies].sort((a,b)=>a.pos.y-b.pos.y);this.previousBodies=new Map((this.previousState?.bodies||[]).map(b=>[b.id,b]));
    const selected=state.bodies.find(b=>b.id===this.selected);this.selectedPath=selected?orbitPath(this.moonOrbitById.get(selected.id)||this.orbitById.get(selected.id)):[];this.perturber=strongestPerturber(selected,state.bodies,.0001);this.familyPaths=null;
  }
  toWorld(x,y){const r=this.canvas.getBoundingClientRect();const p=unproject(x-r.left,y-r.top,r.width,r.height,this.zoom,this.tilt);return [p[0]+this.center.x,p[1]+this.center.y];}
  toScreen(x,y){const r=this.canvas.getBoundingClientRect();return project(x-this.center.x,y-this.center.y,r.width,r.height,this.zoom,this.tilt);}
  fit(){
    if(!this.state)return;this.follow=null;const center=this.state.bodies[0].pos;
    const r=this.canvas.getBoundingClientRect();this.cameraTo(center,fitZoom(this.state.bodies,r.width,r.height,this.tilt,center));
  }
  cameraTo(center,zoom){this.panVelocity=null;this.cameraActiveUntil=performance.now()+400;this.cameraTween={start:performance.now(),from:{...this.center},center:{...center},zoom:clampZoom(zoom),fromZoom:this.zoom};}
  updateCamera(now){
    if(this.cameraTween){const t=Math.min(1,(now-this.cameraTween.start)/350),ease=1-(1-t)**3,a=this.cameraTween;const target=this.displayPositions.get(this.follow)||a.center;this.zoom=a.fromZoom+(a.zoom-a.fromZoom)*ease;this.center={x:a.from.x+(target.x-a.from.x)*ease,y:a.from.y+(target.y-a.from.y)*ease};if(t===1)this.cameraTween=null;}
    else if(this.panVelocity){const dt=Math.min(32,Math.max(0,now-(this.lastCameraTime||now))),v=this.panVelocity;this.center={x:this.center.x+v.x*dt,y:this.center.y+v.y*dt};v.x*=Math.exp(-dt/110);v.y*=Math.exp(-dt/110);if(Math.hypot(v.x,v.y)<this.zoom*.00001)this.panVelocity=null;this.lastCameraTime=now;}
    else if(this.follow!==null){const p=this.displayPositions.get(this.follow);if(p){this.center.x=p.x;this.center.y=p.y;}}
  }
  focus(bodyId){
    const b=this.state?.bodies.find(body=>body.id===bodyId);if(!b)return;
    this.follow=bodyId;this.selected=bodyId;
    const moons=this.state.bodies.filter(m=>m.parent===bodyId),host=this.state.bodies.find(p=>p.id===b.parent);
    const zoom=moons.length?Math.max(b.radius*7,...moons.map(m=>Math.hypot(m.pos.x-b.pos.x,m.pos.y-b.pos.y)*1.6)):host?Math.hypot(host.pos.x-b.pos.x,host.pos.y-b.pos.y)*1.8:b.id===0?3.5:Math.max(b.radius*4,.012);
    this.cameraTo(b.pos,zoom);
  }
  focusEvent(event){const position=event.impact?.position||event.position;if(position){this.follow=null;this.cameraTo(position,Math.min(this.zoom,2));this.selected=event.body;}else this.focus(event.body);}

  uniforms(program,time){
    const gl=this.gl;gl.useProgram(program);
    gl.uniform2f(this.location(program,'u_resolution'),this.canvas.width,this.canvas.height);
    gl.uniform2f(this.location(program,'u_center'),this.center.x,this.center.y);
    gl.uniform1f(this.location(program,'u_zoom'),this.zoom);gl.uniform1f(this.location(program,'u_tilt'),this.tilt);
    gl.uniform1f(this.location(program,'u_dpr'),this.dpr);gl.uniform1f(this.location(program,'u_time'),time);
  }
  draw(time){
    if(this.lost || !this.state)return;
    const alpha=interpolationAlpha(time,this.receivedAt,this.previousReceived,this.state.playing,this.previousState?.generation===this.state.generation);
    for(const body of this.state.bodies){let position=this.displayPositions.get(body.id);if(!position){position={};this.displayPositions.set(body.id,position);}sampleBody(body,this.previousBodies.get(body.id),alpha,position);}
    this.updateCamera(time*1000);
    const animationTime=this.reduceMotion?0:time;
    const gl=this.gl,canvas=this.canvas,r=canvas.getBoundingClientRect();this.dpr=Math.min(devicePixelRatio||1,this.maxDpr);
    this.bodyScale.update(this.state.bodies,this.displayPositions,r.height,this.zoom,this.tilt);
    this.sceneLabel=sceneContext(this.state,this.center,this.zoom,r.width,r.height,this.tilt,this.follow);
    const width=Math.max(1,Math.round(r.width*this.dpr)),height=Math.max(1,Math.round(r.height*this.dpr));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    gl.viewport(0,0,width,height);
    this.uniforms(this.background,animationTime);gl.bindVertexArray(this.emptyVAO);
    const star=this.state.bodies[0],starPosition=this.displayPositions.get(star.id);
    gl.uniform2f(this.location(this.background,'u_star'),starPosition.x,starPosition.y);
    gl.uniform2f(this.location(this.background,'u_zone'),this.state.status.zone_inner,this.state.status.zone_outer);
    gl.uniform1f(this.location(this.background,'u_grid'),Number(this.showGrid));gl.drawArrays(gl.TRIANGLES,0,3);
    const lines=this.lineStream.reset(),tracked=this.state.bodies.find(b=>b.id===this.follow),reference=this.zoom<.5?(tracked?.parent??tracked?.id):null,localAnchor=this.displayPositions.get(reference);
    if(this._encounterOverlay){const {anchor,paths}=this._encounterOverlay;for(const [index,path] of paths.entries())for(let i=1;i<path.length;i++)lines.line(path[i-1][0]+anchor.x,path[i-1][1]+anchor.y,path[i][0]+anchor.x,path[i][1]+anchor.y,index?[.35,.8,1]:[1,.76,.35],.65);}

    if(this.showTrails)for(const b of this.state.bodies){
      if(reference&&b.parent!==reference)continue;
      const local=reference&&b.parent===reference,trail=(local?this.moonTrails:this.trails).get(b.id)||[],c=COLORS[b.kind],ox=local?localAnchor.x:0,oy=local?localAnchor.y:0;
      for(let i=1;i<trail.length;i++){
        lines.line(trail[i-1][0]+ox,trail[i-1][1]+oy,trail[i][0]+ox,trail[i][1]+oy,c,i/trail.length*.4);
      }
    }
    if(this.draft&&this.previewVisible){
      const path=this.previewPath;
      for(let i=1;i<path.length;i++)if(i%4<2){
        lines.line(path[i-1][0]+star.pos.x,path[i-1][1]+star.pos.y,path[i][0]+star.pos.x,path[i][1]+star.pos.y,[.94,.76,.4],.5);
      }
    }
    const selected=this.state.bodies.find(b=>b.id===this.selected),orbit=this.moonOrbitById.get(this.selected)||this.orbitById.get(this.selected);
    if(selected&&orbit&&!(reference===selected.id&&this.state.bodies.some(b=>b.parent===selected.id))){
      const path=this.selectedPath||(this.selectedPath=orbitPath(orbit));const anchor=this.moonOrbitById.has(selected.id)?this.state.bodies.find(b=>b.id===selected.parent)||star:star,anchorPosition=this.displayPositions.get(anchor.id);
      for(let i=1;i<path.length;i++)lines.line(path[i-1][0]+anchorPosition.x,path[i-1][1]+anchorPosition.y,path[i][0]+anchorPosition.x,path[i][1]+anchorPosition.y,[.35,.80,1],.7);
      const source=this.perturber||strongestPerturber(selected,this.state.bodies);
      if(source&&source.ratio>.002)lines.line(selected.pos.x,selected.pos.y,source.body.pos.x,source.body.pos.y,[1,.63,.28],Math.min(.7,.2+source.ratio));
    }
    if(selected&&reference){
      const host=selected.parent??selected.id,anchor=this.displayPositions.get(host);
      if(!this.familyPaths)this.familyPaths=this.state.bodies.filter(b=>b.parent===host&&b.id!==selected.id).slice(0,8).map(b=>orbitPath(this.moonOrbitById.get(b.id),96));
      if(anchor)for(const path of this.familyPaths)for(let i=1;i<path.length;i++)lines.line(path[i-1][0]+anchor.x,path[i-1][1]+anchor.y,path[i][0]+anchor.x,path[i][1]+anchor.y,[.35,.80,1],.25);
    }
    this.impacts=this.impacts.filter(impact=>time-impact.time<3);
    if(!this.reduceMotion)for(const impact of this.impacts){
      const color=impact.outcome==='graze'?[.5,.85,1]:impact.outcome==='disruption'?[1,.35,.25]:[1,.55,.18];
      const age=time-impact.time,alpha=Math.max(0,1-age/3),radius=.025+age*.13;
      for(let i=0;i<32;i++){
        const a=i*Math.PI/16,b=(i+1)*Math.PI/16;
        lines.line(impact.position.x+Math.cos(a)*radius,impact.position.y+Math.sin(a)*radius,impact.position.x+Math.cos(b)*radius,impact.position.y+Math.sin(b)*radius,color,alpha*.8);
        if(i%2===0){const d=radius*(1.25+(i%5)*.1);lines.line(impact.position.x+Math.cos(a)*d*.8,impact.position.y+Math.sin(a)*d*.8,impact.position.x+Math.cos(a)*d,impact.position.y+Math.sin(a)*d,[1,.8,.4],alpha*.8);}
      }
    }
    this.uniforms(this.lines,time);gl.bindVertexArray(this.lineVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.lineBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,lines.view());gl.drawArrays(gl.LINES,0,lines.length/6);
    const points=this.pointStream.reset();points.ensure((this.state.bodies.length+1)*16);
    for(const b of this.sortedBodies){
      const o=this.orbitById.get(b.id);
      const c=b.kind==='star'?(b.mass<.85?[1,.48,.19]:b.mass>1.2?[.65,.8,1]:COLORS.star):COLORS[b.kind];
      const size=this.bodyScale.diameter(b.id),position=this.displayPositions.get(b.id);
      if(Math.abs(position.x-this.center.x)*r.height/(2*this.zoom)>r.width/2+size||Math.abs(position.y-this.center.y)*this.tilt*r.height/(2*this.zoom)>r.height/2+size)continue;
      const dx=starPosition.x-position.x,dy=(starPosition.y-position.y)*this.tilt,dist=Math.hypot(dx,dy)||1;
      const heat=this.impacts.filter(impact=>impact.body===b.id).reduce((h,impact)=>Math.max(h,Math.max(0,1-(time-impact.time)/3)),0);
      points.point(position.x,position.y,size,c,KINDS[b.kind],Number(this.selected===b.id),[(b.id*.6180339)%1,b.kind==='giant'?this.bodyScale.rings(b.id):(b.material?.ice||0)/b.mass,Number(o?.habitable||false),position.rotation],[dx/dist,dy/dist,.45],heat);

    }
    if(this.draft&&this.previewVisible)points.point(star.pos.x+this.draft.radius*Math.cos(this.draft.angle),star.pos.y+this.draft.radius*Math.sin(this.draft.angle),bodyDiameter({kind:this.draft.kind,mass:(this.draft.mass||1)*3.003e-6},r.height,this.zoom),[.96,.76,.4],1,1);
    this.uniforms(this.points,animationTime);gl.bindVertexArray(this.pointVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.pointBuffer);
    if(this.pointBufferBytes!==points.data.byteLength){gl.bufferData(gl.ARRAY_BUFFER,points.data.byteLength,gl.DYNAMIC_DRAW);this.pointBufferBytes=points.data.byteLength;}
    gl.bufferSubData(gl.ARRAY_BUFFER,0,points.view());gl.drawArraysInstanced(gl.TRIANGLES,0,6,points.length/16);return true;
  }
}
