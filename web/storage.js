export const SAVE_KEY='celestial-sculptor.experiment.v1';
export const BACKUP_KEY=SAVE_KEY+'.backup';
export function deviceStorage(){try{return globalThis.localStorage;}catch{return null;}}
export function parseReplay(text){
  if(typeof text!=='string'||text.length>512_000)throw new Error('Choose an experiment smaller than 512 KB.');
  let value;try{value=JSON.parse(text);}catch{throw new Error('This file is not valid JSON.');}
  if(value?.version!==1||!value.config||!Array.isArray(value.commands)||value.commands.length>2048||!Number.isInteger(value.end_tick)||value.end_tick<0||value.end_tick>307200)throw new Error('This experiment format is unsupported or exceeds the 600-year limit.');
  return value;
}
export function saveExperiment(storage,text){
  try{
    parseReplay(text);
    const previous=storage.getItem(SAVE_KEY);
    if(previous&&previous!==text)storage.setItem(BACKUP_KEY,previous);
    storage.setItem(SAVE_KEY,text);return true;
  }catch{return false;}
}
export function savedExperiments(storage){
  const saved=[];
  for(const key of [SAVE_KEY,BACKUP_KEY])try{const text=storage.getItem(key);if(text){parseReplay(text);saved.push(text);}}catch{/* Try the previous snapshot. */}
  return saved;
}
