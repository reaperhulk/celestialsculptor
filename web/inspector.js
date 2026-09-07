import {strongestPerturber} from './appearance.js';
import {orbitReading,spinReading,quantity} from './readings.js';

const setText=(node,text)=>{if(node.textContent!==text)node.textContent=text;};
export class Inspector {
 constructor(root){
  const make=(tag,className)=>{const node=document.createElement(tag);if(className)node.className=className;return node;};
  const label=make('span','eyebrow');label.textContent='BODY STATISTICS';
  this.summary=make('p','body-summary');this.rotation=make('p','body-rotation');this.orbitStatus=make('p','body-orbit');this.details=make('details');
  const title=make('summary');title.textContent='Orbit, size & composition';
  this.orbit=make('p');this.orbit.style.whiteSpace='pre-line';this.material=make('p');this.pull=make('p','gravity-reading');
  this.details.append(title,this.orbit,this.material,this.pull);root.replaceChildren(label,this.summary,this.rotation,this.orbitStatus,this.details);
 }
 update(state,body){
  this.rotation.hidden=!body;this.details.hidden=!body;this.orbitStatus.hidden=!body||body.id===0;
  if(!body){setText(this.summary,'Select a world in the view or body list.');return;}
  setText(this.summary,body.id===0?`The star · ${quantity(body.mass)} solar masses`:`World ${body.id} · ${body.kind}${body.parent!==null?` · Moon of ${body.parent}`:''}\nMass: ${quantity(body.mass/3.003e-6)} Earth masses`);
  setText(this.rotation,spinReading(body,state.bodies.find(b=>b.id===(body.parent??0))));
  this.material.hidden=body.id===0;this.pull.hidden=true;
  if(body.id===0){setText(this.orbit,`The potential habitable zone spans ${state.status.zone_inner.toFixed(2)}–${state.status.zone_outer.toFixed(2)} AU.`);return;}
  const moonOrbit=state.moon_orbits?.find(([id])=>id===body.id)?.[1],orbit=moonOrbit||state.orbits.find(([id])=>id===body.id)?.[1];
  setText(this.orbitStatus,`${orbit.habitable?'Potentially habitable':orbit.calm?'Calm orbit':orbit.bound?'Eccentric orbit':'Escaping'} · e = ${quantity(orbit.eccentricity)}`);
  setText(this.orbit,orbitReading(body,orbit,moonOrbit?state.bodies.find(b=>b.id===body.parent):state.bodies[0]));
  setText(this.material,`Contact radius: ${quantity(body.radius)} AU. Material: ${((body.material?.ice||0)/body.mass*100).toFixed(0)}% ice, ${((body.material?.gas||0)/body.mass*100).toFixed(0)}% gas.`);
  const source=strongestPerturber(body,state.bodies,state.rules_version===1?.002:.0001);
  if(source){this.pull.hidden=false;setText(this.pull,`Strongest neighbor: World ${source.body.id} · ${(source.ratio*100).toFixed(source.ratio<.01?2:1)}% of the star's pull. The blue outline is this world's current orbit; neighbors can bend it.`);}
 }
}
