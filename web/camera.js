export const MIN_ZOOM=.012,MAX_ZOOM=20;
export const clampZoom=value=>Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,value));
export function worldAt(pixel,width,height,center,zoom,tilt){return {x:center.x+(pixel.x-width/2)*2*zoom/height,y:center.y-(pixel.y-height/2)*2*zoom/(height*tilt)};}
export function anchoredZoom(pixel,width,height,center,zoom,tilt,nextZoom){
 const anchor=worldAt(pixel,width,height,center,zoom,tilt),value=clampZoom(nextZoom);
 return {zoom:value,center:{x:anchor.x-(pixel.x-width/2)*2*value/height,y:anchor.y+(pixel.y-height/2)*2*value/(height*tilt)}};
}
export function panCenter(center,dx,dy,height,zoom,tilt){return {x:center.x-dx*2*zoom/height,y:center.y+dy*2*zoom/(height*tilt)};}
export function pinchCamera(anchor,pixel,width,height,zoom,tilt){const value=clampZoom(zoom);return {zoom:value,center:{x:anchor.x-(pixel.x-width/2)*2*value/height,y:anchor.y+(pixel.y-height/2)*2*value/(height*tilt)}};}
export function sceneContext(state,center,zoom,width,height,tilt,follow){
 const tracked=state.bodies.find(b=>b.id===follow),host=zoom<.5?(tracked?.parent??tracked?.id):null;
 if(host){const count=state.bodies.filter(b=>b.parent===host).length;return `World ${host} · ${count} bound moon${count===1?'':'s'}`;}
 const star=state.bodies[0],hx=zoom*width/Math.max(1,height),hy=zoom/tilt,dx=Math.abs(star.pos.x-center.x),dy=Math.abs(star.pos.y-center.y);
 const near=Math.hypot(Math.max(0,dx-hx),Math.max(0,dy-hy)),far=Math.hypot(dx+hx,dy+hy);
 return near<=state.status.zone_outer&&far>=state.status.zone_inner?'Potential habitable zone':'System view';
}
