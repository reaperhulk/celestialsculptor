import {series,chartGeometry,drawChart} from './observatory.js';
import {quantity} from './readings.js';
export function variations(replay,field,values){
 if(replay.config.mission!==null)throw new Error('Parameter experiments use sandbox checkpoints.');
 if(!Array.isArray(values)||values.length<1||values.length>3||values.some(v=>!Number.isFinite(v)))throw new Error('Enter one to three finite values, separated by commas.');
 const index=replay.commands.findLastIndex(c=>Object.hasOwn(c.command,field));
 if(field!=='seed'&&(!['speed','radius','chaos','disorder','timescale'].includes(field)||index<0))throw new Error(`This checkpoint has no recorded ${field} condition.`);
 return values.map(value=>{const copy=structuredClone(replay);if(field==='seed'){if(!Number.isInteger(value)||value<0||value>4294967295)throw new Error('Seeds must be whole numbers from 0 to 4294967295.');copy.config.seed=value;}else copy.commands[index].command[field]=value;return {label:`${field} ${value}`,replay:JSON.stringify(copy),edit:index};});
}
export function lineage(history,id){
 const ancestors=new Set([Number(id)]),evidence=[];
 for(const event of [...history.events].reverse()){
  const hit=event.impact;if(!hit)continue;
  if(ancestors.has(event.body)||hit.remnants?.some(id=>ancestors.has(id))){ancestors.add(event.body);if(hit.consumed!==undefined&&hit.consumed!==null)ancestors.add(hit.consumed);evidence.push(`Year ${(event.tick/512).toFixed(2)}: ${event.text}`);}
 }
 return {ancestors:[...ancestors].sort((a,b)=>a-b),evidence:evidence.reverse()};
}
export function orbitPath(orbit){
 if(!orbit?.bound)return [];const a=(orbit.apoapsis+orbit.periapsis)/2,e=orbit.eccentricity,angle=orbit.periapsis_angle;
 return Array.from({length:129},(_,i)=>{const t=i*Math.PI/64,r=a*(1-e*e)/(1+e*Math.cos(t));return [r*Math.cos(t+angle),r*Math.sin(t+angle)];});
}
const ns='http://www.w3.org/2000/svg';
const node=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
export class ExperimentLab {
 constructor({container,rerender}){
  this.wrap=node('section');this.wrap.className='experiment-lab';this.wrap.append(node('h3','Compare individual worlds'));
  this.selects=[0,1].map(i=>{const label=node('label',i?'Second experiment world':'First experiment world'),select=node('select');select.id=`comparison-body-${i}`;label.htmlFor=select.id;select.onchange=rerender;this.wrap.append(label,select);return select;});
  const label=node('label','History reading');this.metric=node('select');this.metric.id='comparison-metric';label.htmlFor=this.metric.id;
  for(const [value,text] of [['axis','Orbital size'],['eccentricity','Eccentricity'],['angle','Resonant angle'],['ratio','Period ratio']])this.metric.add(new Option(text,value));
  this.pairs=[0,1].map(i=>{const select=node('select');select.id=`comparison-pair-${i}`;select.setAttribute('aria-label',`${i?'Second':'First'} experiment resonance pair`);select.onchange=rerender;this.wrap.append(select);return select;});
  this.metric.onchange=()=>this.draw();this.overlay=document.createElementNS(ns,'svg');this.overlay.setAttribute('viewBox','0 0 340 240');this.overlay.setAttribute('role','img');this.overlay.setAttribute('aria-label','Star-relative orbit overlay at the shared age');
  this.charts=[0,1].map(()=>{const svg=document.createElementNS(ns,'svg');svg.setAttribute('role','img');return svg;});this.notes=node('p');this.origins=node('p');this.wrap.append(label,this.metric,this.overlay,...this.charts,this.notes,this.origins);container.append(this.wrap);
 }
 filters(){return this.selects.map((s,i)=>{const [inner,outer]=this.pairs[i].value.split(':').map(Number);return {body:Number(s.value),inner:inner||0,outer:outer||0};});}
 update(result,names){this.result=result;this.names=names;
  for(let i=0;i<2;i++){for(const [select,values,label] of [[this.selects[i],result.histories[i].body_ids,id=>`${names[i]} · world ${id}`],[this.pairs[i],result.histories[i].pairs,id=>`Pair ${id.replace(':',' & ')}`]]){const value=select.value;select.replaceChildren(...values.map(id=>new Option(label(id),String(id))));if(values.map(String).includes(value))select.value=value;}}
  this.draw();
 }
 draw(){if(!this.result)return;const {states,histories}=this.result,metric=this.metric.value,colors=['#f5ca7e','#8ebffc'];this.pairs.forEach(s=>s.hidden=!['angle','ratio'].includes(metric));
  const paths=states.map((state,i)=>orbitPath(state.orbits.find(([id])=>id===Number(this.selects[i].value))?.[1]));let radius=0.1;for(const path of paths)for(const [x,y] of path)radius=Math.max(radius,Math.abs(x),Math.abs(y));
  states.forEach((state,i)=>{const b=state.bodies.find(b=>b.id===Number(this.selects[i].value)),star=state.bodies[0];if(b&&star)radius=Math.max(radius,Math.abs(b.pos.x-star.pos.x),Math.abs(b.pos.y-star.pos.y));});
  this.overlay.replaceChildren();const star=document.createElementNS(ns,'circle');for(const [k,v] of Object.entries({cx:170,cy:120,r:4,fill:'#fff0bd'}))star.setAttribute(k,v);this.overlay.append(star);
  paths.forEach((points,i)=>{const p=document.createElementNS(ns,'path');p.setAttribute('d',points.map(([x,y],j)=>`${j?'L':'M'}${170+x/radius*105},${120-y/radius*105}`).join(' '));p.setAttribute('stroke',colors[i]);p.setAttribute('fill','none');this.overlay.append(p);});
  states.forEach((state,i)=>{const body=state.bodies.find(b=>b.id===Number(this.selects[i].value)),star=state.bodies.find(b=>b.id===0);if(!body||!star)return;const point=document.createElementNS(ns,'circle');for(const [key,value] of Object.entries({cx:170+(body.pos.x-star.pos.x)/radius*105,cy:120-(body.pos.y-star.pos.y)/radius*105,r:3,fill:colors[i]}))point.setAttribute(key,value);this.overlay.append(point);});
  const samples=histories.map((h,i)=>series(h,this.selects[i].value,metric,this.pairs[i].value)),all=samples.flat().filter(p=>p.value!==null);
  // Give both histories the same coordinates and vertical scale.
  const common=chartGeometry(all.sort((a,b)=>a.tick-b.tick),metric);
  histories.forEach((h,i)=>{const geometry=chartGeometry(samples[i],metric,common);drawChart(this.charts[i],geometry,`${this.names[i]} · ${metric==='axis'?'AU':metric==='angle'?'degrees':metric}`);for(const p of this.charts[i].querySelectorAll('path'))p.setAttribute('stroke',colors[i]);});
  this.notes.textContent=`Gold: ${this.names[0]}. Blue: ${this.names[1]}. Both at year ${(this.result.tick/512).toFixed(2)}; orbit extent ±${quantity(radius)} AU. Orbit curves are instantaneous star-relative osculating elements; moon-relative histories use their host. IDs identify each run separately; choose the corresponding bodies.`;
  this.origins.textContent=histories.map((h,i)=>{const l=lineage(h,this.selects[i].value);return `${this.names[i]} ancestry in the retained journal: ${l.ancestors.join(', ')}. ${l.evidence.slice(-3).join(' ')}`;}).join(' ');
 }
}
