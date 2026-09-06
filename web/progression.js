export const PROFILE_KEY='celestial-sculptor.profile.v1';
export function normalizeProfile(value){
  if(value?.version!==1||!Array.isArray(value.completed)||value.completed.length>100)return {version:1,completed:[]};
  const earned=new Set(value.completed.filter(m=>Number.isInteger(m)&&m>=0&&m<10)),completed=[];
  for(let mission=0;mission<10&&earned.has(mission);mission++)completed.push(mission);
  return {version:1,completed};
}
export function canPlay(profile,mission){
  return Number.isInteger(mission)&&mission>=0&&mission<10&&Array.from({length:mission},(_,i)=>i).every(i=>profile.completed.includes(i));
}
export function nextMission(profile){return Math.min(9,Array.from({length:10},(_,i)=>i).find(i=>!profile.completed.includes(i))??9);}
export function award(profile,mission){
  if(!canPlay(profile,mission))return profile;
  return normalizeProfile({version:1,completed:[...profile.completed,mission]});
}
export function readProfile(storage){try{const text=storage.getItem(PROFILE_KEY);return normalizeProfile(text?.length>4096?null:JSON.parse(text));}catch{return normalizeProfile(null);}}
export function writeProfile(storage,profile){try{storage.setItem(PROFILE_KEY,JSON.stringify(profile));return true;}catch{return false;}}
