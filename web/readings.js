const AU_KM=149597870.7;
export function quantity(value){return Number.isFinite(value)?value.toLocaleString(undefined,{maximumSignificantDigits:4}):'—';}
export function distance(value){return value<.1?`${quantity(value*AU_KM)} km`:`${quantity(value)} AU`;}
export function period(years){return years===null?'no return':years<1?`${quantity(years*365.25)} days`:`${quantity(years)} years`;}
export function orbitReading(body,orbit,host=null){
 const direction=host?((body.pos.x-host.pos.x)*(body.vel.y-host.vel.y)-(body.pos.y-host.pos.y)*(body.vel.x-host.vel.x)<0?'Clockwise':'Counterclockwise'):'';
 return `World ${body.id} · ${body.kind}${host?.id?` · Moon of ${host.id}`:''}\n${quantity(body.mass/3.003e-6)} Earth masses · ${distance(orbit.distance)}\n${orbit.habitable?'Potentially habitable':orbit.calm?'Calm orbit':orbit.bound?'Eccentric orbit':'Escaping'} · e = ${quantity(orbit.eccentricity)}\nClosest: ${distance(orbit.periapsis)}\nFarthest: ${orbit.bound?distance(orbit.apoapsis):'unbounded'}\nPeriod: ${period(orbit.period_years)}${host?`\n${direction} around ${host.id?`World ${host.id}`:'the star'}`:''}`;
}
