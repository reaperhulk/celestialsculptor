// Requests are bounded and all callers are released when a worker dies.
export class RequestChannel {
  constructor(post, timeoutMs=15000){this.post=post;this.timeoutMs=timeoutMs;this.sequence=0;this.pending=new Map();this.closed=null;}
  send(type,data={}){
    if(this.closed)return Promise.reject(this.closed);
    const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{this.pending.delete(id);reject(new Error('The simulation did not respond. Reload to try again.'));},this.timeoutMs);
      this.pending.set(id,{resolve,reject,timeout});
      try{this.post({...data,type,id});}catch(error){this.receive({id,type:'error',message:error.message});}
    });
  }
  receive(data){const request=this.pending.get(data.id);if(!request)return false;clearTimeout(request.timeout);this.pending.delete(data.id);data.type==='error'?request.reject(new Error(data.message)):request.resolve(data);return true;}
  close(message){this.closed=new Error(message);for(const request of this.pending.values()){clearTimeout(request.timeout);request.reject(this.closed);}this.pending.clear();}
}
