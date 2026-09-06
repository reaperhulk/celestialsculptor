export function goalMessage(status,mission,bodyCount){
 if(status.exhausted)return 'Experiment limit reached. Export it to keep it, or start a fresh system.';
 if(mission===null)return bodyCount===1?'Place worlds or explore a starting point. Every tool is available.':'No goal is required. Watch what survives, then try another idea.';
 if(status.completed)return 'Discovery made. Beautifully done.';
 if(status.condition)return 'Conditions met. Let the system settle.';
 return bodyCount===1?'Place your first world to begin.':'Adjust your conditions to meet the goal.';
}
