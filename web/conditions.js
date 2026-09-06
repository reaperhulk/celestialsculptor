export function parseSeed(value){
 const seed=Number(value);
 if(String(value).trim()===''||!Number.isInteger(seed)||seed<0||seed>4294967295)throw new Error('Use a whole-number seed from 0 to 4294967295.');
 return seed;
}
export function parseLaunchFields({kind,radius,speed,angle}){
 const fields=[['Distance',radius,.25,6],['Orbital speed',speed,0,220],['Starting angle',angle,0,360]];
 for(const [label,raw,min,max] of fields){const value=Number(raw);if(String(raw).trim()===''||!Number.isFinite(value)||value<min||value>max)throw new Error(`${label} must be between ${min} and ${max}.`);}
 if(!['rocky','ice','giant','dust'].includes(kind))throw new Error('Choose a world type.');
 return {kind,radius:Number(radius),speed:Number(speed)/100,angle:Number(angle)*Math.PI/180};
}
