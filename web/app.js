import {resonanceText} from './resonance-reading.js';
import {experimentDifferences} from './comparison.js';
import {orbitalWatchSpeed} from './playback.js';
import { Renderer } from './renderer.js';
import {clampZoom} from './camera.js';
import {FrameMeter,fpsFlag} from './performance.js';
import {DeviceRecording,deviceScenario} from './device-test.js';
import {strongestPerturber} from './appearance.js';
import { installInput } from './input.js';
import { readProfile, writeProfile, canPlay, nextMission, award, normalizeProfile } from './progression.js';
import {deviceStorage,parseReplay,saveExperiment,savedExperiments,archiveExperiment,parseArchive} from './storage.js';
import {Soundscape} from './audio.js';
import {shouldPresent} from './presentation.js';
import {parseSeed,parseLaunchFields,placementIssue} from './conditions.js';
import {RequestChannel} from './channel.js';
import {EventCursor} from './events.js';
import {FrameClock} from './cadence.js';
import {CoalescedTask} from './coalesce.js';
import {goalMessage} from './guidance.js';
import {diagnosticReport} from './report.js';
import {diskCommand,diskIssue} from './disk.js';
import {readViewSettings,writeViewSettings} from './preferences.js';
import {entry,readNotebook,writeNotebook,compare,summarize,preserveOriginal} from './notebook.js';
import {moonRegion} from './moons.js';
import {orbitReading,spinReading,spinRate} from './readings.js';
import {Observatory} from './observatory.js';
import {ChallengeGuide} from './challenges.js';
import {GeneratorControls} from './generation.js';

const $=id=>document.getElementById(id);
let state=null, missions=[], mission=0, renderer, selectedBody=null, ready=false, toastTimer;
const storage=deviceStorage();
const viewSettings=readViewSettings(storage,matchMedia('(prefers-reduced-motion: reduce)').matches);
viewSettings.showFps=fpsFlag(location.search,viewSettings.showFps);
const sound=new Soundscape();sound.setVolume(viewSettings.volume);const eventCursor=new EventCursor();
let profile=readProfile(storage),awardedThisRun=false,saveEpoch=0,autosaveTimer;

function positionToast(){const canvas=$('universe').getBoundingClientRect();$('toast').style.bottom=Math.max(12,innerHeight-canvas.bottom+16)+'px';}
addEventListener('resize',positionToast);
function toast(message){positionToast();$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function fail(message){$('loading').hidden=false;$('loading').querySelector('p').textContent=message;$('play').disabled=true;$('reload').hidden=false;}
$('reload').onclick=()=>location.reload();
try { renderer=new Renderer($('universe'),toast); } catch(error){fail(error.message+' You can still sculpt, run, inspect and export using the controls.');}
let worker,startupError;
try{worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});}catch(error){startupError='The simulation worker could not start. Reload to try again. '+error.message;}
const channel=new RequestChannel(message=>worker.postMessage(message));
async function send(type,data={}){
 if(state?.reviewing&&(['command','step'].includes(type)||type==='play'&&data.value)){
  const original=await channel.send('original');notebookEntries=preserveOriginal(storage,notebookEntries,original.replay,original.snapshot);
 }
 return channel.send(type,data).then(reply=>{if(['command','undo','rewind','step'].includes(type)){clearTimeout(autosaveTimer);autosaveTimer=setTimeout(autosave,250);}return reply;});
}
function workerFailed(message){ready=false;clearTimeout(startupTimer);worker?.terminate();channel.close(message);document.body.dataset.ready='error';for(const id of ['launch','step','undo','rewind'])$(id).disabled=true;fail(message);}
const startupTimer=setTimeout(()=>workerFailed('The simulation is taking too long to load. Check your connection and reload.'),30000);
if(startupError)workerFailed(startupError);
function action(type,data={}){return send(type,data).catch(error=>toast(error.message));}
function draft(){return {...parseLaunchFields({kind:$('kind').value,radius:$('radius').value,angle:$('angle').value,speed:$('speed').value}),mass:Number($('body-mass').value)};}
function updateDraft(){
  let d;try{d=draft();}catch(error){if(renderer)renderer.draft=null;$('launch').disabled=true;$('orbit-reading').textContent=error.message;return;}
  if(renderer)renderer.draft={...d,speed:d.speed*Number($('orbit-direction').value)};
  $('radius-range').value=String(d.radius);$('speed-range').value=String(d.speed*100);
  const tool=state?.status.tools.find(t=>t.kind===d.kind);
  $('body-mass').min=String(tool?.min_mass??.1);$('body-mass').max=String(tool?.max_mass??10);$('body-mass').disabled=state?.rules_version===1;
  $('mass-summary').textContent=`Mass & launch angle · ${d.mass} Earth${d.mass===1?'':'s'}`;
  $('mass-help').textContent=state?.rules_version===1?'This restored experiment uses its original fixed masses. Start a fresh system for custom masses.':`Costs ${d.mass} matter. More mass means stronger gravity and a larger world.`;
  const issue=placementIssue(state?.status,d.kind,state?.rules_version===1?undefined:d.mass);$('launch').disabled=!ready||Boolean(issue);$('launch').title=issue;
  $('orbit-reading').textContent=issue||(d.speed>Math.SQRT2?'Escape trajectory · a world without a sun':Math.abs(d.speed-1)<.015?'Circular orbit · a quiet beginning':d.speed<.2?'Falling inward · likely stellar impact':'Elliptical orbit · watch the close approach');
}
function setMissionUI(){
  const m=mission===null?null:(state?.mission_definition||missions[mission]);
  $('campaign').setAttribute('aria-pressed',String(mission!==null));$('sandbox').setAttribute('aria-pressed',String(mission===null));
  $('campaign').classList.toggle('active',mission!==null);$('sandbox').classList.toggle('active',mission===null);
  $('mission-index').textContent=m?`CHALLENGE ${String(mission+1).padStart(2,'0')} / 10`:'OPEN EXPLORATION';
  $('mission-name').textContent=m?.name||'Your universe';
  $('mission-brief').textContent=m?.brief||'No goal, no hurry. Follow an idea and see what gravity makes of it.';
  $('mission-hint').textContent=m?.hint||'Try a crowded belt, a giant on an eccentric orbit, or a system around a smaller star.';
  $('reward').textContent=m?.unlock||'Every tool is available';
  const speedLimit=state?.rules_version>=3&&mission===6?135:220;$('speed').max=String(speedLimit);$('speed-range').max=String(speedLimit);if(Number($('speed').value)>speedLimit)$('speed').value=String(speedLimit);
  $('launch-form').hidden=Boolean(state?.rules_version>=3&&mission!==null&&(mission>=3&&mission<=5||mission===7));
  const dust=state?.status.tools.find(t=>t.kind==='dust');
  $('seed-belt').hidden=!dust?.unlocked;
  $('disk-tools').hidden=!dust?.unlocked;
  if(mission!==null&&mission>=3&&mission<=5&&state?.rules_version>=3)$('disk-tools').open=true;
  $('recipes').hidden=mission!==null;
  $('star-mass').disabled=mission!==null&&mission<2;
  $('next-mission').hidden=true;updateDraft();
}
async function reset(next=mission,overrides={}){
 if(!ready)return false;
 if(next!==null&&!canPlay(profile,next)){toast('Complete the previous challenges first.');return false;}
 try{
  const config={seed:parseSeed($('seed').value),mission:next,star_mass:next!==null&&next<2?1:Number($('star-mass').value),...overrides};
  saveEpoch++;await send('reset',{config});awardedThisRun=false;setMissionUI();if(next===7&&state.rules_version>=3){selectedBody=1;if(renderer){renderer.selected=1;renderer.focus(1);}inspect();$('moon-tools').open=true;}await autosave();return true;
 }catch(error){
  if(state){mission=state.config.mission;$('star-mass').value=String(state.config.star_mass);$('seed').value=String(state.config.seed);setMissionUI();}
  toast(error.message);return false;
 }
}
let moonHost=null;
let inspectorIds='';
function inspect(){
  const ids=state?.bodies.map(b=>b.id).join(',')||'';
  if(ids!==inspectorIds){
    inspectorIds=ids;$('inspect-body').replaceChildren();
    for(const b of state?.bodies||[]){const option=document.createElement('option');option.value=String(b.id);option.textContent=b.id===0?'The star':`World ${b.id} · ${b.kind}`;$('inspect-body').append(option);}
  }
  const body=state?.bodies.find(b=>b.id===selectedBody);
  $('migration-tools').hidden=mission!==null||!body||body.id===0||body.parent!==null||state?.rules_version<3;
  $('spin-controls').hidden=!body||body.id===0||state?.rules_version===1;
  $('moon-tools').hidden=!body||body.id===0||body.parent!==null||state?.rules_version===1||(mission!==null&&mission<4);
  if(body&&!$('moon-tools').hidden){const hostKey=`${state.generation}:${body.id}`;
   if(hostKey!==moonHost){moonHost=hostKey;const mass=Math.max(.001,Math.min(.1,body.mass/3.003e-6*.01));$('moon-mass').value=String(Number(mass.toFixed(3)));const region=moonRegion(body,state.orbits.find(([id])=>id===body.id)?.[1],state.bodies[0].mass,mass);$('moon-distance').value=String(Number(Math.sqrt(region.min*region.max).toFixed(4)));}
   updateMoonRegion(body);
  }
  $('watch-orbit').disabled=!body||body.id===0;
  $('nudge-controls').hidden=!body||body.id===0||!state?.burns_available;
  if(body&&body.id!==0)$('nudge-controls').querySelector('p').textContent=`Adjust orbit around ${state.moon_orbits?.some(([id])=>id===body.id)?`World ${body.parent}`:'the star'} · 1 matter per burn. Boost follows the orbital direction; strength is a fraction of circular speed around this host.`;
  const p=$('inspector');
  p.replaceChildren();const label=document.createElement('span');label.className='eyebrow';label.textContent='OBSERVATION';p.append(label);
  const text=document.createElement('p');
  if(!body)text.textContent='Select a world in the view or body list.';
  else if(body.id===0)text.textContent=`${body.mass.toFixed(2)} solar masses. The potential habitable zone spans ${state.status.zone_inner.toFixed(2)}–${state.status.zone_outer.toFixed(2)} AU.`;
  else{
    const moonOrbit=state.moon_orbits?.find(([id])=>id===body.id)?.[1];const orbit=moonOrbit||state.orbits.find(([id])=>id===body.id)?.[1];
    text.textContent=orbitReading(body,orbit,moonOrbit?state.bodies.find(b=>b.id===body.parent):state.bodies[0]);
    text.style.whiteSpace='pre-line';
  }
  p.append(text);
  if(body&&body.id!==0){const rotation=document.createElement('p');rotation.textContent=spinReading(body,state.bodies.find(b=>b.id===(body.parent??0)));p.append(rotation);}
  if(body)$('inspect-body').value=String(body.id);
  if(body&&body.id!==0){const source=strongestPerturber(body,state.bodies,state.rules_version===1?.002:.0001),facts=document.createElement('p');facts.textContent=`Contact radius: ${body.radius.toFixed(4)} AU. Material: ${((body.material?.ice||0)/body.mass*100).toFixed(0)}% ice, ${((body.material?.gas||0)/body.mass*100).toFixed(0)}% gas.`;p.append(facts);if(source){const pull=document.createElement('p');pull.className='gravity-reading';pull.textContent=`Strongest neighbor: World ${source.body.id} · ${(source.ratio*100).toFixed(source.ratio<.01?2:1)}% of the star's pull. The blue outline is this world's current orbit; neighbors can bend it.`;p.append(pull);}}
}
function updateMoonRegion(body=state?.bodies.find(b=>b.id===selectedBody)){
 if(!body||body.id===0)return;const mass=Number($('moon-mass').value),distance=Number($('moon-distance').value),region=moonRegion(body,state.orbits.find(([id])=>id===body.id)?.[1],state.bodies[0].mass,mass);
 $('moon-mass').max=String(Math.min(10,body.mass/3.003e-6*.1));
 $('add-moon').disabled=!region.available||distance<region.min||distance>region.max||mass>state.status.remaining;
 $('moon-guidance').textContent=region.available?`World ${body.id}. For this mass, start between ${region.min.toFixed(4)} and ${region.max.toFixed(4)} AU. Space moons apart; all bodies can perturb them.`:'This mass or host orbit has no supported starting region. Try a lighter moon or a calmer, more distant host.';
}
$('moon-mass').oninput=()=>updateMoonRegion();$('moon-distance').oninput=()=>updateMoonRegion();
$('inspect-body').onchange=()=>{selectedBody=Number($('inspect-body').value);if(renderer)renderer.selected=selectedBody;inspect();};
for(const button of document.querySelectorAll('[data-nudge]'))button.onclick=()=>{const command={type:'nudge',id:selectedBody,tangential:0,radial:0};command[button.dataset.nudge]=Number(button.dataset.amount);action('command',{command});};
let lastUI=0,lastEventSignature='',lastObjectives='';
function renderState(next){
  const present=shouldPresent(state,next,lastUI,performance.now());
  if(next.generation!==state?.generation)frameMeter.reset(performance.now(),next.tick);
  const changedMission=next.config.mission!==mission||next.rules_version!==state?.rules_version;
  if(changedMission){mission=next.config.mission;awardedThisRun=false;}
  $('star-mass').value=String(next.config.star_mass);
  if(document.activeElement!==$('seed'))$('seed').value=String(next.config.seed);
  $('system-label').textContent=`EXPERIMENT ${String(next.config.seed).padStart(4,'0')}`;
  if(!next.bodies.some(body=>body.id===selectedBody))selectedBody=null;
  state=next;if(changedMission)setMissionUI();renderer?.setState(next);$('universe').dataset.tick=String(next.tick);
  if(!present)return;lastUI=performance.now();
  updateHistory();
  const s=next.status,m=next.mission_definition||(mission===null?null:missions[mission]);
  for(const tool of s.tools){const option=[...$('kind').options].find(option=>option.value===tool.kind);if(option)option.disabled=!tool.unlocked;}
  if($('kind').selectedOptions[0]?.disabled){const first=[...$('kind').options].find(o=>!o.disabled);if(first){$('kind').value=first.value;$('body-mass').value=String({rocky:1,ice:2,giant:318,dust:.25}[first.value]);}}
  updateDraft();updateDisk();
  for(const button of document.querySelectorAll('[data-nudge]'))button.disabled=s.remaining<1||s.actions_remaining===0;
  const objectives=JSON.stringify(s.objectives);
  if(objectives!==lastObjectives){lastObjectives=objectives;$('objectives').replaceChildren();for(const goal of s.objectives.filter(Boolean)){const li=document.createElement('li'),label=document.createElement('span'),value=document.createElement('strong');label.textContent=goal.label;value.textContent=`${goal.current} / ${goal.target}`;li.classList.toggle('met',goal.current>=goal.target);li.append(label,value);$('objectives').append(li);}}
  if(s.completed&&mission!==null&&!awardedThisRun){
    awardedThisRun=true;profile=award(profile,mission,next.assessment?.mastery.filter(goal=>goal.earned).map(goal=>goal.code)||[]);
    if(!writeProfile(storage,profile))toast('Discovery earned. Device storage is unavailable, so progress will last for this session.');
    else toast(`Discovery: ${m.unlock}`);
  }
  $('playback-note').textContent=`${s.moons} bound moon${s.moons===1?'':'s'} · ${s.formed} worlds formed from debris`;
  updateResonanceReadings(next);
  $('next-mission').hidden=!s.completed||mission===null;
  $('next-mission').textContent=mission===9?'Explore the sandbox':'Next challenge';
  $('collection').textContent=`${profile.completed.length} / 10 discoveries`;
  $('time-speed').value=String(next.speed);
  $('sim-years').textContent=s.years.toFixed(2);$('matter').textContent=s.remaining.toLocaleString(undefined,{maximumFractionDigits:2});
  $('planet-count').textContent=String(s.planets);$('calm-count').textContent=String(s.calm);$('habitable-count').textContent=String(s.habitable);
  $('goal-progress').value=s.progress;$('goal-time').textContent=m?(m.hold_years?`${s.held_years.toFixed(1)} / ${m.hold_years} yr`:s.completed?'Complete':'Discovery'):'Free play';
  $('goal-state').textContent=goalMessage(s,mission,next.bodies.length,next);
  if([4,6,8].includes(mission)&&!s.exhausted&&next.assessment)$('goal-state').textContent=next.assessment.message;
  challengeGuide.update(next);
  generatorControls.update();
  $('goal-label').textContent=m?(m.hold_years?'Maintain conditions':'Make a discovery'):'Open exploration';$('goal-progress').hidden=mission===null;
  $('outcome-totals').textContent=`${s.collisions} mergers · ${s.grazes||0} grazes · ${s.disruptions||0} disruptions · ${s.ejections} escapes · ${s.absorbed} stellar impacts`;
  $('play').textContent=next.playing?'Ⅱ Pause':'▶ Run';$('play').disabled=!ready||s.exhausted;
  $('system-title').textContent=s.completed?'A little order, from the unknown.':s.planets>0?'Gravity has the pen now.':'A beginning, in starlight.';
  const eventSignature=JSON.stringify(next.events);
  for(const event of eventCursor.consume(next.generation,next.events))sound.event(event.kind);
  if(eventSignature!==lastEventSignature){
    lastEventSignature=eventSignature;$('events').replaceChildren();
    if(!next.events.length){const li=document.createElement('li');li.textContent='Your star is waiting.';$('events').append(li);}
    for(const event of [...next.events].reverse().slice(0,5)){const li=document.createElement('li');const button=document.createElement('button');button.className='journal-event';button.textContent=`${(event.tick/512).toFixed(2)} yr · ${event.text}`;button.onclick=()=>{renderer?.focusEvent(event);selectedBody=event.body;inspect();if(!state.bodies.some(b=>b.id===event.body))toast(`Event location at year ${(event.tick/512).toFixed(2)}. Use the notebook timeline to review the earlier system.`);};li.append(button);$('events').append(li);}
  }
  inspect();
}
if(worker)worker.onmessage=async({data})=>{
  if(data.type==='ready'){
    clearTimeout(startupTimer);missions=data.missions;ready=true;if(renderer)$('loading').hidden=true;
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
if(worker)worker.onerror=()=>workerFailed('The simulation could not start. Reload to try again.');
let confirming=false;
async function confirmReset(callback,onCancel=()=>{}){
 if(confirming)return;
 if(!state||state.bodies.length===1){try{await callback();}catch(error){toast(error.message);}return;}
 confirming=true;const wasPlaying=state.playing,generation=state.generation;
 try{
  if(wasPlaying)await send('play',{value:false});
  const dialog=$('confirm-dialog');let accepted=false;
  dialog.onclose=()=>{confirming=false;if(!accepted){onCancel();if(wasPlaying&&state?.generation===generation&&!document.hidden)action('play',{value:true});}};
  $('confirm-ok').onclick=async()=>{accepted=true;dialog.close();try{await callback();}catch(error){toast(error.message);}};
  dialog.showModal();
 }catch(error){confirming=false;toast(error.message);}
}
async function saveSnapshot(){
  if(!ready||!state)return;
  const epoch=saveEpoch;
  try{
    const {replay}=await send('export');
    if(epoch===saveEpoch)$('save-status').textContent=saveExperiment(storage,replay)?'Saved on this device':'Saving unavailable · export to keep';
  }catch{$('save-status').textContent='Save pending';}
}
const saveTask=new CoalescedTask(saveSnapshot);
function autosave(){return saveTask.run();}
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
    const merged=normalizeProfile({version:1,completed:[...profile.completed,...(archive.profile?.completed||[])],mastery:[...(profile.mastery||[]),...(archive.profile?.mastery||[])]});
    if(data.config.mission!==null&&!canPlay(merged,data.config.mission))throw new Error('Complete earlier challenges before importing this challenge.');
    confirmReset(async()=>{try{saveEpoch++;await send('import',{replay});profile=merged;if(state.status.completed&&mission!==null)profile=award(profile,mission,state.assessment?.mastery.filter(goal=>goal.earned).map(goal=>goal.code)||[]);writeProfile(storage,profile);renderState(state);renderer?.trails.clear();await autosave();toast('Experiment imported, paused.');}catch(error){toast(error.message);}});
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
function launchCommand(){const d=draft();d.speed*=Number($('orbit-direction').value);return state?.rules_version===1?{type:'launch',kind:d.kind,radius:d.radius,angle:d.angle,speed:d.speed}:{type:'launch_mass',...d};}
$('launch-form').onsubmit=event=>{event.preventDefault();if(ready)send('command',{command:launchCommand()}).catch(error=>toast(error.message));};
$('seed-belt').onclick=()=>action('command',{command:{type:'seed_belt',radius:Number($('radius').value)}});
function diskDraft(){return diskCommand({radius:$('disk-radius').value,spread:$('disk-width').value,count:$('disk-count').value,disorder:$('disk-disorder').value});}
function updateDisk(){
 $('disk-disorder-value').textContent=$('disk-disorder').value+'%';
 try{const command=diskDraft(),issue=diskIssue(command,state?.status);$('seed-disk').disabled=!ready||Boolean(issue);$('disk-summary').textContent=issue||`${command.count} fragments · ${(command.radius-command.spread/2).toFixed(2)}–${(command.radius+command.spread/2).toFixed(2)} AU`;}catch(error){$('seed-disk').disabled=true;$('disk-summary').textContent=error.message;}
}
for(const id of ['disk-radius','disk-width','disk-count','disk-disorder'])$(id).oninput=updateDisk;
$('disk-form').onsubmit=event=>{event.preventDefault();try{send('command',{command:diskDraft()}).then(()=>toast('Debris placed. Run the system to watch it evolve.')).catch(error=>toast(error.message));}catch(error){toast(error.message);}};
$('kind').addEventListener('change',()=>{$('body-mass').value=String({rocky:1,ice:2,giant:state?.rules_version===1?50:318,dust:.25}[$('kind').value]);updateDraft();});
for(const id of ['kind','radius','speed','angle','body-mass','orbit-direction'])$(id).addEventListener('input',updateDraft);
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
$('reset-view').onclick=()=>{if(renderer){renderer.follow=null;renderer.cameraTo(state?.bodies[0].pos||{x:0,y:0},3.5);renderer.tilt=.62;$('view').textContent='Top view';}};
$('place-mode').onclick=()=>{if(!renderer)return;renderer.inputMode=renderer.inputMode==='place'?'navigate':'place';$('place-mode').setAttribute('aria-pressed',String(renderer.inputMode==='place'));$('place-mode').classList.toggle('active',renderer.inputMode==='place');$('scene-hint').textContent=renderer.inputMode==='place'?'Tap or drag to choose a launch position':'Drag to pan · Pinch to zoom · Double tap to follow';};
$('moon-form').onsubmit=event=>{event.preventDefault();send('command',{command:{type:'launch_moon',parent:selectedBody,kind:'rocky',mass:Number($('moon-mass').value),distance:Number($('moon-distance').value),angle:Number($('moon-angle').value)*Math.PI/180,speed:Number($('moon-direction').value)*Number($('moon-speed').value)/100}}).then(()=>{renderer?.focus(selectedBody);toast('Moon placed. Every body contributes to its orbit.');}).catch(error=>toast(error.message));};
for(const [id,direction] of [['spin-forward',1],['spin-reverse',-1]])$(id).onclick=()=>{try{action('command',{command:{type:'spin',id:selectedBody,rate:spinRate($('spin-rate').value,direction)}});}catch(error){toast(error.message);}};
$('spin-stop').onclick=()=>action('command',{command:{type:'spin',id:selectedBody,rate:0}});
$('fit-view').onclick=()=>renderer?.fit();
$('follow-body').onclick=()=>renderer?.focus(selectedBody);
$('show-orbit').onclick=()=>{if(renderer)renderer.selected=selectedBody;toast('Blue: current orbit. Amber: the strongest neighboring gravitational pull.');};
$('zoom-in').onclick=()=>{if(renderer)renderer.cameraTo(renderer.center,clampZoom(renderer.zoom*.8));};$('zoom-out').onclick=()=>{if(renderer)renderer.cameraTo(renderer.center,clampZoom(renderer.zoom/.8));};
for(const button of document.querySelectorAll('[data-panel]'))if(button.tagName==='BUTTON')button.onclick=()=>{document.body.dataset.panel=button.dataset.panel;if(button.dataset.panel==='observe'){$('analysis-tools').open=true;document.querySelector('.sculpt-panel').scrollTop=0;}for(const other of document.querySelectorAll('.mobile-tabs button')){other.classList.toggle('active',other===button);other.setAttribute('aria-pressed',String(other===button));}};
$('help').onclick=()=>$('help-dialog').showModal();for(const button of document.querySelectorAll('.dialog-close'))button.onclick=()=>$('help-dialog').close();
document.addEventListener('visibilitychange',()=>{if(document.hidden&&ready){action('play',{value:false});autosave();}});
$('sound').onclick=async()=>{$('sound').disabled=true;try{const enabled=await sound.toggle();$('sound').setAttribute('aria-pressed',String(enabled));$('sound').setAttribute('aria-label',enabled?'Mute sound':'Enable sound');$('sound').classList.toggle('active',enabled);}catch(error){toast(error.message);}finally{$('sound').disabled=false;}};
document.addEventListener('visibilitychange',()=>sound.visibility(document.hidden).catch(()=>{}));
if(renderer)installInput($('universe'),renderer,{
  onDraft:({radius,angle})=>{$('radius').value=radius.toFixed(2);$('angle').value=String(Math.round(angle));updateDraft();},
  onSelect:()=>{selectedBody=renderer.selected;inspect();},
});
document.addEventListener('keydown',event=>{
  if(!ready||document.querySelector('dialog[open]')||/INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName))return;
  if(event.repeat&&(event.code==='Space'||['l','r'].includes(event.key.toLowerCase())))return;
  if(event.code==='Space'){event.preventDefault();$('play').click();}
  else if(event.key.toLowerCase()==='f'){event.preventDefault();renderer?.fit();}
  else if(event.key==='Escape'&&renderer?.inputMode==='place')$('place-mode').click();
  else if(['w','a','s','d'].includes(event.key.toLowerCase())&&renderer){event.preventDefault();renderer.follow=null;renderer.cameraTween=null;renderer.panVelocity=null;renderer.center={x:renderer.center.x+({a:-1,d:1}[event.key.toLowerCase()]||0)*renderer.zoom*.08,y:renderer.center.y+({w:1,s:-1}[event.key.toLowerCase()]||0)*renderer.zoom*.08};renderer.cameraActiveUntil=performance.now()+300;}
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
const frameClock=new FrameClock(),frameMeter=new FrameMeter();
let deviceRecording=null,deviceScenarioName='current',deviceGeneration=0;
$('show-fps').checked=viewSettings.showFps;$('fps-overlay').hidden=!viewSettings.showFps;
$('show-fps').onchange=()=>{viewSettings.showFps=$('show-fps').checked;$('fps-overlay').hidden=!viewSettings.showFps;writeViewSettings(storage,viewSettings);frameMeter.reset(performance.now(),state?.tick||0);};
function frame(time){
 if(frameClock.due(time,{playing:state?.playing||time<(renderer?.cameraActiveUntil||0),batterySaver:viewSettings.maxDpr===1,reduceMotion:viewSettings.reduceMotion,hidden:document.hidden})){
  const start=performance.now(),drawn=renderer?.draw(time/1000);
  if(drawn&&$('scene-context').textContent!==renderer.sceneLabel)$('scene-context').textContent=renderer.sceneLabel;
  if(deviceRecording&&!deviceRecording.done){
   if(state?.generation!==deviceGeneration)deviceRecording.stop('system changed');
   deviceRecording.record(time,performance.now()-start,state?.tick||0,Boolean(drawn&&state?.playing&&!document.hidden));
   if(deviceRecording.done){$('device-status').textContent=`Recording ${deviceRecording.reason}. Download the report in View.`;toast('Device recording finished. Its report is ready in View.');}
  }
  if(viewSettings.showFps&&drawn){frameMeter.record(time,performance.now()-start);const report=frameMeter.report(time,state?.tick||0);if(report){globalThis.__celestialPerformance={...report,bodies:state.bodies.length,dpr:renderer.dpr,camera:{...renderer.center,zoom:renderer.zoom,following:renderer.follow}};$('fps-overlay').textContent=`${report.fps.toFixed(0)} fps · p95 ${report.p95.toFixed(1)} ms\nDraw CPU ${report.drawMs.toFixed(1)} ms · ${report.ticksPerSecond.toFixed(0)} ticks/s\n${state.bodies.length} bodies · DPR ${renderer.dpr}`;}}
 }
 requestAnimationFrame(frame);
}requestAnimationFrame(frame);
document.addEventListener('visibilitychange',()=>{frameMeter.reset(performance.now(),state?.tick||0);deviceRecording?.record(performance.now(),0,state?.tick||0,false);});
updateDraft();

let recipes=null;
$('recipes').onclick=async()=>{
 try{
  if(!recipes){const response=await fetch(new URL('./recipes.json',import.meta.url));if(!response.ok)throw new Error('Starting points could not load. Try again.');recipes=await response.json();}
  $('recipe-list').replaceChildren();
  for(const recipe of recipes){const button=document.createElement('button');button.className='recipe-choice';const title=document.createElement('strong'),description=document.createElement('span');title.textContent=recipe.name;description.textContent=recipe.description;button.append(title,description);
   button.onclick=()=>{$('recipes-dialog').close();confirmReset(async()=>{try{saveEpoch++;const replay=JSON.stringify({version:recipe.version||5,config:{...recipe.config,seed:parseSeed($('seed').value)},commands:recipe.commands.map(command=>({tick:0,command})),end_tick:0});await send('import',{replay});await autosave();renderer?.fit();if(recipe.focus!==undefined){selectedBody=recipe.focus;renderer?.focus(recipe.focus);inspect();}if(recipe.speed)await send('speed',{value:recipe.speed});if(recipe.id.includes('resonan'))$('resonance-panel').open=true;toast(recipe.name+' is ready. Run it or make it your own.');}catch(error){toast(error.message);}});};
   $('recipe-list').append(button);
  }
  $('recipes-dialog').showModal();
 }catch(error){toast(error.message);}
};
$('close-recipes').onclick=()=>$('recipes-dialog').close();

$('debug-report').onclick=async()=>{
 try{const {replay}=await send('export');const response=await fetch(new URL('./build-info.json',import.meta.url));if(!response.ok)throw new Error('Build details could not load. Export the experiment instead.');
 const build=await response.json();download(diagnosticReport(replay,profile,build,{browser:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio},webgl:Boolean(renderer),view:viewSettings,performance:globalThis.__celestialPerformance||null}),'celestial-bug-report.json');
 }catch(error){toast(error.message);}
};

$('sound-volume').value=String(Math.round(viewSettings.volume*100));$('sound-volume-value').textContent=$('sound-volume').value+'%';
$('sound-volume').oninput=()=>{viewSettings.volume=Number($('sound-volume').value)/100;sound.setVolume(viewSettings.volume);$('sound-volume-value').textContent=$('sound-volume').value+'%';writeViewSettings(storage,viewSettings);};

let lastResonanceText='';
function updateResonanceReadings(snapshot){
 const text=resonanceText(snapshot);
 if(text!==lastResonanceText){lastResonanceText=text;$('resonance-readings').textContent=text;}
}
$('start-migration').onclick=()=>action('command',{command:{type:'migration',id:selectedBody,timescale:Number($('migration-time').value)}});
$('stop-migration').onclick=()=>action('command',{command:{type:'migration',id:selectedBody,timescale:0}});

let notebookEntries=readNotebook(storage),comparisonIds=[];
function updateHistory(){
 if(!state)return;const slider=$('history-tick');slider.max=String(state.timeline_end||0);slider.disabled=!state.timeline_end;
 if(document.activeElement!==slider)slider.value=String(state.tick);
 $('history-time').textContent=`Year ${(Number(slider.value)/512).toFixed(2)} of ${((state.timeline_end||0)/512).toFixed(2)}`;
 $('history-latest').disabled=!state.reviewing||state.tick===state.timeline_end;
}
function showNotebook(){
 $('notebook-list').replaceChildren();comparisonIds=comparisonIds.filter(id=>notebookEntries.some(item=>item.id===id));
 $('notebook-status').textContent=`${notebookEntries.length} / 12 saved checkpoints. Select two to compare.`;
 for(const item of [...notebookEntries].reverse()){
  const card=document.createElement('article');card.className='notebook-entry';card.dataset.entry=item.id;
  const heading=document.createElement('h3');heading.textContent=item.name;
  const description=document.createElement('p');description.textContent=`Year ${item.summary.years.toFixed(2)} · ${item.summary.planets} worlds · ${item.summary.moons} moons · ${item.summary.collisions} mergers · ${item.summary.grazes} grazes · ${item.summary.disruptions} disruptions`;
  const checkLabel=document.createElement('label');checkLabel.className='check-label';const check=document.createElement('input');check.type='checkbox';check.checked=comparisonIds.includes(item.id);check.setAttribute('aria-label',`Compare ${item.name}`);
  check.onchange=()=>{if(check.checked){if(comparisonIds.length===2){check.checked=false;$('notebook-status').textContent='Choose two checkpoints. Deselect one to change the comparison.';return;}comparisonIds.push(item.id);}else comparisonIds=comparisonIds.filter(id=>id!==item.id);renderComparison();};checkLabel.append(check,document.createTextNode('Compare'));
  const actions=document.createElement('div');actions.className='notebook-actions';
  const open=document.createElement('button');open.textContent='Open / fork';open.onclick=()=>{
   $('notebook-dialog').close();confirmReset(async()=>{const data=parseReplay(item.replay);if(data.config.mission!==null&&!canPlay(profile,data.config.mission))throw new Error('Complete the earlier challenges before opening this checkpoint.');saveEpoch++;await send('import',{replay:item.replay});renderer?.fit();$('checkpoint-name').value=(item.name+' variation').slice(0,64);await autosave();toast('Checkpoint opened, paused. The saved original stays in your notebook.');});
  };
  const save=document.createElement('button');save.textContent='Export';save.onclick=()=>download(item.replay,'celestial-'+(item.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,50)||'checkpoint')+'.json');
  const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=()=>{try{const next=notebookEntries.filter(value=>value.id!==item.id);writeNotebook(storage,next);notebookEntries=next;showNotebook();}catch(error){$('notebook-status').textContent=error.message;}};
  actions.append(open,save,remove);card.append(heading,description,checkLabel,actions);$('notebook-list').append(card);
 }
 renderComparison();updateHistory();
}
let comparisonRequest=0,comparisonSelection='';
$('comparison-tick').onchange=()=>renderComparison();
async function renderComparison(){
 const request=++comparisonRequest;
 const selected=comparisonIds.map(id=>notebookEntries.find(item=>item.id===id));$('comparison-wrap').hidden=selected.length!==2;if(selected.length!==2)return;
 const [a,b]=selected,head=$('comparison').querySelector('thead'),body=$('comparison').querySelector('tbody');head.replaceChildren();body.replaceChildren();const row=document.createElement('tr');
 for(const title of ['Outcome',a.name,b.name,'Change']){const cell=document.createElement('th');cell.scope='col';cell.textContent=title;row.append(cell);}head.append(row);
 const number=value=>value.toLocaleString(undefined,{maximumFractionDigits:2});
 $('comparison-age').textContent='Reconstructing both experiments at the same age…';
 const key=comparisonIds.join(':');const end=Math.min(parseReplay(a.replay).end_tick,parseReplay(b.replay).end_tick);$('comparison-tick').max=String(end);if(key!==comparisonSelection){comparisonSelection=key;$('comparison-tick').value=String(end);}
 try{const result=await send('compare',{replays:[a.replay,b.replay],tick:Number($('comparison-tick').value)});if(request!==comparisonRequest)return;
  const left=parseReplay(a.replay),right=parseReplay(b.replay),changed=left.commands.filter((c,i)=>JSON.stringify(c)!==JSON.stringify(right.commands[i])).length+Math.max(0,right.commands.length-left.commands.length);
  $('comparison-age').textContent=`Both at year ${(result.tick/512).toFixed(2)} · ${changed} differing recorded edits${JSON.stringify(left.config)!==JSON.stringify(right.config)?' · starting conditions differ':''}.`;
  const differences=experimentDifferences(left,right,result.tick);$('comparison-edits').replaceChildren(...(differences.length?differences:['No recorded conditions differ by this age.']).map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
  for(const metric of compare({summary:summarize(result.states[0])},{summary:summarize(result.states[1])})){const row=document.createElement('tr');for(const [index,value] of [metric.label,number(metric.before),number(metric.after),(metric.change>0?'+':'')+number(metric.change)].entries()){const cell=document.createElement(index===0?'th':'td');if(index===0)cell.scope='row';cell.textContent=value;row.append(cell);}body.append(row);}
 }catch(error){if(request===comparisonRequest)$('comparison-age').textContent=error.message;}
}
$('notebook').onclick=async()=>{try{await send('play',{value:false});showNotebook();$('notebook-dialog').showModal();}catch(error){toast(error.message);}};
$('close-notebook').onclick=()=>$('notebook-dialog').close();
$('checkpoint-form').onsubmit=async event=>{event.preventDefault();$('save-checkpoint').disabled=true;try{await send('play',{value:false});const {replay}=await send('export');const next=[...notebookEntries,entry($('checkpoint-name').value,replay,state)];writeNotebook(storage,next);notebookEntries=next;showNotebook();$('notebook-status').textContent='Checkpoint saved. Open it later to branch without changing this original.';}catch(error){$('notebook-status').textContent=error.message;}finally{$('save-checkpoint').disabled=false;}};
$('history-tick').oninput=()=>{$('history-time').textContent=`Year ${(Number($('history-tick').value)/512).toFixed(2)} of ${((state?.timeline_end||0)/512).toFixed(2)}`;};
async function reviewHistory(tick){$('history-tick').disabled=true;try{await send('seek',{tick});$('history-tick').value=String(state.tick);$('history-note').textContent='Reviewing the recorded run. Return to latest to continue it. Running or editing saves the original automatically before branching.';}catch(error){$('notebook-status').textContent=error.message;throw error;}finally{updateHistory();}}
$('history-tick').onchange=()=>reviewHistory(Number($('history-tick').value)).catch(()=>{});
$('history-latest').onclick=()=>reviewHistory(state.timeline_end).catch(()=>{});
const observatory=new Observatory({send,seek:reviewHistory,getState:()=>state,getSelected:()=>selectedBody,selectEvent:event=>{selectedBody=event.body;if(renderer){renderer.focusEvent(event);renderer.encounterOverlay=event.impact||null;}inspect();}});
const challengeGuide=new ChallengeGuide({send,getState:()=>state});
const generatorControls=new GeneratorControls({storage,getState:()=>state,
 create:({seed,command,play})=>confirmReset(async()=>{if(await reset(null,{seed})){await send('command',{command});generatorControls.record(state.config,command,state.rules_version);renderer?.fit();if(command.style==='resonance'){await send('speed',{value:16});$('resonance-panel').open=true;}await autosave();if(play)await send('play',{value:true});toast('Your seeded universe is ready. Watch an encounter, then try changing one condition.');}}),
 repeat:({config,command,version})=>confirmReset(async()=>{saveEpoch++;await send('import',{replay:JSON.stringify({version,config,commands:[{tick:0,command}],end_tick:0})});renderer?.fit();await autosave();await send('play',{value:true});toast('The same seed and conditions are running again.');}),
 save:()=>{$('checkpoint-name').value=`Seed ${state.config.seed} · year ${state.status.years.toFixed(2)}`;$('notebook').click();}
});

$('prepare-device').onclick=async()=>{try{
 await send('play',{value:false});const original=await send('original');notebookEntries=preserveOriginal(storage,notebookEntries,original.replay,original.snapshot);
 deviceScenarioName=$('device-scenario').value;saveEpoch++;await send('import',{replay:JSON.stringify(deviceScenario(deviceScenarioName))});await send('speed',{value:.25});renderer?.fit();
 if(deviceScenarioName==='moons'){selectedBody=1;renderer?.focus(1);inspect();}
 $('device-status').textContent='Scenario ready at ¼ speed. Your original is in the notebook. Start recording, then pan, zoom and open Observe while it runs.';await autosave();
 }catch(error){$('device-status').textContent=error.message;}};
$('record-device').onclick=async()=>{try{await send('play',{value:true});deviceGeneration=state.generation;
 const {replay}=await send('export');deviceRecording=new DeviceRecording({scenario:deviceScenarioName,replay:JSON.parse(replay),browser:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio},quality:{...viewSettings},dpr:renderer?.dpr,created:new Date().toISOString()});
 $('device-status').textContent='Recording five minutes of visible running time. Pauses and hidden time are excluded. Download early for a partial report.';$('download-device').disabled=false;$('display-dialog').close();toast('Five-minute recording started. Navigate and open charts as you watch.');
 }catch(error){$('device-status').textContent=error.message;}};
$('download-device').onclick=()=>{if(deviceRecording)download(JSON.stringify(deviceRecording.report(),null,2),'celestial-device-performance.json');};

$('watch-orbit').onclick=async()=>{try{const orbit=(state.moon_orbits.find(([id])=>id===selectedBody)||state.orbits.find(([id])=>id===selectedBody))?.[1];const speed=orbitalWatchSpeed(orbit?.period_years);await send('speed',{value:speed});renderer?.focus(selectedBody);await send('play',{value:true});toast(`Following this orbit at ${speed}×. Use Time to adjust the pace.`);}catch(error){toast(error.message);}};
