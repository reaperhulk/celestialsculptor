// Keep at most one task active and one request for its latest successor.
export class CoalescedTask {
 constructor(task){this.task=task;this.running=null;this.again=false;}
 run(){
  if(this.running){this.again=true;return this.running;}
  this.running=(async()=>{do{this.again=false;await this.task();}while(this.again);})().finally(()=>{this.running=null;});
  return this.running;
 }
}
