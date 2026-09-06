export function updateTrails(trails,previous,state,relative=false){
 const replaced=!previous||previous.generation!==state.generation||state.tick<previous.tick;
 if(replaced)trails.clear();
 const parents=new Map(state.bodies.map(body=>[body.id,body]));
 const live=new Set(state.bodies.filter(body=>!relative||parents.has(body.parent)).map(body=>body.id));
 for(const id of trails.keys())if(!live.has(id))trails.delete(id);
 for(const body of state.bodies){
  if(body.kind==='star'||!live.has(body.id))continue;
  const parent=relative?parents.get(body.parent):null;
  if(relative&&previous?.bodies.find(b=>b.id===body.id)?.parent!==body.parent)trails.delete(body.id);
  if(!replaced&&state.tick===previous.tick&&trails.has(body.id))continue;
  const trail=trails.get(body.id)||[];trail.push([body.pos.x-(parent?.pos.x||0),body.pos.y-(parent?.pos.y||0)]);
  if(trail.length>192)trail.shift();trails.set(body.id,trail);
 }
}
