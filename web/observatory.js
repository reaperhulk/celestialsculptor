import {quantity} from './readings.js';
const NS='http://www.w3.org/2000/svg';
export function series(history,id,metric,pair=''){
 if(metric.startsWith('population_'))return (history.population||[]).map(p=>({tick:p.tick,parent:'system',value:metric==='population_count'?p.count:metric==='population_mass'?p.mass/3.003e-6:p.mean_eccentricity}));
 return history.frames.filter(f=>['angle','ratio'].includes(metric)||f.body_sample!==false).map(frame=>{
  const body=frame.bodies.find(b=>b.id===Number(id));
  const resonance=frame.resonances.find(r=>`${r.inner}:${r.outer}`===pair);
  const value=metric==='angle'?(resonance?.angle??NaN)*180/Math.PI:metric==='ratio'?resonance?.ratio:metric==='mass'?body?.mass/3.003e-6:body?.[metric];
  return {tick:frame.tick,value:Number.isFinite(value)?value:null,parent:['angle','ratio'].includes(metric)?pair:body?.parent};
 });
}
export function chartGeometry(samples,metric,domain=null){
 const values=samples.filter(p=>p.value!==null);if(values.length<2)return null;
 const first=domain?.first??samples[0].tick,last=domain?.last??samples.at(-1).tick;if(last===first)return null;
 let min=domain?.min??Math.min(...values.map(p=>p.value)),max=domain?.max??Math.max(...values.map(p=>p.value));
 if(max-min<1e-8){const padding=Math.max(.01,Math.abs(max)*.01);min-=padding;max+=padding;}
 const paths=[];let current=[],previous=null;
 for(const p of samples){
  if(p.value===null||previous&&(p.parent!==previous.parent||(metric==='angle'&&Math.abs(p.value-previous.value)>180))){if(current.length)paths.push(current.join(' '));current=[];}
  if(p.value!==null){const x=64+(p.tick-first)/(last-first)*266,y=30+(max-p.value)/(max-min)*80;current.push(`${current.length?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`);previous=p;}else previous=null;
 }
 if(current.length)paths.push(current.join(' '));return {paths,min,max,first,last,latest:values.at(-1).value};
}
function svgNode(name,attributes,text){const node=document.createElementNS(NS,name);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;}
export function drawChart(svg,geometry,unit){
 svg.replaceChildren();svg.setAttribute('viewBox','0 0 340 146');svg.setAttribute('aria-label',`${unit}: no observations yet`);
 if(!geometry){svg.append(svgNode('text',{x:170,y:72,'text-anchor':'middle',fill:'#b1c1d1','font-size':16},'Waiting for observations'));return;}
 svg.append(svgNode('text',{x:64,y:16,fill:'#d6e2ed','font-size':16},unit));
 for(const [y,value] of [[30,geometry.max],[110,geometry.min]]){svg.append(svgNode('line',{x1:64,x2:330,y1:y,y2:y,stroke:'#35475a'}),svgNode('text',{x:60,y:y+5,'text-anchor':'end',fill:'#b1c1d1','font-size':16},quantity(value)));}
 for(const d of geometry.paths)svg.append(svgNode('path',{d,fill:'none',stroke:'#91dcca','stroke-width':2}));
 svg.append(svgNode('text',{x:64,y:136,fill:'#b1c1d1','font-size':16},`${quantity(geometry.first/512)} yr`),svgNode('text',{x:330,y:136,'text-anchor':'end',fill:'#b1c1d1','font-size':16},`${quantity(geometry.last/512)} yr`));
 svg.setAttribute('aria-label',`${unit} over time, latest ${quantity(geometry.latest)}, range ${quantity(geometry.min)} to ${quantity(geometry.max)}`);
}
export function encounterSignature(state,events){return JSON.stringify([state.generation,events,events.map(e=>e.tick+(e.impact?1:0)>state.timeline_end)]);}
export class Observatory {
 constructor({send,seek,getState,getSelected,selectEvent,trackHistory}){
  this.send=send;this.seek=seek;this.getState=getState;this.getSelected=getSelected;this.selectEvent=selectEvent;this.trackHistory=trackHistory;this.history={frames:[],events:[]};this.busy=false;this.previousBody=null;
  this.$=id=>document.getElementById(id);
  for(const id of ['history-body','history-metric','history-pair'])this.$(id).onchange=()=>{this.stamp=null;this.refresh(this.previousBody);};
  const pin=this.$('keep-history');
  pin.onclick=async()=>{try{const id=Number(this.$('history-body').value);await this.trackHistory({type:'track_history',id,enabled:!this.history.pinned_ids?.includes(id)});this.stamp=null;await this.refresh();}catch(e){this.$('history-caption').textContent=e.message;}};
  this.$('analysis-tools').ontoggle=()=>{if(this.$('analysis-tools').open)this.refresh();};
  this.$('encounter-policy').onchange=()=>this.send('event_policy',{value:this.$('encounter-policy').value}).catch(e=>this.$('history-caption').textContent=e.message);
  setInterval(()=>{if(this.$('analysis-tools').open&&!document.hidden)this.refresh();},1000);
 }
 async refresh(selected=this.getSelected()){
  if(this.busy||!this.getState())return;const current=this.getState(),stamp=`${current.generation}:${current.observation_stamp}`;if(stamp===this.stamp&&selected===this.previousBody)return;this.busy=true;
  try{const generation=this.getState().generation;const [inner,outer]=this.$('history-pair').value.split(':').map(Number);const body=selected!==this.previousBody&&selected?selected:Number(this.$('history-body').value);const {history}=await this.send('observations',{filter:{body,inner,outer}});if(generation!==this.getState().generation)return;this.history=history;
   const ids=history.body_ids;const pairs=history.pairs;
   for(const [id,values,label] of [['history-body',ids,v=>`World ${v}`],['history-pair',pairs,v=>`Worlds ${v.replace(':',' & ')}`]]){
    const element=this.$(id),value=element.value;if([...element.options].map(o=>o.value).join(',')!==values.join(',')){element.replaceChildren(...values.map(v=>new Option(label(v),String(v))));if(values.map(String).includes(value))element.value=value;}
   }
   if(selected&&selected!==this.previousBody&&ids.includes(selected)){this.$('history-body').value=String(selected);this.previousBody=selected;}
   this.previousBody=selected;this.stamp=stamp;this.draw();this.events();
  }catch(error){this.$('history-caption').textContent=error.message;}finally{this.busy=false;}
 }
 draw(){
  this.$('keep-history').textContent=this.history.pinned_ids?.includes(Number(this.$('history-body').value))?'Release detailed history':'Keep detailed history';
  const metric=this.$('history-metric').value,isPair=['angle','ratio'].includes(metric),population=metric.startsWith('population_');this.$('history-pair').hidden=!isPair;this.$('history-body').hidden=isPair||population;this.$('keep-history').hidden=isPair||population;
  const points=series(this.history,this.$('history-body').value,metric,this.$('history-pair').value),geometry=chartGeometry(points,metric);
  const unit={population_count:'Worlds',population_mass:'Retained Earth masses',population_eccentricity:'Mass-weighted eccentricity',mass:'Earth masses',axis:'Orbital size · AU',eccentricity:'Eccentricity',period:'Period · years',angle:'Resonant angle · degrees',ratio:'Period ratio'}[metric];
  drawChart(this.$('history-chart'),geometry,unit);
  this.$('history-caption').textContent=geometry?`${unit} · latest ${quantity(geometry.latest)}. ${population?'Whole-population summaries have their own bounded sampling schedule.':isPair?'A near ratio is a candidate; bounded, reversing angles provide evidence of resonance.':`Gaps mark missing observations or a change of host. ${this.history.detail?'Detailed recent history is retained for this world.':'This world uses coarse system samples.'}`}`:'Run the system to collect observations. Resonance graphs need a neighboring candidate pair.';
 }
 events(){
  const state=this.getState(),events=this.history.events.filter(e=>!['placed','spin','nudge','seed','migration'].includes(e.kind)).slice(-40).reverse();
  for(const e of this.history.encounters||[])events.push({kind:'flyby',tick:e.end_tick,body:e.bodies[0],text:`Worlds ${e.bodies.join(' & ')} passed at a sampled minimum of ${quantity(e.distance)} AU.`,flyby:e});events.sort((a,b)=>b.tick-a.tick);
  const signature=encounterSignature(state,events);if(signature===this.signature)return;this.signature=signature;
  const list=this.$('encounter-list');list.replaceChildren();
  if(!events.length){const p=document.createElement('li');p.textContent='Major encounters will appear here.';list.append(p);}
  for(const event of events){const li=document.createElement('li'),text=document.createElement('p');text.textContent=`${quantity(event.tick/512)} yr · ${event.text}`;li.append(text);
   if(event.flyby){const detail=document.createElement('p');detail.className='impact-detail';detail.textContent=event.flyby.before.map((before,i)=>`World ${event.flyby.bodies[i]}: a ${quantity(before[0])} → ${quantity(event.flyby.after[i][0])} AU; e ${quantity(before[1])} → ${quantity(event.flyby.after[i][1])}`).join(' · ');li.append(detail);}
   if(event.impact){const detail=document.createElement('p'),hit=event.impact;detail.className='impact-detail';detail.textContent=`${hit.outcome||'merge'} · ${quantity(hit.mass/3.003e-6)} Earth masses retained · radius ${quantity(hit.radius_before)} → ${quantity(hit.radius_after)} AU · e ${quantity(hit.eccentricity_before)} → ${quantity(hit.eccentricity_after)}`;li.append(detail);}
   for(const [label,tick] of [['Before',event.flyby?.start_tick??Math.max(0,event.tick-(event.impact?0:1))],['After',event.tick+(event.impact?1:0)]]){
    const button=document.createElement('button');button.textContent=label;button.disabled=tick>state.timeline_end;button.onclick=async()=>{try{await this.seek(tick);this.selectEvent(event);this.$('history-caption').textContent=event.impact?'Impact orbits: gold before, blue after. Run or edit here to branch; the original is saved automatically.':'Reviewing this encounter. Run or edit to branch; the original is saved automatically.';}catch(e){this.$('history-caption').textContent=e.message;}};li.append(button);
   }
   list.append(li);
  }
 }
}
