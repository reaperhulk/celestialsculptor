export const planetVertex=`#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in float a_size;
layout(location=2) in vec3 a_color;
layout(location=3) in vec2 a_kind;
layout(location=4) in vec4 a_style;
layout(location=5) in vec3 a_light;
layout(location=6) in float a_heat;
uniform vec2 u_resolution,u_center;
uniform float u_zoom,u_tilt,u_dpr;
out vec3 v_color,v_light;
out vec2 v_kind,v_uv;
out float v_pixels;
out vec4 v_style;
out float v_heat;
void main(){
 vec2 p=a_pos-u_center;
 const vec2 corners[6]=vec2[6](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(-1,1),vec2(1,-1),vec2(1,1));
 vec2 corner=corners[gl_VertexID];v_uv=vec2(corner.x,-corner.y);v_pixels=a_size*u_dpr;
 vec2 center=vec2(p.x/u_zoom*u_resolution.y/u_resolution.x,p.y/u_zoom*u_tilt);
 gl_Position=vec4(center+corner*a_size*u_dpr/u_resolution,0,1);
 v_color=a_color;v_kind=a_kind;v_style=a_style;v_light=a_light;v_heat=a_heat;
}`;
export const planetFragment=`#version 300 es
precision highp float;
in vec3 v_color,v_light;
in vec2 v_kind,v_uv;
in float v_pixels;
in vec4 v_style;
in float v_heat;
uniform float u_time;
out vec4 outColor;
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return .55*noise(p)+.27*noise(p*2.03)+.13*noise(p*4.11)+.05*noise(p*8.3);}
void main(){
 vec2 uv=v_uv;float r=length(uv);if(r>1.)discard;
 if(v_kind.x<.5){
  float core=1.-smoothstep(.28,.34,r),glow=exp(-r*5.)*.75;
  float turbulence=fbm(vec3(uv*9.,u_time*.12));
  vec3 col=mix(v_color,vec3(1.,.95,.74),.65+core*.3)+turbulence*.16;
  outColor=vec4(col,max(core,glow)*(1.-smoothstep(.8,1.,r)));return;
 }
 if(v_kind.x>3.5){float shape=length(uv*vec2(1.,1.3));outColor=vec4(v_color*(.55+.45*(1.-uv.x)),1.-smoothstep(.42,.67,shape));return;}
 if(v_pixels<12.){float shade=.35+.65*max(0.,dot(normalize(vec3(uv.x,-uv.y,.6)),normalize(v_light)));outColor=vec4(v_color*shade,1.-smoothstep(.5,.65,r));return;}
 float sphere=.62;
 // Ring planes extend around giants; the back half is occluded by the globe.
 float ringRadius=length(vec2(uv.x+uv.y*.32,uv.y*2.8));
 float ringBand=smoothstep(.71,.76,ringRadius)*(1.-smoothstep(.95,.99,ringRadius));
 float rings=ringBand*(.48+.17*sin(ringRadius*170.))*float(v_kind.x>2.5);
 vec3 ringColor=mix(vec3(.50,.41,.31),vec3(.89,.79,.60),.5+.5*sin(ringRadius*80.));
 if(r>sphere){
  float atmosphere=exp(-(r-sphere)*33.)*.30*(1.-smoothstep(.84,.95,r));
  float selection=v_kind.y*exp(-pow((r-.91)*90.,2.))*.9;
  vec3 halo=mix(vec3(.35,.60,1.),vec3(.44,.91,.77),v_style.z);
  float alpha=max(rings,max(atmosphere,selection));
  outColor=vec4(mix(halo,ringColor,rings/max(alpha,.001)),alpha);return;
 }
 vec2 xy=uv/sphere;vec3 n=vec3(xy.x,-xy.y,sqrt(max(0.,1.-dot(xy,xy))));
 float rot=v_style.w+v_style.x*6.28;mat2 turn=mat2(cos(rot),-sin(rot),sin(rot),cos(rot));
 vec3 p=n;p.xz=turn*p.xz;p+=vec3(v_style.x*13.,v_style.x*7.,v_style.x*19.);
 vec3 light=normalize(v_light);float diffuse=max(0.,dot(n,light));
 float terrain=fbm(p*4.);vec3 surface=v_color;
 if(v_kind.x>2.5){
  float bands=sin(n.y*29.+fbm(p*5.)*8.);float fine=sin(n.y*91.+noise(p*11.)*4.);
  surface=mix(vec3(.30,.20,.17),v_color*1.2,smoothstep(-.8,.8,bands))*(.90+.1*fine);
  float storm=exp(-dot((xy-vec2(.25,-.24))*vec2(5.,11.),(xy-vec2(.25,-.24))*vec2(5.,11.)));
  surface=mix(surface,vec3(.66,.30,.17),storm*.8);
 }else{
  vec3 rock=mix(vec3(.14,.085,.055),v_color*1.1,smoothstep(.22,.73,terrain));
  float ocean=(1.-smoothstep(.44,.49,terrain))*v_style.z;
  surface=mix(rock,mix(vec3(.018,.10,.20),vec3(.04,.32,.39),terrain),ocean);
  surface=mix(surface,vec3(.19,.38,.20),smoothstep(.48,.56,terrain)*(1.-smoothstep(.62,.72,terrain))*v_style.z);
  float frost=max(smoothstep(.72,.96,abs(n.y)),smoothstep(.52,.76,terrain)*v_style.y);
  surface=mix(surface,mix(vec3(.41,.68,.76),vec3(.92,.97,1.),terrain),frost);
  float clouds=smoothstep(.57,.69,fbm(p*6.+vec3(0.,u_time*.012,0.)))*(.55*v_style.z+.18*v_style.y);
  surface=mix(surface,vec3(.97,.98,1.),clouds);
  vec3 h=normalize(light+vec3(0.,0.,1.));surface+=vec3(.7,.84,1.)*pow(max(0.,dot(n,h)),48.)*ocean*.6;
 }
 float rim=pow(1.-n.z,3.);vec3 color=surface*(.10+diffuse*.98)+vec3(.22,.40,.67)*rim*max(.1,diffuse)*.65;
 color=mix(color,vec3(1.,.35,.07)*(1.+terrain),v_heat*.7);
 if(uv.y>0.)color=mix(color,ringColor,rings);
 outColor=vec4(color,1.-smoothstep(sphere-.015,sphere,r));
}`;
