// Restart caches are local accelerators, never the portable source of truth.
// Match the actual WASM asset hash, checksum the payload, and fall back to replay.
const MAX_BYTES=48_000_000,MAX_ENTRIES=12,INTERVAL=2048;
const bytes=value=>new TextEncoder().encode(value);
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function matchesCheckpoint(meta,replay,provenance){
 const saved=meta.replay;
 return meta.provenance===provenance&&saved?.config?.mission===null&&Array.isArray(saved.commands)&&Number.isInteger(saved.end_tick)&&saved.end_tick>=0
  &&(replay.physics===undefined||saved.physics===replay.physics)
  &&JSON.stringify(saved.config)===JSON.stringify(replay.config)&&saved.end_tick<=replay.end_tick
  &&saved.commands.length<=replay.commands.length
  &&saved.commands.every((c,i)=>JSON.stringify(c)===JSON.stringify(replay.commands[i]))
  &&(replay.commands[saved.commands.length]?.tick??Infinity)>=saved.end_tick;
}
function retained(entries){
 let total=0,count=0;return entries.sort((a,b)=>b.saved-a.saved).filter(e=>{if(count>=MAX_ENTRIES||e.bytes>MAX_BYTES-total)return false;total+=e.bytes;count++;return true;});
}
export class MemoryCheckpointStore {
 constructor(){this.records=new Map();}
 async list(){return [...this.records.values()].map(({text,...meta})=>meta);}
 async get(key){return this.records.get(key)?.text;}
 async put(meta,text){this.records.set(meta.key,{...meta,text});const keep=new Set(retained([...this.records.values()]).map(e=>e.key));for(const key of this.records.keys())if(!keep.has(key))this.records.delete(key);}
 async remove(key){this.records.delete(key);}
}
export class IndexedCheckpointStore {
 constructor(indexedDB=globalThis.indexedDB){this.indexedDB=indexedDB;this.opening=null;}
 open(){
  return this.opening??=new Promise((resolve,reject)=>{
   const request=this.indexedDB.open('celestial-sculptor.checkpoints',1);
   request.onupgradeneeded=()=>{request.result.createObjectStore('states');request.result.createObjectStore('index',{keyPath:'key'});};
   request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.opening=null;};resolve(db);};
   request.onerror=()=>{this.opening=null;reject(request.error);};
   request.onblocked=()=>reject(new Error('Checkpoint storage is busy'));
  });
 }
 async read(store,key){const db=await this.open();return new Promise((resolve,reject)=>{const request=db.transaction(store).objectStore(store)[key===undefined?'getAll':'get'](key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
 list(){return this.read('index');}
 get(key){return this.read('states',key);}
 async put(meta,text){
  const db=await this.open();return new Promise((resolve,reject)=>{
   const tx=db.transaction(['states','index'],'readwrite'),index=tx.objectStore('index'),states=tx.objectStore('states'),request=index.getAll();
   request.onsuccess=()=>{const all=[...request.result.filter(e=>e.key!==meta.key),meta],keep=new Set(retained(all).map(e=>e.key));for(const old of all)if(!keep.has(old.key)){index.delete(old.key);states.delete(old.key);}if(keep.has(meta.key)){index.put(meta);states.put(text,meta.key);}};
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
 }
 async remove(key){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction(['states','index'],'readwrite');tx.objectStore('index').delete(key);tx.objectStore('states').delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
}
export class CheckpointCache {
 constructor({provenance,store=new MemoryCheckpointStore()}={}){this.provenance=provenance;this.store=store;this.pending=null;this.last=null;this.lastTick=-Infinity;this.status='ready';}
 capture(sim,{force=false}={}){
  if(!this.provenance||this.pending||!sim.checkpoint)return this.pending??Promise.resolve(false);
  const replay=JSON.parse(sim.export_replay());if(replay.config.mission!==null)return Promise.resolve(false);
  const branch=JSON.stringify([replay.config,replay.commands]);
  if(!force&&branch===this.last&&replay.end_tick>=this.lastTick&&replay.end_tick-this.lastTick<INTERVAL)return Promise.resolve(false);
  let text;try{text=sim.checkpoint();}catch{return Promise.resolve(false);}
  this.last=branch;this.lastTick=replay.end_tick;
  this.pending=(async()=>{try{
   const hash=await digest(text),key=await digest(this.provenance+JSON.stringify(replay));
   await this.store.put({key,provenance:this.provenance,replay,digest:hash,bytes:bytes(text).length,saved:Date.now()},text);this.status='saved';return true;
  }catch{this.status='unavailable';return false;}finally{this.pending=null;}})();return this.pending;
 }
 async nearest(replay){
  try{
   await this.pending;
   const candidates=(await this.store.list()).filter(e=>matchesCheckpoint(e,replay,this.provenance)).sort((a,b)=>b.replay.end_tick-a.replay.end_tick||b.replay.commands.length-a.replay.commands.length);
   for(const meta of candidates){const text=await this.store.get(meta.key);if(typeof text==='string'&&bytes(text).length===meta.bytes&&await digest(text)===meta.digest)return {text,tick:meta.replay.end_tick};await this.store.remove(meta.key);}
  }catch{this.status='unavailable';}
  return null;
 }
}
