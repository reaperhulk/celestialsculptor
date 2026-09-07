import {quantity} from './readings.js';
const NS='http://www.w3.org/2000/svg';
export function series(history,id,metric,pair=''){
 return history.frames.map(frame=>{
  const body=frame.bodies.find(b=>b.id===Number(id));
  const resonance=frame.resonances.find(r=>`${r.inner}:${r.outer}`===pair);
  const value=metric==='angle'?(resonance?.angle??NaN)*180/Math.PI:metric==='ratio'?resonance?.ratio:metric==='mass'?body?.mass/3.003e-6:body?.[metric];
  return {tick:frame.tick,value:Number.isFinite(value)?value:null,parent:body?.parent};
 });
}
export function chartGeometry(samples,metric){
 const values=samples.filter(p=>p.value!==null);if(values.length<2)return null;
 const first=samples[0].tick,last=samples.at(-1).tick;if(last===first)return null;
 let min=Math.min(...values.map(p=>p.value)),max=Math.max(...values.map(p=>p.value));
 if(max-min<1e-8){const padding=Math.max(.01,Math.abs(max)*.01);min-=padding;max+=padding;}
 const paths=[];let current=[],previous=null;
 for(const p of samples){
  if(p.value===null||previous&&(p.parent!==previous.parent||(metric==='angle'&&Math.abs(p.value-previous.value)>180))){if(current.length)paths.push(current.join(' '));current=[];}
  if(p.value!==null){const x=48+(p.tick-first)/(last-first)*282,y=12+(max-p.value)/(max-min)*84;current.push(`${current.length?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`);previous=p;}else previous=null;
 }
 if(current.length)paths.push(current.join(' '));return {paths,min,max,first,last,latest:values.at(-1).value};
}
function svgNode(name,attributes,text){const node=document.createElementNS(NS,name);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;}
export function drawChart(svg,geometry,unit){
 svg.replaceChildren();if(!geometry)return;
 for(const [y,value] of [[12,geometry.max],[96,geometry.min]]){svg.append(svgNode('line',{x1:48,x2:330,y1:y,y2:y,stroke:'#35475a'}),svgNode('text',{x:44,y:y+4,'text-anchor':'end',fill:'#b1c1d1','font-size':10},quantity(value)));}
 for(const d of geometry.paths)svg.append(svgNode('path',{d,fill:'none',stroke:'#91dcca','stroke-width':2}));
 svg.append(svgNode('text',{x:48,y:116,fill:'#b1c1d1','font-size':10},`${quantity(geometry.first/512)} yr`),svgNode('text',{x:330,y:116,'text-anchor':'end',fill:'#b1c1d1','font-size':10},`${quantity(geometry.last/512)} yr`));
 svg.setAttribute('aria-label',`${unit} over time, latest ${quantity(geometry.latest)}, range ${quantity(geometry.min)} to ${quantity(geometry.max)}`);
}
export class Observatory {
 constructor({send,seek,getState,getSelected,selectEvent}){
  this.send=send;this.seek=seek;this.getState=getState;this.getSelected=getSelected;this.selectEvent=selectEvent;this.history={frames:[],events:[]};this.busy=false;this.previousBody=null;
  this.$=id=>document.getElementById(id);
  for(const id of ['history-body','history-metric','history-pair'])this.$(id).onchange=()=>this.draw();
  this.$('analysis-tools').ontoggle=()=>{if(this.$('analysis-tools').open)this.refresh();};
  this.$('encounter-policy').onchange=()=>this.send('event_policy',{value:this.$('encounter-policy').value}).catch(e=>this.$('history-caption').textContent=e.message);
  setInterval(()=>{if(this.$('analysis-tools').open&&!document.hidden)this.refresh();},1000);
 }
 async refresh(selected=this.getSelected()){
  if(this.busy||!this.getState())return;const current=this.getState(),stamp=`${current.generation}:${current.observation_stamp}`;if(stamp===this.stamp&&selected===this.previousBody)return;this.busy=true;
  try{const generation=this.getState().generation;const {history}=await this.send('observations');if(generation!==this.getState().generation)return;this.history=history;
   const ids=[...new Set(history.frames.flatMap(f=>f.bodies.map(b=>b.id)))];const pairs=[...new Set(history.frames.flatMap(f=>f.resonances.map(r=>`${r.inner}:${r.outer}`)))].slice(-64);
   for(const [id,values,label] of [['history-body',ids,v=>`World ${v}`],['history-pair',pairs,v=>`Worlds ${v.replace(':',' & ')}`]]){
    const element=this.$(id),value=element.value;if([...element.options].map(o=>o.value).join(',')!==values.join(',')){element.replaceChildren(...values.map(v=>new Option(label(v),String(v))));if(values.map(String).includes(value))element.value=value;}
   }
   if(selected&&selected!==this.previousBody&&ids.includes(selected)){this.$('history-body').value=String(selected);this.previousBody=selected;}
   this.stamp=stamp;this.draw();this.events();
  }catch(error){this.$('history-caption').textContent=error.message;}finally{this.busy=false;}
 }
 draw(){
  const metric=this.$('history-metric').value,isPair=['angle','ratio'].includes(metric);this.$('history-pair').hidden=!isPair;this.$('history-body').hidden=isPair;
  const points=series(this.history,this.$('history-body').value,metric,this.$('history-pair').value),geometry=chartGeometry(points,metric);
  const unit={mass:'Earth masses',axis:'Orbital size · AU',eccentricity:'Eccentricity',period:'Period · years',angle:'Resonant angle · degrees',ratio:'Period ratio'}[metric];
  drawChart(this.$('history-chart'),geometry,unit);
  this.$('history-caption').textContent=geometry?`${unit} · latest ${quantity(geometry.latest)}. ${isPair?'A near ratio is a candidate; bounded, reversing angles provide evidence of resonance.':'Gaps mark missing bodies or a change of orbital host.'}`:'Run the system to collect observations. Resonance graphs need a neighboring candidate pair.';
 }
 events(){
  const state=this.getState(),events=this.history.events.filter(e=>!['placed','spin','nudge','seed','migration'].includes(e.kind)).slice(-40).reverse();
  const signature=`${state.generation}:${state.timeline_end}:${events.map(e=>e.id).join(',')}`;if(signature===this.signature)return;this.signature=signature;
  const list=this.$('encounter-list');list.replaceChildren();
  if(!events.length){const p=document.createElement('li');p.textContent='Major encounters will appear here.';list.append(p);}
  for(const event of events){const li=document.createElement('li'),text=document.createElement('p');text.textContent=`${quantity(event.tick/512)} yr · ${event.text}`;li.append(text);
   for(const [label,tick] of [['Before',Math.max(0,event.tick-(event.impact?0:1))],['After',event.tick+(event.impact?1:0)]]){
    const button=document.createElement('button');button.textContent=label;button.disabled=tick>state.timeline_end;button.onclick=async()=>{try{await this.seek(tick);this.selectEvent(event);this.$('history-caption').textContent=event.impact?'Impact orbits: gold before, blue after. Run or edit here to branch; the original is saved automatically.':'Reviewing this encounter. Run or edit to branch; the original is saved automatically.';}catch(e){this.$('history-caption').textContent=e.message;}};li.append(button);
   }
   list.append(li);
  }
 }
}
