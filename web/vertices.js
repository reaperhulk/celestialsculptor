export class VertexStream {
  constructor(capacity){this.data=new Float32Array(capacity);this.length=0;}
  reset(){this.length=0;return this;}
  view(){return this.data.subarray(0,this.length);}
  line(ax,ay,bx,by,c,alpha){
    let i=this.length;if(i+12>this.data.length)throw new RangeError('Line vertex capacity exceeded');
    const d=this.data;d[i++]=ax;d[i++]=ay;d[i++]=c[0];d[i++]=c[1];d[i++]=c[2];d[i++]=alpha;
    d[i++]=bx;d[i++]=by;d[i++]=c[0];d[i++]=c[1];d[i++]=c[2];d[i++]=alpha;this.length=i;
  }
  point(x,y,size,c,kind,selected){
    let i=this.length;if(i+8>this.data.length)throw new RangeError('Point vertex capacity exceeded');
    const d=this.data;d[i++]=x;d[i++]=y;d[i++]=size;d[i++]=c[0];d[i++]=c[1];d[i++]=c[2];d[i++]=kind;d[i++]=selected;this.length=i;
  }
}
