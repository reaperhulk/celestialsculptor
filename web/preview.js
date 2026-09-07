import {launchPath} from './geometry.js';
export class PreviewCache {
 constructor(){this.key=null;this.path=[];}
 update(draft){
  const key=draft?`${draft.radius}:${draft.angle}:${draft.speed}`:null;
  if(key!==this.key){this.key=key;this.path=draft?launchPath(draft.radius,draft.angle,draft.speed):[];}
  return this.path;
 }
}
// Reveal a launch site only when the player changes its conditions, never while panning.
export function draftOutsideView(point,width,height,margin=32){
 return point[0]<margin||point[0]>width-margin||point[1]<margin||point[1]>height-margin;
}
