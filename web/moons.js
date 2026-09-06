export function moonRegion(body,orbit,starMass,mass){
 const min=1.3*(body.radius+.002*Math.cbrt(mass)),max=(orbit?.bound?orbit.periapsis:0)*Math.cbrt(body.mass/(3*starMass))*.45;
 return {min,max,available:Number.isFinite(min)&&Number.isFinite(max)&&mass>=.001&&mass<=Math.min(10,body.mass/3.003e-6*.1)&&max>min};
}
