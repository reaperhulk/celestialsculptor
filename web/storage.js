import {normalizeProfile} from './progression.js';
export const SAVE_KEY='celestial-sculptor.experiment.v1';
export const BACKUP_KEY=SAVE_KEY+'.backup';
const writtenPrimaries=new WeakMap();
export function deviceStorage(){try{return globalThis.localStorage;}catch{return null;}}
export function parseReplay(text){
  if(typeof text!=='string'||text.length>512_000)throw new Error('Choose an experiment smaller than 512 KB.');
  let value;try{value=JSON.parse(text);}catch{throw new Error('This file is not valid JSON.');}
  if(![1,2,3].includes(value?.version)||!value.config||!Array.isArray(value.commands)||value.commands.length>2048||!Number.isInteger(value.end_tick)||value.end_tick<0||value.end_tick>307200)throw new Error('This experiment format is unsupported or exceeds the 600-year limit.');
  return value;
}
export function saveExperiment(storage,text){
  try{
    parseReplay(text);
    const previous=storage.getItem(SAVE_KEY);
    if(previous&&previous!==text&&writtenPrimaries.get(storage)===previous)try{parseReplay(previous);storage.setItem(BACKUP_KEY,previous);}catch{/* Preserve a valid backup when the primary is corrupt or quota is tight. */}
    storage.setItem(SAVE_KEY,text);writtenPrimaries.set(storage,text);return true;
  }catch{return false;}
}
export function savedExperiments(storage){
  const saved=[];
  for(const key of [SAVE_KEY,BACKUP_KEY])try{const text=storage.getItem(key);if(text){parseReplay(text);saved.push(text);}}catch{/* Try the previous snapshot. */}
  return saved;
}
export function archiveExperiment(replay,profile){return JSON.stringify({format:'celestial-archive',version:1,profile:normalizeProfile(profile),replay:parseReplay(replay)});}
export function parseArchive(text){
  if(typeof text!=='string'||text.length>600_000)throw new Error('Choose a backup smaller than 600 KB.');
  let value;try{value=JSON.parse(text);}catch{throw new Error('This file is not valid JSON.');}
  if(value?.format!=='celestial-archive')return {replay:JSON.stringify(parseReplay(text)),profile:null};
  if(value.version!==1)throw new Error('This backup version is unsupported.');
  const replay=JSON.stringify(value.replay);parseReplay(replay);
  return {replay,profile:normalizeProfile(value.profile)};
}
