const AU_KM=149597870.7;
export function quantity(value){return Number.isFinite(value)?value.toLocaleString(undefined,{maximumSignificantDigits:4}):'—';}
export function distance(value){return value<.1?`${quantity(value*AU_KM)} km`:`${quantity(value)} AU`;}
export function period(years){return years===null?'no return':years<1?`${quantity(years*365.25)} days`:`${quantity(years)} years`;}
export function orbitReading(body,orbit,host=null){
 const direction=host?((body.pos.x-host.pos.x)*(body.vel.y-host.vel.y)-(body.pos.y-host.pos.y)*(body.vel.x-host.vel.x)<0?'Clockwise':'Counterclockwise'):'';
 return `World ${body.id} · ${body.kind}${host?.id?` · Moon of ${host.id}`:''}\n${quantity(body.mass/3.003e-6)} Earth masses · ${distance(orbit.distance)}\n${orbit.habitable?'Potentially habitable':orbit.calm?'Calm orbit':orbit.bound?'Eccentric orbit':'Escaping'} · e = ${quantity(orbit.eccentricity)}\nClosest: ${distance(orbit.periapsis)}\nFarthest: ${orbit.bound?distance(orbit.apoapsis):'unbounded'}\nPeriod: ${period(orbit.period_years)}${host?`\n${direction} around ${host.id?`World ${host.id}`:'the star'}`:''}`;
}
export function spinReading(body,host){
 const rate=body.spin/(.4*body.mass*body.radius*body.radius);if(!Number.isFinite(rate))return 'Axial rotation unavailable.';if(rate===0)return 'No axial rotation.';
 const angular=host?(body.pos.x-host.pos.x)*(body.vel.y-host.vel.y)-(body.pos.y-host.pos.y)*(body.vel.x-host.vel.x):0;
 return `Axial rotation: ${rate<0?'clockwise':'counterclockwise'} · ${period(2*Math.PI/Math.abs(rate))} per turn${angular?` · ${Math.sign(angular)===Math.sign(rate)?'same sense as orbit':'opposite sense to orbit'}`:''}.`;
}
export function spinRate(turns,direction){const value=Number(turns);if(String(turns).trim()===''||!Number.isFinite(value)||value<0||value>1000)throw new Error('Choose 0–1000 axial turns per year.');return value*2*Math.PI*direction;}
