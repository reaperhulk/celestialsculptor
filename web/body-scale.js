import {bodyDiameter} from './appearance.js';

export const solidFraction=kind=>kind==='star'?.17:kind==='dust'?.335:.31;

// Reuse storage and sweep projected bounds before comparing close silhouettes.
export class BodyScale {
 constructor(){this.capacity=0;this.indices=new Map();this.order=[];this.ensure(64);}
 ensure(count){if(count<=this.capacity)return;this.capacity=2**Math.ceil(Math.log2(count));for(const key of ['base','sizes','limits','x','y','left','right'])this[key]=new Float64Array(this.capacity);}
 update(bodies,positions,height,zoom,tilt){
  this.ensure(bodies.length);const pixels=height/(2*zoom);this.order.length=bodies.length;
  for(let i=0;i<bodies.length;i++){
   const body=bodies[i],p=positions.get(body.id)||body.pos;this.indices.set(body.id,i);this.base[i]=bodyDiameter(body,height,zoom);this.limits[i]=1;this.x[i]=p.x;this.y[i]=p.y;this.order[i]=i;
   const reach=this.base[i]*solidFraction(body.kind)/(.82*pixels);this.left[i]=p.x-reach;this.right[i]=p.x+reach;
  }
  for(const [id,index] of this.indices)if(bodies[index]?.id!==id)this.indices.delete(id);
  const indexed=bodies.length>64;if(indexed)this.order.sort((a,b)=>this.left[a]-this.left[b]||a-b);
  for(let at=0;at<bodies.length;at++)for(let next=at+1;next<bodies.length;next++){
   const i=this.order[at],j=this.order[next];if(indexed&&this.left[j]>this.right[i])break;
   const a=bodies[i],b=bodies[j],dx=this.x[i]-this.x[j],dy=this.y[i]-this.y[j];
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
