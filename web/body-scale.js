import {bodyDiameter} from './appearance.js';

export const solidFraction=kind=>kind==='star'?.17:kind==='dust'?.335:.31;

// Magnification may use empty space, but cannot turn a physical near miss into
// visibly intersecting solid surfaces. Storage is reused at the 64-body limit.
export class BodyScale {
 constructor(){this.base=new Float64Array(64);this.sizes=new Float64Array(64);this.limits=new Float64Array(64);this.indices=new Map();}
 update(bodies,positions,height,zoom,tilt){
  const pixels=height/(2*zoom);
  for(let i=0;i<bodies.length;i++){this.indices.set(bodies[i].id,i);this.base[i]=bodyDiameter(bodies[i],height,zoom);this.limits[i]=1;}
  for(const [id,index] of this.indices)if(bodies[index]?.id!==id)this.indices.delete(id);
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
   const a=bodies[i],b=bodies[j],pa=positions.get(a.id)||a.pos,pb=positions.get(b.id)||b.pos,dx=pa.x-pb.x,dy=pa.y-pb.y;
   const sum=this.base[i]*solidFraction(a.kind)+this.base[j]*solidFraction(b.kind),screen2=(dx*dx+dy*dy*tilt*tilt)*pixels*pixels;
   if(screen2>=(sum/.82)**2)continue;
   const distance=Math.hypot(dx,dy),contact=a.radius+b.radius;
   const projection=distance>0?Math.sqrt(screen2)/distance:pixels*tilt;
   const available=(contact+.82*Math.max(0,distance-contact))*projection;
   const limit=Math.min(1,available/sum);this.limits[i]=Math.min(this.limits[i],limit);this.limits[j]=Math.min(this.limits[j],limit);
  }
  for(let i=0;i<bodies.length;i++)this.sizes[i]=this.base[i]*this.limits[i];
 }
 diameter(id){return this.sizes[this.indices.get(id)];}
 radius(body){return this.diameter(body.id)*solidFraction(body.kind);}
 rings(id){return Math.max(0,Math.min(1,(this.limits[this.indices.get(id)]-.9)*10));}
}
