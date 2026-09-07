import {BASE_TICKS_PER_SECOND} from './playback.js';
// Account for time spent computing before deciding to sleep again. A ready tick
// uses a MessageChannel task so nested setTimeout's minimum delay cannot throttle
// a large system that needs most of the CPU budget.
export function workDelay(playing,debt,speed,workMs){
 if(!playing)return 16;
 const rate=BASE_TICKS_PER_SECOND*speed,available=debt+Math.max(0,workMs)*rate/1000;
 return available>=1?0:Math.min(16,Math.max(1,Math.ceil((1-available)*1000/rate)));
}
