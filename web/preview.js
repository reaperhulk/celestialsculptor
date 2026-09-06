import {launchPath} from './geometry.js';
export class PreviewCache {
 constructor(){this.key=null;this.path=[];}
 update(draft){
  const key=draft?`${draft.radius}:${draft.angle}:${draft.speed}`:null;
  if(key!==this.key){this.key=key;this.path=draft?launchPath(draft.radius,draft.angle,draft.speed):[];}
  return this.path;
 }
}
