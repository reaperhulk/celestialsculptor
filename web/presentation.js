export function shouldPresent(previous,next,lastTime,now){
  return !previous||next.id!==undefined||now-lastTime>=80||
    next.playing!==previous.playing||next.status.completed!==previous.status.completed||
    next.status.exhausted!==previous.status.exhausted||next.bodies.length!==previous.bodies.length;
}
