import {anchoredZoom,panCenter,pinchCamera,worldAt} from './camera.js';
import {bodyDiameter} from './appearance.js';
export function wheelZoom(delta,mode=0,height=800){
 if(!Number.isFinite(delta))return 1;
 const pixels=delta*(mode===1?16:mode===2?height:1);
 return Math.exp(Math.max(-150,Math.min(150,pixels))*.002);
}
export function launchFromPoint(x,y,star={x:0,y:0}){
 const dx=x-star.x,dy=y-star.y;
 return {radius:Math.max(.25,Math.min(6,Math.hypot(dx,dy))),angle:(Math.atan2(dy,dx)*180/Math.PI+360)%360};
}
export function nearestBody(bodies,x,y,toScreen,threshold=24,size=()=>0,position=body=>body.pos){
 let best=null,distance=Infinity;
 for(const body of bodies){const p=position(body),[sx,sy]=toScreen(p.x,p.y),d=Math.hypot(x-sx,y-sy),radius=Math.max(threshold,size(body));if(d<radius&&d<distance){distance=d;best=body.id;}}
 return best;
}
export function installInput(canvas,renderer,{onDraft,onSelect}){
 const pointers=new Map();let pinch=null,gesture=null,lastTap=null;
 const pixel=event=>{const r=canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};};
 const active=()=>{renderer.cameraActiveUntil=performance.now()+800;renderer.cameraTween=null;renderer.panVelocity=null;renderer.follow=null;};
 const updateDraft=event=>{const [x,y]=renderer.toWorld(event.clientX,event.clientY);onDraft(launchFromPoint(x,y,renderer.state?.bodies[0].pos));};
 canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);renderer.panVelocity=null;
  pointers.set(event.pointerId,pixel(event));
  if(pointers.size===2){active();const [a,b]=[...pointers.values()],middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2};pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:renderer.zoom,anchor:worldAt(middle,canvas.clientWidth,canvas.clientHeight,renderer.center,renderer.zoom,renderer.tilt)};gesture=null;return;}
  if(pointers.size===1)gesture={start:pixel(event),last:pixel(event),center:{...renderer.center},moved:false,time:performance.now(),velocity:{x:0,y:0}};
 });
 canvas.addEventListener('pointermove',event=>{
  if(!pointers.has(event.pointerId))return;
  const p=pixel(event);pointers.set(event.pointerId,p);renderer.cameraActiveUntil=performance.now()+800;
  if(pinch&&pointers.size===2){const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(distance>5){const next=pinchCamera(pinch.anchor,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},canvas.clientWidth,canvas.clientHeight,pinch.zoom*pinch.distance/distance,renderer.tilt);renderer.zoom=next.zoom;renderer.center=next.center;}return;}
  if(!gesture)return;
  const dx=p.x-gesture.start.x,dy=p.y-gesture.start.y;
  if(Math.hypot(dx,dy)>4)gesture.moved=true;
  if(gesture.moved&&!gesture.started){gesture.started=true;gesture.center={...renderer.center};active();}
  if(gesture.moved){if(renderer.inputMode==='place')updateDraft(event);else{const now=performance.now(),dt=Math.max(8,now-gesture.time),before=renderer.center;renderer.center=panCenter(gesture.center,dx,dy,canvas.clientHeight,renderer.zoom,renderer.tilt);gesture.velocity={x:(renderer.center.x-before.x)/dt,y:(renderer.center.y-before.y)/dt};gesture.time=now;}}
  gesture.last=p;
 });
 canvas.addEventListener('pointerup',event=>{
  if(gesture&&pointers.size===1){
   if(!gesture.moved){const p=pixel(event),id=nearestBody(renderer.state?.bodies||[],p.x,p.y,(x,y)=>renderer.toScreen(x,y),event.pointerType==='touch'?28:18,b=>bodyDiameter(b,canvas.clientHeight,renderer.zoom)*.31,b=>renderer.displayPositions.get(b.id)||b.pos);
    if(id!==null){renderer.selected=id;onSelect();if(lastTap?.id===id&&performance.now()-lastTap.time<360)renderer.focus(id);lastTap={id,time:performance.now()};}
    else if(renderer.inputMode==='place')updateDraft(event);
   }else if(renderer.inputMode!=='place'&&performance.now()-gesture.time<80){renderer.panVelocity=gesture.velocity;renderer.lastCameraTime=performance.now();}
  }
  pointers.delete(event.pointerId);pinch=null;gesture=null;
  if(pointers.size===1){const p=[...pointers.values()][0];gesture={start:p,last:p,center:{...renderer.center},moved:true,time:performance.now(),velocity:{x:0,y:0}};}
 });
 for(const type of ['pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>{pointers.delete(event.pointerId);pinch=null;gesture=null;});
 canvas.addEventListener('dblclick',event=>{event.preventDefault();if(renderer.selected!==null)renderer.focus(renderer.selected);});
 canvas.addEventListener('wheel',event=>{event.preventDefault();active();const next=anchoredZoom(pixel(event),canvas.clientWidth,canvas.clientHeight,renderer.center,renderer.zoom,renderer.tilt,renderer.zoom*wheelZoom(event.deltaY,event.deltaMode,canvas.clientHeight));renderer.zoom=next.zoom;renderer.center=next.center;},{passive:false});
}
