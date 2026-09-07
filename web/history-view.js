// The immutable review path mirrors the Rust selected-history view.
export function historyView(history,{body,inner,outer}){
 const all=[...history.frames,...(history.detailed||[]),...(history.recent||[])];
 const body_ids=[...new Set(all.flatMap(f=>f.bodies.map(b=>b.id)))].sort((a,b)=>a-b);
 const pairs=[...new Set(all.flatMap(f=>f.resonances.map(r=>`${r.inner}:${r.outer}`)))].sort((a,b)=>{const [ai,ao]=a.split(':').map(Number),[bi,bo]=b.split(':').map(Number);return ai-bi||ao-bo;});
 if(!body_ids.includes(body))body=body_ids[0];let pair=`${inner}:${outer}`;if(!pairs.includes(pair))pair=pairs[0];
 const detailed=[...(history.detailed||[]),...(history.recent||[])].some(f=>f.bodies.some(b=>b.id===body));
 const frames=new Map();
 for(const [index,f] of all.entries()){const current=frames.get(f.tick)||{tick:f.tick,body_sample:detailed||index<history.frames.length,bodies:[],resonances:[]};const b=f.bodies.find(b=>b.id===body),r=f.resonances.find(r=>`${r.inner}:${r.outer}`===pair);if(b)current.bodies=[b];if(r)current.resonances=[r];frames.set(f.tick,current);}
 return {body_ids,pairs,frames:[...frames.values()].sort((a,b)=>a.tick-b.tick),events:history.events,stride:history.stride,detail:history.priority_ids?.includes(body)||false,recent_stride:8,population:history.population||[],pinned_ids:history.pinned_ids||[],encounters:history.encounters||[]};
}
