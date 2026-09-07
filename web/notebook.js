import {parseReplay} from './storage.js';
const KEY='celestial-sculptor.notebook.v1',MAX_BYTES=1_500_000,MAX_ENTRIES=12;
export const METRICS=[['years','Years'],['planets','Worlds'],['calm','Calm worlds'],['formed','Formed from debris'],['moons','Bound moons'],['habitable','Potential gardens'],['mass','Retained Earth masses'],['collisions','Mergers'],['grazes','Grazes'],['disruptions','Disruptions'],['ejections','Escapes']];
export function summarize(state){const result={...state.status,mass:state.bodies.filter(b=>b.id!==0).reduce((mass,b)=>mass+b.mass/3.003e-6,0)};return Object.fromEntries(METRICS.map(([key])=>[key,Number.isFinite(result[key])?result[key]:0]));}
export function entry(name,replay,state,id=crypto.randomUUID()){
 parseReplay(replay);return {id,name:String(name).trim().slice(0,64)||`Year ${state.status.years.toFixed(2)}`,replay,summary:summarize(state),created:Date.now()};
}
export function readNotebook(storage){
 try{const text=storage.getItem(KEY);if(!text||text.length>MAX_BYTES)return [];const data=JSON.parse(text);if(data.version!==1||!Array.isArray(data.entries)||data.entries.length>MAX_ENTRIES)return [];
 return data.entries.map(value=>({...value,summary:{...value.summary,grazes:value.summary?.grazes??0,disruptions:value.summary?.disruptions??0}})).filter(value=>{try{parseReplay(value.replay);return typeof value.id==='string'&&value.id.length<100&&typeof value.name==='string'&&value.name.length<=64&&value.summary&&METRICS.every(([key])=>Number.isFinite(value.summary[key]));}catch{return false;}});
 }catch{return [];}
}
export function writeNotebook(storage,entries){
 if(entries.length>MAX_ENTRIES)throw new Error('Your notebook has 12 experiments. Export or remove one before saving another.');
 const text=JSON.stringify({version:1,entries});if(text.length>MAX_BYTES)throw new Error('The notebook is full. Export or remove a large experiment.');
 try{storage.setItem(KEY,text);}catch{throw new Error('Device storage could not save the notebook. Export the experiment to keep it.');}
}
export function compare(a,b){return METRICS.map(([key,label])=>({key,label,before:a.summary[key],after:b.summary[key],change:b.summary[key]-a.summary[key]}));}
export function preserveOriginal(storage,entries,replay,state){
 if(entries.some(item=>item.replay===replay))return entries;
 const saved=entry(`Original · year ${state.status.years.toFixed(2)}`,replay,state);
 const next=[...entries,saved];writeNotebook(storage,next);return next;
}
