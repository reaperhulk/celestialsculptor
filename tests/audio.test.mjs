import test from 'node:test';
import assert from 'node:assert/strict';
import {Soundscape} from '../web/audio.js';
class Node {constructor(){this.gain={value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}};this.frequency={value:0,setValueAtTime(){}};this.disconnected=false;}connect(){}disconnect(){this.disconnected=true;}start(){}stop(){}}
class Context {constructor(){this.state='suspended';this.currentTime=0;this.nodes=[];}createGain(){return new Node();}createOscillator(){const node=new Node();this.nodes.push(node);return node;}async resume(){if(this.reject)throw Error('gesture required');this.state='running';}async suspend(){this.state='suspended';}}
test('audio only reports enabled after successful resume and bounds voice resources',async()=>{
 const previous=globalThis.AudioContext;globalThis.AudioContext=Context;
 try{
  const sound=new Soundscape();await sound.toggle();assert.equal(sound.enabled,true);
  for(let i=0;i<50;i++)sound.event('collision');assert.equal(sound.voices,12);
  const notes=sound.context.nodes.filter(node=>node.onended);for(const node of notes){node.onended();assert.equal(node.disconnected,true);}assert.equal(sound.voices,0);
  await sound.toggle();sound.context.reject=true;await assert.rejects(sound.toggle(),/gesture/);assert.equal(sound.enabled,false);
  sound.context.reject=false;await sound.toggle();await sound.visibility(true);assert.equal(sound.context.state,'suspended');await sound.visibility(false);assert.equal(sound.context.state,'running');
 }finally{globalThis.AudioContext=previous;}
});
