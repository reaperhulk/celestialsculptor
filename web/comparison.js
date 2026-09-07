const LABELS={launch:'Launch world',launch_mass:'Launch world',launch_moon:'Add moon',seed_disk:'Seed disk',seed_belt:'Seed belt',nudge:'Orbital burn',spin:'Axial spin',migration:'Disk torque',generate_system:'Generate system',generate:'Generate system'};
export function describeCommand(action){if(!action)return 'No edit';const {type,...fields}=action.command;return `Year ${(action.tick/512).toFixed(3)} · ${LABELS[type]||type}: `+Object.entries(fields).map(([key,value])=>`${key.replaceAll('_',' ')} ${typeof value==='number'?Number(value.toPrecision(5)):value}`).join(', ');}
export function experimentDifferences(a,b,tick){
 const rows=[];if(a.version!==b.version)rows.push(`Physics rules: ${a.version} → ${b.version}`);
 for(const key of ['seed','star_mass','mission'])if(a.config[key]!==b.config[key])rows.push(`${key.replaceAll('_',' ')}: ${a.config[key]??'sandbox'} → ${b.config[key]??'sandbox'}`);
 const left=a.commands.filter(c=>c.tick<=tick),right=b.commands.filter(c=>c.tick<=tick);
 for(let i=0;i<Math.max(left.length,right.length);i++)if(JSON.stringify(left[i])!==JSON.stringify(right[i])){rows.push(`${describeCommand(left[i])} → ${describeCommand(right[i])}`);if(rows.length===24){rows.push('More edits differ; export the replays for the full record.');break;}}
 return rows;
}
