export function updateTrails(trails,previous,state){
 const replaced=!previous||previous.generation!==state.generation||state.tick<previous.tick;
 if(replaced)trails.clear();
 const live=new Set(state.bodies.map(body=>body.id));
 for(const id of trails.keys())if(!live.has(id))trails.delete(id);
 for(const body of state.bodies){
  if(body.kind==='star')continue;
  if(!replaced&&state.tick===previous.tick&&trails.has(body.id))continue;
  const trail=trails.get(body.id)||[];trail.push([body.pos.x,body.pos.y]);
  if(trail.length>192)trail.shift();trails.set(body.id,trail);
 }
}
