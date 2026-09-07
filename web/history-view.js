// Used when reviewing an immutable cached timeline; live views filter in Rust.
export function historyView(history,{body,inner,outer}){
 const body_ids=[...new Set(history.frames.flatMap(f=>f.bodies.map(b=>b.id)))].sort((a,b)=>a-b);
 const pairs=[...new Set(history.frames.flatMap(f=>f.resonances.map(r=>`${r.inner}:${r.outer}`)))].sort((a,b)=>{const [ai,ao]=a.split(':').map(Number),[bi,bo]=b.split(':').map(Number);return ai-bi||ao-bo;});
 if(!body_ids.includes(body))body=body_ids[0];let pair=`${inner}:${outer}`;if(!pairs.includes(pair))pair=pairs[0];
 return {...history,body_ids,pairs,frames:history.frames.map(f=>({...f,bodies:f.bodies.filter(b=>b.id===body),resonances:f.resonances.filter(r=>`${r.inner}:${r.outer}`===pair)}))};
}
