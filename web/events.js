// Reconstructed history is silent; only new events in the current timeline play.
export class EventCursor {
 constructor(){this.generation=null;this.lastId=0;}
 consume(generation,events){
  const changed=generation!==this.generation;
  const fresh=changed?[]:events.filter(event=>event.id>this.lastId);
  this.generation=generation;this.lastId=events.at(-1)?.id??0;
  return fresh;
 }
}
