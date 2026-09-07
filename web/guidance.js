export function goalMessage(status,mission,bodyCount,state=null){
 if(status.exhausted)return 'Experiment limit reached. Export it to keep it, or start a fresh system.';
 if(mission===null)return bodyCount===1?'Place worlds or explore a starting point. Every tool is available.':'No goal is required. Watch what survives, then try another idea.';
 if(status.completed)return 'Discovery made. Beautifully done.';
 if(state&&mission!==null){
  if(mission===4){const garden=state.bodies.find(b=>b.id===1);if(!garden||garden.mergers>0)return 'The original garden was lost or merged. Rewind and give its orbit more room.';}
  if(mission>=3&&mission<=5&&bodyCount<=2&&status.formed===0)return 'Seed a disk to begin formation. Width and disorder determine which fragments meet.';
  if(mission===6&&!status.completed)return 'A bound launch needs a close encounter to escape. Try a trailing approach to the giant and compare nearby angles.';
  if(mission===7&&status.moons<2)return 'Select the giant, open Create a moon, and separate the satellite orbits. Double tap the giant for a close view.';
  if(mission>=3&&mission<=5&&!status.condition&&status.years>8)return status.collisions===0?'Fragments have not met yet. Try a narrower disk or more orbital disorder; save this outcome to compare.':'Accretion has begun. Inspect the new worlds: crossing or eccentric paths may need a gentler, more compact initial disk.';
  if(mission===8&&!status.condition)return 'Watch Orbital resonances. A near period ratio needs many revolutions of bounded, reversing resonant angle to count.';
 }
 if(status.condition)return 'Conditions met. Let the system settle.';
 if(state&&mission===1&&status.habitable===0){const entry=state.orbits.find(([id])=>state.bodies.find(b=>b.id===id)?.kind!=='giant');if(entry){const [id,orbit]=entry;if(orbit.apoapsis>status.zone_outer)return `World ${id} leaves the band at its farthest point (${orbit.apoapsis.toFixed(2)} AU). Reduce orbital eccentricity or move the orbit inward.`;if(orbit.periapsis<status.zone_inner)return `World ${id} comes too close (${orbit.periapsis.toFixed(2)} AU). Raise its closest approach while keeping the far side in the band.`;}}
 return bodyCount===1?'Place your first world to begin.':'Adjust your conditions to meet the goal.';
}
