export function wheelZoom(delta,mode=0,height=800){
 if(!Number.isFinite(delta))return 1;
 const pixels=delta*(mode===1?16:mode===2?height:1);
 return Math.exp(Math.max(-150,Math.min(150,pixels))*.002);
}
export function launchFromPoint(x,y,star={x:0,y:0}){
  const dx=x-star.x,dy=y-star.y;
  return {radius:Math.max(.25,Math.min(6,Math.hypot(dx,dy))),angle:(Math.atan2(dy,dx)*180/Math.PI+360)%360};
}
export function nearestBody(bodies,x,y,toScreen,threshold=24){
  let best=null,distance=threshold;
  for(const body of bodies){const [sx,sy]=toScreen(body.pos.x,body.pos.y),d=Math.hypot(x-sx,y-sy);if(d<distance){distance=d;best=body.id;}}
  return best;
}
export function installInput(canvas,renderer,{onDraft,onSelect}){
  const pointers=new Map();let pinch=null,dragging=false;
  const update=event=>{
    const [x,y]=renderer.toWorld(event.clientX,event.clientY);
    onDraft(launchFromPoint(x,y,renderer.state?.bodies[0].pos));
  };
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,[event.clientX,event.clientY]);
    if(pointers.size>=2){if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a[0]-b[0],a[1]-b[1]),zoom:renderer.zoom};}dragging=false;return;}
    const rect=canvas.getBoundingClientRect();
    const id=nearestBody(renderer.state?.bodies||[],event.clientX-rect.left,event.clientY-rect.top,(x,y)=>renderer.toScreen(x,y));
    if(id!==null){renderer.selected=id;onSelect();dragging=false;}
    else{dragging=true;update(event);}
  });
  canvas.addEventListener('pointermove',event=>{
    if(!pointers.has(event.pointerId))return;
    pointers.set(event.pointerId,[event.clientX,event.clientY]);
    if(pinch&&pointers.size===2){const [a,b]=[...pointers.values()],distance=Math.hypot(a[0]-b[0],a[1]-b[1]);if(distance>5)renderer.zoom=Math.max(1,Math.min(9,pinch.zoom*pinch.distance/distance));}
    else if(dragging)update(event);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>{pointers.delete(event.pointerId);pinch=null;dragging=false;});
  canvas.addEventListener('wheel',event=>{event.preventDefault();renderer.zoom=Math.max(1,Math.min(9,renderer.zoom*wheelZoom(event.deltaY,event.deltaMode,canvas.clientHeight)));},{passive:false});
}
