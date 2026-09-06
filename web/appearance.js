// Display scale exaggerates every body's contact radius by the same factor.
// Volume-doubling therefore grows the visible radius by cbrt(2), at any zoom.
export function bodyDiameter(body,height,zoom){
 if(body.kind==='star')return 120*Math.cbrt(body.mass)*Math.min(1.15,height/540)*Math.sqrt(3.5/zoom);
 const contact=.002*Math.cbrt(body.mass/3.003e-6);
 return Math.max(1,contact*height/(zoom*.62)*(1+98*(zoom/(zoom+.5))**2*zoom**4/(zoom**4+.5**4)));
}
export function orbitPath(orbit,segments=192){
 const {eccentricity:e,periapsis:q,periapsis_angle:angle=0}=orbit||{};
 if(!Number.isFinite(e)||!Number.isFinite(q)||q<=0)return [];
 const end=e>=1?Math.acos(-1/e)-.025:Math.PI;
 const points=[];
 for(let i=0;i<=segments;i++){
  const f=-end+2*end*i/segments,r=q*(1+e)/(1+e*Math.cos(f));
  if(r>0&&r<20)points.push([r*Math.cos(f+angle),r*Math.sin(f+angle)]);
 }
 return points;
}
export function strongestPerturber(body,bodies,softening=.0001){
 if(!body||body.id===0)return null;
 const force=source=>{const dx=source.pos.x-body.pos.x,dy=source.pos.y-body.pos.y,r2=dx*dx+dy*dy+softening**2;return source.mass*Math.sqrt(dx*dx+dy*dy)/r2**1.5;};
 const stellar=force(bodies[0]);let best=null;
 for(const other of bodies){if(other.id===0||other.id===body.id)continue;const pull=force(other);if(!best||pull>best.pull)best={body:other,pull,ratio:pull/Math.max(stellar,1e-20)};}
 return best;
}
export function fitZoom(bodies,width,height,tilt,center={x:0,y:0}){
 let extent=1.8;
 for(const b of bodies){const pad=b.kind==='star'?.4:.25+Math.cbrt(b.mass/3.003e-6)*.16;extent=Math.max(extent,Math.abs(b.pos.x-center.x)*height/width+pad,Math.abs(b.pos.y-center.y)*tilt+pad);}
 return Math.max(1,Math.min(14,extent*1.28));
}
