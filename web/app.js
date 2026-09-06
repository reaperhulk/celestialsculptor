import { Renderer } from './renderer.js';
import { installInput } from './input.js';
import { readProfile, writeProfile, canPlay, nextMission, award } from './progression.js';

const $=id=>document.getElementById(id);
let state=null, missions=[], mission=0, sequence=0, renderer, ready=false, toastTimer;
let profile=readProfile(localStorage),awardedThisRun=false;
const pending=new Map();
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function fail(message){$('loading').hidden=false;$('loading').querySelector('p').textContent=message;$('play').disabled=true;}
try { renderer=new Renderer($('universe'),toast); } catch(error){fail(error.message);}
const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
function send(type,data={}){
  const id=++sequence;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('The simulation did not respond. Try reloading your experiment.'));},15000);
    pending.set(id,{resolve,reject,timeout});worker.postMessage({type,id,...data});
  });
}
function action(type,data={}){return send(type,data).catch(error=>toast(error.message));}
function draft(){return {kind:$('kind').value,radius:Number($('radius').value),angle:Number($('angle').value)*Math.PI/180,speed:Number($('speed').value)/100};}
function updateDraft(){
  const d=draft();if(renderer)renderer.draft=d;
  $('radius-range').value=String(d.radius);$('speed-range').value=String(d.speed*100);
  $('orbit-reading').textContent=d.speed>Math.SQRT2?'Escape trajectory · a world without a sun':Math.abs(d.speed-1)<.015?'Circular orbit · a quiet beginning':d.speed<.2?'Falling inward · likely stellar impact':'Elliptical orbit · watch the close approach';
}
function setMissionUI(){
  const m=mission===null?null:missions[mission];
  $('campaign').classList.toggle('active',mission!==null);$('sandbox').classList.toggle('active',mission===null);
  $('mission-index').textContent=m?`CHALLENGE ${String(mission+1).padStart(2,'0')} / 10`:'OPEN EXPLORATION';
  $('mission-name').textContent=m?.name||'Your universe';
  $('mission-brief').textContent=m?.brief||'No goal, no hurry. Follow an idea and see what gravity makes of it.';
  $('mission-hint').textContent=m?.hint||'Try a crowded belt, a giant on an eccentric orbit, or a system around a smaller star.';
  $('reward').textContent=m?.unlock||'Every tool is available';
  for(const option of $('kind').options)option.disabled=mission!==null&&({rocky:0,ice:1,giant:3,dust:4}[option.value]>mission);
  if($('kind').selectedOptions[0].disabled)$('kind').value='rocky';
  $('seed-belt').hidden=mission!==null&&mission<4;
  $('star-mass').disabled=mission!==null&&mission<2;
  $('next-mission').hidden=true;updateDraft();
}
async function reset(next=mission){
  if(!ready)return;
  if(next!==null&&!canPlay(profile,next)){toast('Complete the previous challenges first.');return;}
  mission=next;
  awardedThisRun=false;
  if(mission!==null&&mission<2)$('star-mass').value='1';
  setMissionUI();renderer?.trails.clear();
  await action('reset',{config:{seed:42,mission,star_mass:Number($('star-mass').value)}});
}
function inspect(){
  const body=state?.bodies.find(b=>b.id===renderer?.selected);
  const p=$('inspector');
  p.replaceChildren();const label=document.createElement('span');label.className='eyebrow';label.textContent='OBSERVATION';p.append(label);
  const text=document.createElement('p');
  if(!body||body.id===0)text.textContent='Select a world to inspect its orbit.';
  else{
    const orbit=state.orbits.find(([id])=>id===body.id)?.[1];
    text.textContent=`World ${body.id} · ${body.kind}\n${(body.mass/3.003e-6).toFixed(2)} Earth masses · ${orbit.distance.toFixed(2)} AU\n${orbit.habitable?'Potentially habitable':orbit.calm?'Calm orbit':orbit.bound?'Eccentric orbit':'Escaping'} · e = ${orbit.eccentricity.toFixed(3)}`;
    text.style.whiteSpace='pre-line';
  }
  p.append(text);
}
let lastUI=0,lastEventSignature='';
function renderState(next){
  state=next;renderer?.setState(next);$('universe').dataset.tick=String(next.tick);
  if(performance.now()-lastUI<80&&!next.id)return;lastUI=performance.now();
  const s=next.status,m=mission===null?null:missions[mission];
  if(s.completed&&mission!==null&&!awardedThisRun){
    awardedThisRun=true;profile=award(profile,mission);
    if(!writeProfile(localStorage,profile))toast('Discovery earned. Device storage is unavailable, so progress will last for this session.');
    else toast(`Discovery: ${m.unlock}`);
  }
  $('next-mission').hidden=!s.completed||mission===null;
  $('next-mission').textContent=mission===9?'Explore the sandbox':'Next challenge';
  $('collection').textContent=`${profile.completed.length} / 10 discoveries`;
  $('sim-years').textContent=s.years.toFixed(2);$('matter').textContent=s.remaining.toLocaleString(undefined,{maximumFractionDigits:2});
  $('planet-count').textContent=String(s.planets);$('calm-count').textContent=String(s.calm);$('habitable-count').textContent=String(s.habitable);
  $('goal-progress').value=s.progress;$('goal-time').textContent=m?(m.hold_years?`${s.held_years.toFixed(1)} / ${m.hold_years} yr`:s.completed?'Complete':'Discovery'):'Free play';
  $('goal-state').textContent=s.completed?'Discovery made. Beautifully done.':s.condition?'Conditions met. Let the system settle.':next.bodies.length===1?'Place your first world to begin.':'Adjust your conditions to meet the goal.';
  $('play').textContent=next.playing?'Ⅱ Pause':'▶ Run';$('play').disabled=!ready||s.exhausted;
  $('system-title').textContent=s.completed?'A little order, from the unknown.':s.planets>0?'Gravity has the pen now.':'A beginning, in starlight.';
  const eventSignature=JSON.stringify(next.events);
  if(eventSignature!==lastEventSignature){
    lastEventSignature=eventSignature;$('events').replaceChildren();
    if(!next.events.length){const li=document.createElement('li');li.textContent='Your star is waiting.';$('events').append(li);}
    for(const event of [...next.events].reverse().slice(0,5)){const li=document.createElement('li');li.textContent=`${(event.tick/512).toFixed(2)} yr · ${event.text}`;$('events').append(li);}
  }
  inspect();
}
worker.onmessage=async({data})=>{
  if(data.type==='ready'){
    missions=data.missions;ready=true;if(renderer)$('loading').hidden=true;
    document.body.dataset.ready='true';await reset(nextMission(profile));
  }else if(data.type==='state'){renderState(data);}
  else if(data.type==='fatal'){fail(data.message);}
  const request=pending.get(data.id);
  if(request){clearTimeout(request.timeout);pending.delete(data.id);data.type==='error'?request.reject(new Error(data.message)):request.resolve(data);}
  else if(data.type==='error')toast(data.message);
};
worker.onerror=()=>fail('The simulation could not start. Reload to try again.');
function confirmReset(callback,onCancel=()=>{}){
  if(!state||state.bodies.length===1){callback();return;}
  $('confirm-dialog').showModal();let accepted=false;
  $('confirm-dialog').onclose=()=>{if(!accepted)onCancel();};
  $('confirm-ok').onclick=()=>{accepted=true;$('confirm-dialog').close();callback();};
}
$('confirm-cancel').onclick=()=>$('confirm-dialog').close();
$('sandbox').onclick=()=>confirmReset(()=>reset(null));
$('campaign').onclick=()=>{
  if(!ready)return;
  $('mission-list').replaceChildren();
  missions.forEach((m,i)=>{
    const button=document.createElement('button');button.className='mission-choice';button.disabled=!canPlay(profile,i);
    const number=document.createElement('span');number.className='mission-number';number.textContent=profile.completed.includes(i)?'✓':String(i+1).padStart(2,'0');
    const label=document.createElement('span');const title=document.createElement('strong');title.textContent=m.name;
    const brief=document.createElement('small');brief.textContent=button.disabled?'Complete the preceding challenge':m.brief;label.append(title,brief);button.append(number,label);
    button.onclick=()=>{$('mission-dialog').close();confirmReset(()=>reset(i));};$('mission-list').append(button);
  });
  $('mission-dialog').showModal();
};
$('close-missions').onclick=()=>$('mission-dialog').close();
$('next-mission').onclick=()=>reset(mission===9?null:mission+1);
$('clear').onclick=()=>confirmReset(()=>reset());$('star-mass').onchange=()=>confirmReset(()=>reset(),()=>{$('star-mass').value=String(state.config.star_mass);});
$('launch-form').onsubmit=event=>{event.preventDefault();if(ready)action('command',{command:{type:'launch',...draft()}});};
$('seed-belt').onclick=()=>action('command',{command:{type:'seed_belt',radius:Number($('radius').value)}});
for(const id of ['kind','radius','speed','angle'])$(id).addEventListener('input',updateDraft);
for(const id of ['radius','speed'])$(id+'-range').oninput=()=>{$(id).value=$(id+'-range').value;updateDraft();};
$('play').onclick=()=>action('play',{value:!state?.playing});$('step').onclick=()=>action('step');$('rewind').onclick=()=>action('rewind');
$('time-speed').onchange=()=>action('speed',{value:Number($('time-speed').value)});
$('view').onclick=()=>{if(renderer){renderer.tilt=renderer.tilt===1?.62:1;$('view').textContent=renderer.tilt===1?'Tilt view':'Top view';}};
$('zoom-in').onclick=()=>{if(renderer)renderer.zoom=Math.max(1,renderer.zoom*.8);};$('zoom-out').onclick=()=>{if(renderer)renderer.zoom=Math.min(9,renderer.zoom/ .8);};
for(const button of document.querySelectorAll('[data-panel]'))if(button.tagName==='BUTTON')button.onclick=()=>{document.body.dataset.panel=button.dataset.panel;for(const other of document.querySelectorAll('.mobile-tabs button'))other.classList.toggle('active',other===button);};
$('help').onclick=()=>$('help-dialog').showModal();for(const button of document.querySelectorAll('.dialog-close'))button.onclick=()=>$('help-dialog').close();
document.addEventListener('visibilitychange',()=>{if(document.hidden&&ready)action('play',{value:false});});
if(renderer)installInput($('universe'),renderer,{
  onDraft:({radius,angle})=>{$('radius').value=radius.toFixed(2);$('angle').value=String(Math.round(angle));updateDraft();},
  onSelect:inspect,
});
document.addEventListener('keydown',event=>{
  if(!ready||document.querySelector('dialog[open]')||/INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName))return;
  if(event.code==='Space'){event.preventDefault();$('play').click();}
  else if(event.key.toLowerCase()==='r')$('rewind').click();
  else if(event.key.toLowerCase()==='l')$('launch-form').requestSubmit();
  else if(event.key==='+'||event.key==='=')$('zoom-in').click();
  else if(event.key==='-')$('zoom-out').click();
  else if(event.target===$('universe')&&event.key.startsWith('Arrow')){
    event.preventDefault();
    if(event.key==='ArrowLeft'||event.key==='ArrowRight')$('angle').value=String((Number($('angle').value)+(event.key==='ArrowLeft'?5:355))%360);
    else $('radius').value=Math.max(.25,Math.min(6,Number($('radius').value)+(event.key==='ArrowUp'?.05:-.05))).toFixed(2);
    updateDraft();
  }
});
function frame(time){renderer?.draw(time/1000);requestAnimationFrame(frame);}requestAnimationFrame(frame);
updateDraft();
