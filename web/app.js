import { Renderer } from './renderer.js';
import { installInput } from './input.js';
import { readProfile, writeProfile, canPlay, nextMission, award, normalizeProfile } from './progression.js';
import {deviceStorage,parseReplay,saveExperiment,savedExperiments,archiveExperiment,parseArchive} from './storage.js';
import {Soundscape} from './audio.js';
import {shouldPresent} from './presentation.js';
import {parseSeed,parseLaunchFields,placementIssue} from './conditions.js';
import {RequestChannel} from './channel.js';
import {EventCursor} from './events.js';
import {FrameClock} from './cadence.js';
import {readViewSettings,writeViewSettings} from './preferences.js';

const $=id=>document.getElementById(id);
let state=null, missions=[], mission=0, renderer, ready=false, toastTimer;
const storage=deviceStorage();
const viewSettings=readViewSettings(storage,matchMedia('(prefers-reduced-motion: reduce)').matches);
const sound=new Soundscape();const eventCursor=new EventCursor();
let profile=readProfile(storage),awardedThisRun=false,saveBusy=false,saveEpoch=0;

function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function fail(message){$('loading').hidden=false;$('loading').querySelector('p').textContent=message;$('play').disabled=true;}
try { renderer=new Renderer($('universe'),toast); } catch(error){fail(error.message);}
const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
const channel=new RequestChannel(message=>worker.postMessage(message));
function send(type,data={}){return channel.send(type,data);}
function workerFailed(message){ready=false;channel.close(message);fail(message);}
function action(type,data={}){return send(type,data).catch(error=>toast(error.message));}
function draft(){return parseLaunchFields({kind:$('kind').value,radius:$('radius').value,angle:$('angle').value,speed:$('speed').value});}
function updateDraft(){
  let d;try{d=draft();}catch(error){if(renderer)renderer.draft=null;$('launch').disabled=true;$('orbit-reading').textContent=error.message;return;}
  if(renderer)renderer.draft=d;
  $('radius-range').value=String(d.radius);$('speed-range').value=String(d.speed*100);
  const issue=placementIssue(state?.status,d.kind);$('launch').disabled=!ready||Boolean(issue);$('launch').title=issue;
  $('orbit-reading').textContent=issue||(d.speed>Math.SQRT2?'Escape trajectory · a world without a sun':Math.abs(d.speed-1)<.015?'Circular orbit · a quiet beginning':d.speed<.2?'Falling inward · likely stellar impact':'Elliptical orbit · watch the close approach');
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
  $('disk-tools').hidden=mission!==null&&mission<4;
  $('recipes').hidden=mission!==null;
  $('star-mass').disabled=mission!==null&&mission<2;
  $('next-mission').hidden=true;updateDraft();
}
async function reset(next=mission,overrides={}){
  if(!ready)return;
  if(next!==null&&!canPlay(profile,next)){toast('Complete the previous challenges first.');return;}
  mission=next;
  saveEpoch++;
  awardedThisRun=false;
  if(mission!==null&&mission<2)$('star-mass').value='1';
  setMissionUI();renderer?.trails.clear();
  await action('reset',{config:{seed:parseSeed($('seed').value),mission,star_mass:Number($('star-mass').value),...overrides}});
  autosave();
}
let inspectorIds='';
function inspect(){
  const ids=state?.bodies.map(b=>b.id).join(',')||'';
  if(ids!==inspectorIds){
    inspectorIds=ids;$('inspect-body').replaceChildren();
    for(const b of state?.bodies||[]){const option=document.createElement('option');option.value=String(b.id);option.textContent=b.id===0?'The star':`World ${b.id} · ${b.kind}`;$('inspect-body').append(option);}
  }
  const body=state?.bodies.find(b=>b.id===renderer?.selected);
  $('nudge-controls').hidden=!body||body.id===0||(mission!==null&&mission<4);
  const p=$('inspector');
  p.replaceChildren();const label=document.createElement('span');label.className='eyebrow';label.textContent='OBSERVATION';p.append(label);
  const text=document.createElement('p');
  if(!body)text.textContent='Select a world in the view or body list.';
  else if(body.id===0)text.textContent=`${body.mass.toFixed(2)} solar masses. The potential habitable zone spans ${state.status.zone_inner.toFixed(2)}–${state.status.zone_outer.toFixed(2)} AU.`;
  else{
    const orbit=state.orbits.find(([id])=>id===body.id)?.[1];
    text.textContent=`World ${body.id} · ${body.kind}\n${(body.mass/3.003e-6).toFixed(2)} Earth masses · ${orbit.distance.toFixed(2)} AU\n${orbit.habitable?'Potentially habitable':orbit.calm?'Calm orbit':orbit.bound?'Eccentric orbit':'Escaping'} · e = ${orbit.eccentricity.toFixed(3)}\nClosest: ${orbit.periapsis.toFixed(2)} AU\nFarthest: ${orbit.bound?orbit.apoapsis.toFixed(2)+' AU':'unbounded'}\nPeriod: ${orbit.period_years===null?'no return':orbit.period_years.toFixed(2)+' years'}`;
    text.style.whiteSpace='pre-line';
  }
  p.append(text);
  if(body)$('inspect-body').value=String(body.id);
}
$('inspect-body').onchange=()=>{if(renderer)renderer.selected=Number($('inspect-body').value);inspect();};
for(const button of document.querySelectorAll('[data-nudge]'))button.onclick=()=>{const command={type:'nudge',id:renderer?.selected,tangential:0,radial:0};command[button.dataset.nudge]=Number(button.dataset.amount);action('command',{command});};
let lastUI=0,lastEventSignature='',lastObjectives='';
function renderState(next){
  const present=shouldPresent(state,next,lastUI,performance.now());
  if(next.config.mission!==mission){mission=next.config.mission;awardedThisRun=false;setMissionUI();}
  $('star-mass').value=String(next.config.star_mass);
  if(document.activeElement!==$('seed'))$('seed').value=String(next.config.seed);
  $('system-label').textContent=`EXPERIMENT ${String(next.config.seed).padStart(4,'0')}`;
  state=next;renderer?.setState(next);$('universe').dataset.tick=String(next.tick);
  if(!present)return;lastUI=performance.now();
  const s=next.status,m=mission===null?null:missions[mission];
  for(const tool of s.tools){const option=[...$('kind').options].find(option=>option.value===tool.kind);if(option)option.disabled=!tool.unlocked;}
  updateDraft();
  for(const button of document.querySelectorAll('[data-nudge]'))button.disabled=s.remaining<1||s.actions_remaining===0;
  const objectives=JSON.stringify(s.objectives);
  if(objectives!==lastObjectives){lastObjectives=objectives;$('objectives').replaceChildren();for(const goal of s.objectives.filter(Boolean)){const li=document.createElement('li'),label=document.createElement('span'),value=document.createElement('strong');label.textContent=goal.label;value.textContent=`${goal.current} / ${goal.target}`;li.classList.toggle('met',goal.current>=goal.target);li.append(label,value);$('objectives').append(li);}}
  if(s.completed&&mission!==null&&!awardedThisRun){
    awardedThisRun=true;profile=award(profile,mission);
    if(!writeProfile(storage,profile))toast('Discovery earned. Device storage is unavailable, so progress will last for this session.');
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
  if(s.exhausted)$('goal-state').textContent='Experiment limit reached. Export it to keep it, or start a fresh system.';
  $('system-title').textContent=s.completed?'A little order, from the unknown.':s.planets>0?'Gravity has the pen now.':'A beginning, in starlight.';
  const eventSignature=JSON.stringify(next.events);
  for(const event of eventCursor.consume(next.generation,next.events))sound.event(event.kind);
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
    document.body.dataset.ready='true';
    let restored=false;
    for(const replay of savedExperiments(storage)){
      try{
        const data=parseReplay(replay);
        if(data.config.mission!==null&&!canPlay(profile,data.config.mission))continue;
        await send('reset',{config:data.config});await send('import',{replay});
        toast('Your experiment is restored, paused.');restored=true;break;
      }catch{/* Try backup before starting fresh. */}
    }
    if(!restored)await reset(nextMission(profile));
  }else if(data.type==='state'){renderState(data);}
  else if(data.type==='fatal'){workerFailed(data.message);}
  if(!channel.receive(data)&&data.type==='error')toast(data.message);
};
worker.onerror=()=>workerFailed('The simulation could not start. Reload to try again.');
function confirmReset(callback,onCancel=()=>{}){
  if(!state||state.bodies.length===1){callback();return;}
  $('confirm-dialog').showModal();let accepted=false;
  $('confirm-dialog').onclose=()=>{if(!accepted)onCancel();};
  $('confirm-ok').onclick=()=>{accepted=true;$('confirm-dialog').close();callback();};
}
async function autosave(){
  if(!ready||!state||saveBusy)return;
  saveBusy=true;const epoch=saveEpoch;
  try{
    const {replay}=await send('export');
    if(epoch===saveEpoch)$('save-status').textContent=saveExperiment(storage,replay)?'Saved on this device':'Saving unavailable · export to keep';
  }catch{$('save-status').textContent='Save pending';}finally{saveBusy=false;}
}
setInterval(autosave,3000);
function download(content,name){const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').onclick=async()=>{
  try{
    const {replay}=await send('export');download(replay,'celestial-experiment.json');
  }catch(error){toast(error.message);}
};
$('backup').onclick=async()=>{try{const {replay}=await send('export');download(archiveExperiment(replay,profile),'celestial-backup.json');}catch(error){toast(error.message);}};
$('import').onclick=()=>$('import-file').click();
$('import-file').onchange=async()=>{
  const file=$('import-file').files[0];$('import-file').value='';if(!file)return;
  try{
    if(file.size>600_000)throw new Error('Choose an experiment or backup smaller than 600 KB.');
    const archive=parseArchive(await file.text()),replay=archive.replay,data=parseReplay(replay);
    const merged=normalizeProfile({version:1,completed:[...profile.completed,...(archive.profile?.completed||[])]});
    if(data.config.mission!==null&&!canPlay(merged,data.config.mission))throw new Error('Complete earlier challenges before importing this challenge.');
    confirmReset(async()=>{try{saveEpoch++;await send('import',{replay});profile=merged;if(state.status.completed&&mission!==null)profile=award(profile,mission);writeProfile(storage,profile);renderState(state);renderer?.trails.clear();await autosave();toast('Experiment imported, paused.');}catch(error){toast(error.message);}});
  }catch(error){toast(error.message);}
};
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
$('clear').onclick=()=>confirmReset(()=>reset());
$('star-mass').onchange=()=>{const star_mass=Number($('star-mass').value);confirmReset(()=>reset(mission,{star_mass}),()=>{$('star-mass').value=String(state.config.star_mass);});};
$('seed').onchange=()=>{try{const seed=parseSeed($('seed').value);confirmReset(()=>reset(mission,{seed}),()=>{$('seed').value=String(state.config.seed);});}catch(error){toast(error.message);$('seed').value=String(state?.config.seed??42);}};
$('launch-form').onsubmit=event=>{event.preventDefault();if(ready)send('command',{command:{type:'launch',...draft()}}).catch(error=>toast(error.message));};
$('seed-belt').onclick=()=>action('command',{command:{type:'seed_belt',radius:Number($('radius').value)}});
$('disk-disorder').oninput=()=>$('disk-disorder-value').textContent=$('disk-disorder').value+'%';
$('disk-form').onsubmit=event=>{event.preventDefault();send('command',{command:{type:'seed_disk',radius:Number($('disk-radius').value),spread:Number($('disk-width').value),count:Number($('disk-count').value),disorder:Number($('disk-disorder').value)/100}}).then(()=>{toast('Debris placed. Run the system to watch it evolve.');}).catch(error=>toast(error.message));};
for(const id of ['kind','radius','speed','angle'])$(id).addEventListener('input',updateDraft);
for(const id of ['radius','speed'])$(id+'-range').oninput=()=>{$(id).value=$(id+'-range').value;updateDraft();};
$('play').onclick=()=>action('play',{value:!state?.playing});$('step').onclick=()=>action('step');$('rewind').onclick=()=>action('rewind');
$('undo').onclick=()=>action('undo').then(()=>renderer?.trails.clear());
$('time-speed').onchange=()=>action('speed',{value:Number($('time-speed').value)});
$('view').onclick=()=>{if(renderer){renderer.tilt=renderer.tilt===1?.62:1;$('view').textContent=renderer.tilt===1?'Tilt view':'Top view';}};
$('display').onclick=()=>$('display-dialog').showModal();$('close-display').onclick=()=>$('display-dialog').close();
for(const [id,key] of [['show-grid','showGrid'],['show-trails','showTrails'],['show-preview','showPreview'],['reduce-motion','reduceMotion']]){
 $(id).checked=viewSettings[key];if(renderer)renderer[key]=viewSettings[key];
 $(id).onchange=()=>{viewSettings[key]=$(id).checked;if(renderer)renderer[key]=viewSettings[key];writeViewSettings(storage,viewSettings);};
}
$('render-quality').value=String(viewSettings.maxDpr);if(renderer)renderer.maxDpr=viewSettings.maxDpr;
$('render-quality').onchange=()=>{viewSettings.maxDpr=Number($('render-quality').value);if(renderer)renderer.maxDpr=viewSettings.maxDpr;writeViewSettings(storage,viewSettings);};
$('reset-view').onclick=()=>{if(renderer){renderer.zoom=3.5;renderer.tilt=.62;$('view').textContent='Top view';}};
$('zoom-in').onclick=()=>{if(renderer)renderer.zoom=Math.max(1,renderer.zoom*.8);};$('zoom-out').onclick=()=>{if(renderer)renderer.zoom=Math.min(9,renderer.zoom/ .8);};
for(const button of document.querySelectorAll('[data-panel]'))if(button.tagName==='BUTTON')button.onclick=()=>{document.body.dataset.panel=button.dataset.panel;for(const other of document.querySelectorAll('.mobile-tabs button'))other.classList.toggle('active',other===button);};
$('help').onclick=()=>$('help-dialog').showModal();for(const button of document.querySelectorAll('.dialog-close'))button.onclick=()=>$('help-dialog').close();
document.addEventListener('visibilitychange',()=>{if(document.hidden&&ready){action('play',{value:false});autosave();}});
$('sound').onclick=async()=>{try{const enabled=await sound.toggle();$('sound').setAttribute('aria-pressed',String(enabled));$('sound').setAttribute('aria-label',enabled?'Mute sound':'Enable sound');$('sound').classList.toggle('active',enabled);}catch(error){toast(error.message);}};
document.addEventListener('visibilitychange',()=>sound.visibility(document.hidden).catch(()=>{}));
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
const frameClock=new FrameClock();
function frame(time){if(frameClock.due(time,{playing:state?.playing,batterySaver:viewSettings.maxDpr===1,reduceMotion:viewSettings.reduceMotion,hidden:document.hidden}))renderer?.draw(time/1000);requestAnimationFrame(frame);}requestAnimationFrame(frame);
updateDraft();

let recipes=null;
$('recipes').onclick=async()=>{
 try{
  if(!recipes){const response=await fetch(new URL('./recipes.json',import.meta.url));if(!response.ok)throw new Error('Starting points could not load. Try again.');recipes=await response.json();}
  $('recipe-list').replaceChildren();
  for(const recipe of recipes){const button=document.createElement('button');button.className='recipe-choice';const title=document.createElement('strong'),description=document.createElement('span');title.textContent=recipe.name;description.textContent=recipe.description;button.append(title,description);
   button.onclick=()=>{$('recipes-dialog').close();confirmReset(async()=>{try{saveEpoch++;const replay=JSON.stringify({version:1,config:{...recipe.config,seed:parseSeed($('seed').value)},commands:recipe.commands.map(command=>({tick:0,command})),end_tick:0});await send('import',{replay});await autosave();toast(recipe.name+' is ready. Run it or make it your own.');}catch(error){toast(error.message);}});};
   $('recipe-list').append(button);
  }
  $('recipes-dialog').showModal();
 }catch(error){toast(error.message);}
};
$('close-recipes').onclick=()=>$('recipes-dialog').close();
