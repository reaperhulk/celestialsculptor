const KEY='celestial-sculptor.view.v1';
const defaults={showGrid:true,showTrails:true,showPreview:true,reduceMotion:false,maxDpr:2};
export function readViewSettings(storage,reducedMotion=false){
 const settings={...defaults,reduceMotion:reducedMotion};
 try{const text=storage.getItem(KEY);if(!text||text.length>2048)return settings;const value=JSON.parse(text);if(value.version!==1)return settings;
 for(const key of ['showGrid','showTrails','showPreview','reduceMotion'])if(typeof value[key]==='boolean')settings[key]=value[key];
 if([1,2].includes(value.maxDpr))settings.maxDpr=value.maxDpr;
 }catch{/* Device settings are optional. */}return settings;
}
export function writeViewSettings(storage,settings){try{storage.setItem(KEY,JSON.stringify({version:1,...settings}));return true;}catch{return false;}}
