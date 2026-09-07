const KINDS=['star','rocky','ice','giant','dust'];
export const BODY_FRAME_STRIDE=20;
// Three distinct physical frames keep interpolation's previous/current objects
// intact. Same-tick view messages share their immutable physical frame.
export class BodyFrames {
 constructor(){this.pools=[[],[],[]];this.index=-1;this.key=null;}
 decode(message){
  const frame=message.frame;
  if(message.frame_version!==1||!(frame instanceof Float64Array)||frame.length%BODY_FRAME_STRIDE||frame.length>8192*BODY_FRAME_STRIDE)throw new Error('Invalid body display frame');
  const key=`${message.generation}:${message.tick}:${message.observation_stamp?.[1]}:${message.playing}`;
  if(key!==this.key){
   this.index=(this.index+1)%3;const bodies=this.pools[this.index];bodies.length=frame.length/BODY_FRAME_STRIDE;
   for(let i=0,at=0;i<bodies.length;i++,at+=BODY_FRAME_STRIDE){
    const b=bodies[i]||(bodies[i]={pos:{},vel:{},material:{}});
    b.id=frame[at];b.kind=KINDS[frame[at+1]];b.mass=frame[at+2];b.radius=frame[at+3];b.pos.x=frame[at+4];b.pos.y=frame[at+5];b.vel.x=frame[at+6];b.vel.y=frame[at+7];b.spin=frame[at+8];b.material.rock=frame[at+9];b.material.ice=frame[at+10];b.material.gas=frame[at+11];b.birth_mass=frame[at+12];b.initially_bound=Boolean(frame[at+13]);b.parent=frame[at+14]<0?null:frame[at+14];b.origin_parent=frame[at+15]<0?null:frame[at+15];b.rotation=frame[at+16];b.mergers=frame[at+17];b.debris_origin=Boolean(frame[at+18]);b.migration_rate=frame[at+19];
   }
   this.key=key;
  }
  message.bodies=this.pools[this.index];delete message.frame;delete message.frame_version;return message;
 }
}
