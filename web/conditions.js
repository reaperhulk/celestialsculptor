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
export function placementIssue(status,kind,mass){
 if(!status)return 'The simulation is loading.';
 const tool=status.tools.find(tool=>tool.kind===kind);
 if(!tool?.unlocked)return 'This world type unlocks in a later challenge.';
 if(status.actions_remaining===0)return 'This experiment has reached its edit limit. Undo an edit or begin again.';
 if(status.available_slots===0)return 'This system is full. Let worlds merge, or undo an edit.';
 if(mass!==undefined){
  if(!Number.isFinite(mass)||mass<tool.min_mass||mass>tool.max_mass)return 'Choose a mass within the range for this world type.';
  if(mass>status.remaining)return `This world needs ${mass} matter. Undo an edit or begin again.`;
 }else if(!tool.affordable)return `This world needs ${tool.cost} matter. Undo an edit or begin again.`;
 return '';
}
