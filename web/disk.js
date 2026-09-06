export function diskCommand({radius,spread,count,disorder}){
 if([radius,spread,count,disorder].some(value=>String(value).trim()===''||!Number.isFinite(Number(value))))throw Error('Fill in every disk condition.');
 radius=Number(radius);spread=Number(spread);count=Number(count);disorder=Number(disorder)/100;
 if(spread<.05||spread>2||radius-spread/2<.25||radius+spread/2>6)throw Error('The entire disk must fit between 0.25 and 6 AU, with width 0.05–2 AU.');
 if(!Number.isInteger(count)||count<4||count>40||disorder<0||disorder>.6)throw Error('Use 4–40 fragments and 0–60% disorder.');
 return {type:'seed_disk',radius,spread,count,disorder};
}
export function diskIssue(command,status){
 if(!status)return 'The simulation is loading.';
 const dust=status.tools.find(tool=>tool.kind==='dust');
 if(!dust?.unlocked)return 'Disk tools unlock after Worlds from worlds.';
 if(!status.actions_remaining)return 'Undo an edit to make room for another action.';
 if(status.available_slots<command.count)return `This system has room for ${status.available_slots} more bodies.`;
 const cost=command.count*dust.cost;
 return status.remaining+1e-8<cost?`This disk needs ${cost} matter.`:'';
}
