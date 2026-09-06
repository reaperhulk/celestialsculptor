export const MIN_ZOOM=.012,MAX_ZOOM=20;
export const clampZoom=value=>Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,value));
export function worldAt(pixel,width,height,center,zoom,tilt){return {x:center.x+(pixel.x-width/2)*2*zoom/height,y:center.y-(pixel.y-height/2)*2*zoom/(height*tilt)};}
export function anchoredZoom(pixel,width,height,center,zoom,tilt,nextZoom){
 const anchor=worldAt(pixel,width,height,center,zoom,tilt),value=clampZoom(nextZoom);
 return {zoom:value,center:{x:anchor.x-(pixel.x-width/2)*2*value/height,y:anchor.y+(pixel.y-height/2)*2*value/(height*tilt)}};
}
export function panCenter(center,dx,dy,height,zoom,tilt){return {x:center.x-dx*2*zoom/height,y:center.y+dy*2*zoom/(height*tilt)};}
export function pinchCamera(anchor,pixel,width,height,zoom,tilt){const value=clampZoom(zoom);return {zoom:value,center:{x:anchor.x-(pixel.x-width/2)*2*value/height,y:anchor.y+(pixel.y-height/2)*2*value/(height*tilt)}};}
