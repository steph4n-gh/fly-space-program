import {compressedArray,isMotorClass} from './full-network.js?v=9.3';
const vertex=`#version 300 es
precision highp float;
in vec3 aPosition;in float aNeuron;
uniform vec3 uCenter;uniform float uScale,uAspect,uZoom,uYaw,uPitch,uClip,uPixel;
uniform sampler2D uActivity,uGroups,uMotor;
uniform bool uAnatomy,uMotorOnly;uniform int uSelected;
out vec3 vColor;out float vAlpha;
void main(){
 int id=int(aNeuron);ivec2 cell=ivec2(id%512,id/512);
 float activity=abs(texelFetch(uActivity,cell,0).r),group=round(texelFetch(uGroups,cell,0).r*255.0),motor=texelFetch(uMotor,cell,0).r;
 vec3 p=vec3(aPosition.x-uCenter.x,-(aPosition.z-uCenter.z),aPosition.y-uCenter.y)/uScale;
 float x=cos(uYaw)*p.x+sin(uYaw)*p.z,z=-sin(uYaw)*p.x+cos(uYaw)*p.z;
 p=vec3(x,cos(uPitch)*p.y-sin(uPitch)*z,sin(uPitch)*p.y+cos(uPitch)*z);
 gl_Position=vec4(vec2(p.x/uAspect,p.y)*uZoom*2.65,p.z*.02,3.1-p.z);
 float power=clamp(activity*4.0,0.0,1.0);
 vColor=group<.5?vec3(.29,.76,.95):group<1.5?vec3(.35,.90,.82):group<2.5?vec3(.98,.60,.29):group<3.5?vec3(.99,.85,.61):vec3(.62,.54,.92);
 vAlpha=uAnatomy?.055:.020+power*.16;
 gl_PointSize=uPixel*(uAnatomy?1.05:1.0+power*.35);
 if(uMotorOnly){vAlpha*=motor>0.0?5.0:.035;gl_PointSize*=motor>0.0?2.0:1.0;}
 if(uSelected>=0){if(id==uSelected){vAlpha=.95;vColor=vec3(1.0,.91,.70);gl_PointSize=uPixel*3.0;}else vAlpha*=.08;}
 if(aPosition.z>uClip)vAlpha=0.0;
}
`;
const fragment=`#version 300 es
precision highp float;in vec3 vColor;in float vAlpha;out vec4 outColor;
void main(){vec2 p=gl_PointCoord*2.0-1.0;float r=dot(p,p);if(r>1.0||vAlpha<=0.0)discard;outColor=vec4(vColor,vAlpha*exp(-r*2.8));}
`;
function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
export class ConnectomeView{
  constructor(canvas,onSelect=()=>{}){
    this.canvas=canvas;this.revision=0;this.traceEdges=[];this.overlay=document.createElement('canvas');this.overlay.className='brain-edge-overlay';this.overlay.setAttribute('aria-hidden','true');canvas.after(this.overlay);this.onSelect=onSelect;this.parts=[];this.yaw=.02;this.pitch=-.06;this.zoom=1;this.anatomy=false;this.motorOnly=false;this.fullCNS=false;this.selected=-1;this.values=new Float32Array(512*326);this.pending=null;
    const gl=this.gl=canvas.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance'});if(!gl)throw new Error('This brain view needs WebGL 2. Try a current desktop browser.');
    const program=this.program=gl.createProgram();gl.attachShader(program,shader(gl,gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl,gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    this.uniforms={};for(const name of ['uCenter','uScale','uAspect','uZoom','uYaw','uPitch','uClip','uPixel','uActivity','uGroups','uMotor','uAnatomy','uMotorOnly','uSelected'])this.uniforms[name]=gl.getUniformLocation(program,name);
    gl.useProgram(program);this.activityTexture=this.texture(0,gl.R32F,gl.RED,gl.FLOAT,this.values);gl.uniform1i(this.uniforms.uActivity,0);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.disable(gl.DEPTH_TEST);
    let drag=null;
    canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};});
    canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;this.yaw+=dx*.008;this.pitch=Math.max(-1.4,Math.min(1.4,this.pitch+dy*.008));drag.moved||=Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5;drag.x=e.clientX;drag.y=e.clientY;});
    canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved)this.pick(e.clientX,e.clientY);drag=null;});
    canvas.addEventListener('pointercancel',()=>{drag=null;});
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.55,Math.min(3.5,this.zoom*Math.exp(-e.deltaY*.001)));},{passive:false});
    canvas.addEventListener('dblclick',()=>this.resetView());
    canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')this.yaw-=.12;else if(e.key==='ArrowRight')this.yaw+=.12;else if(e.key==='ArrowUp')this.pitch-=.1;else if(e.key==='ArrowDown')this.pitch+=.1;else if(e.key==='+'||e.key==='=')this.zoom=Math.min(3.5,this.zoom*1.1);else if(e.key==='-')this.zoom=Math.max(.55,this.zoom/1.1);else if(e.key==='Escape')this.select(-1);else return;e.preventDefault();});
  }
  texture(unit,internal,format,type,data){const gl=this.gl,t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,internal,512,326,0,format,type,data);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
  async load(onProgress=()=>{}){
    const base='assets/connectome/';const get=async file=>{const r=await fetch(base+file);if(!r.ok)throw new Error(`Could not load ${file}`);return r.json();};
    [this.manifest,this.meta,this.labels]=await Promise.all([get('manifest.json'),get('anatomy.json'),get('labels.json')]);
    const n=this.manifest.nodes;
    [this.groups,this.ids,this.types,this.classes,this.centroids]=await Promise.all([compressedArray(base+n.groups.file,Uint8Array),compressedArray(base+n.ids.file,Uint32Array),compressedArray(base+n.types.file,Uint16Array),compressedArray(base+n.classes.file,Uint8Array),compressedArray(base+this.meta.centroids,Float32Array)]);
    const groupPixels=new Uint8Array(512*326);groupPixels.set(this.groups);this.texture(1,this.gl.R8,this.gl.RED,this.gl.UNSIGNED_BYTE,groupPixels);this.gl.uniform1i(this.uniforms.uGroups,1);
    const motorPixels=new Uint8Array(512*326);this.motorIndices=Array.from(this.classes,(_,i)=>i).filter(i=>isMotorClass(this.labels.classes[this.classes[i]]));this.motorIndices.forEach(i=>motorPixels[i]=255);this.texture(2,this.gl.R8,this.gl.RED,this.gl.UNSIGNED_BYTE,motorPixels);this.gl.uniform1i(this.uniforms.uMotor,2);
    this.coreSet=new Set(this.motorIndices);let done=0,next=0;
    const load=async()=>{while(next<this.meta.chunks.length){const chunk=this.meta.chunks[next++],array=await compressedArray(base+chunk.file,Float32Array);if(array.length!==chunk.points*4)throw new Error('Incomplete anatomical point block');const gl=this.gl,vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,array,gl.STATIC_DRAW);const pos=gl.getAttribLocation(this.program,'aPosition'),id=gl.getAttribLocation(this.program,'aNeuron');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,3,gl.FLOAT,false,16,0);gl.enableVertexAttribArray(id);gl.vertexAttribPointer(id,1,gl.FLOAT,false,16,12);this.parts.push({vao,count:chunk.points});done+=chunk.points;onProgress(done,this.meta.points);}};
    await Promise.all([load(),load(),load()]);return this.meta;
  }
  setTraceEdges(edges){this.traceEdges=edges;this.revision++;}
  updateActivity(values){this.revision++;this.values.fill(0);this.values.set(values);this.pending=true;if(this.selected>=0)this.onSelect(this.neuron(this.selected));}
  resetView(){this.yaw=.02;this.pitch=-.06;this.zoom=1;this.select(-1);}
  select(id){this.selected=id;this.onSelect(id>=0?this.neuron(id):null);}
  neuron(id){return{index:id,id:this.ids[id],type:this.labels.types[this.types[id]],class:this.labels.classes[this.classes[id]],region:this.manifest.groupNames[this.groups[id]],activity:this.values[id],motor:this.coreSet.has(id)};}
  dimensions(){const rect=this.canvas.getBoundingClientRect(),b=this.fullCNS?this.meta.bounds:this.meta.brainBounds;return{w:rect.width,h:rect.height,center:b.min.map((v,i)=>(v+b.max[i])/2),scale:Math.max((b.max[0]-b.min[0])/(rect.width/rect.height),b.max[2]-b.min[2])/2};}
  pick(clientX,clientY){if(!this.centroids)return;const rect=this.canvas.getBoundingClientRect(),{w,h,center,scale}=this.dimensions();let best=-1,distance=100;const x=clientX-rect.left,y=clientY-rect.top,cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),cp=Math.cos(this.pitch),sp=Math.sin(this.pitch);
    for(let id=0;id<this.ids.length;id++){const ix=id*3;if(this.centroids[ix]===0&&this.centroids[ix+1]===0&&this.centroids[ix+2]===0)continue;if(!this.fullCNS&&this.centroids[ix+2]>this.meta.brainClipZ)continue;if(this.motorOnly&&!this.coreSet.has(id))continue;const px=(this.centroids[ix]-center[0])/scale,py=-(this.centroids[ix+2]-center[2])/scale,pz=(this.centroids[ix+1]-center[1])/scale,rx=cy*px+sy*pz,rz=-sy*px+cy*pz,ry=cp*py-sp*rz,zz=sp*py+cp*rz,f=this.zoom*2.65/(3.1-zz),sx=w/2+rx*f*h/2,syy=h/2-ry*f*h/2,d=(sx-x)**2+(syy-y)**2;if(d<distance){best=id;distance=d;}}
    this.select(best);
  }
  drawEdges(w,h,pixel){
    const c=this.overlay;c.width=Math.round(w*pixel);c.height=Math.round(h*pixel);const g=c.getContext('2d');g.scale(pixel,pixel);
    const {center,scale}=this.dimensions(),cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),cp=Math.cos(this.pitch),sp=Math.sin(this.pitch);
    const project=id=>{const i=id*3,x=this.centroids[i],y=this.centroids[i+1],z=this.centroids[i+2];if((!x&&!y&&!z)||(!this.fullCNS&&z>this.meta.brainClipZ))return null;const px=(x-center[0])/scale,py=-(z-center[2])/scale,pz=(y-center[1])/scale,rx=cy*px+sy*pz,rz=-sy*px+cy*pz,ry=cp*py-sp*rz,zz=sp*py+cp*rz,f=this.zoom*2.65/(3.1-zz);return[w/2+rx*f*h/2,h/2-ry*f*h/2];};
    let visible=0;
    for(const edge of this.traceEdges){const a=project(edge.pre),b=project(edge.post);if(!a||!b)continue;visible++;const color=edge.term>=0?'#9af4d1':'#ffb077';g.strokeStyle=color;g.fillStyle=color;g.globalAlpha=.85;g.lineWidth=1.6;g.beginPath();g.moveTo(...a);g.lineTo(...b);g.stroke();const angle=Math.atan2(b[1]-a[1],b[0]-a[0]);g.beginPath();g.moveTo(...b);g.lineTo(b[0]-7*Math.cos(angle-.4),b[1]-7*Math.sin(angle-.4));g.lineTo(b[0]-7*Math.cos(angle+.4),b[1]-7*Math.sin(angle+.4));g.fill();for(const v of [a,b]){g.beginPath();g.arc(...v,3,0,Math.PI*2);g.fill();}}
    if(this.traceEdges.length){g.globalAlpha=1;g.fillStyle='#0b1821db';g.fillRect(10,32,w-20,22);g.fillStyle='#d2eae0';g.font='10px monospace';g.fillText(`${visible} traced links · straight anchor connections`,18,47);}
  }
  draw(){const gl=this.gl,w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;const pixel=Math.min(devicePixelRatio||1,1.5),key=[w,h,pixel,this.yaw,this.pitch,this.zoom,this.anatomy,this.motorOnly,this.fullCNS,this.selected,this.parts.length,this.revision].join('/');if(key===this.drawKey)return;this.drawKey=key;if(this.canvas.width!==Math.round(w*pixel)||this.canvas.height!==Math.round(h*pixel)){this.canvas.width=Math.round(w*pixel);this.canvas.height=Math.round(h*pixel);}gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.027,.047,.073,1);gl.clear(gl.COLOR_BUFFER_BIT);if(!this.meta)return;
    gl.useProgram(this.program);if(this.pending){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.activityTexture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,512,326,gl.RED,gl.FLOAT,this.values);this.pending=false;}
    const u=this.uniforms,{center,scale}=this.dimensions();gl.uniform3fv(u.uCenter,center);gl.uniform1f(u.uScale,scale);gl.uniform1f(u.uAspect,w/h);gl.uniform1f(u.uZoom,this.zoom);gl.uniform1f(u.uYaw,this.yaw);gl.uniform1f(u.uPitch,this.pitch);gl.uniform1f(u.uClip,this.fullCNS?1e9:this.meta.brainClipZ);gl.uniform1f(u.uPixel,pixel);gl.uniform1i(u.uAnatomy,this.anatomy);gl.uniform1i(u.uMotorOnly,this.motorOnly);gl.uniform1i(u.uSelected,this.selected);
    for(const part of this.parts){gl.bindVertexArray(part.vao);gl.drawArrays(gl.POINTS,0,part.count);}this.drawEdges(w,h,pixel);
  }
}
