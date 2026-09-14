import {RETINA_WIDTH as W,RETINA_HEIGHT as H,EYE_PIXELS,EMBODIED_INPUTS} from './sensory-inputs.js?v=9.6';
import {PLANET_RADIUS as R,PLANET_MU as MU} from './orbital.js?v=9.6';
import {FLIGHT_PANEL,instrumentMeasurements,paintFlightInstruments} from './flight-instruments.js?v=9.6';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,k)=>a.map(v=>v*k),norm=a=>mul(a,1/Math.hypot(...a));
// Same YXZ vehicle rotation as the visible rocket, with a fixed downward camera.
function rotate(v,pitch,roll,yaw){let [x,y,z]=v,c=Math.cos(-pitch),s=Math.sin(-pitch);[x,y]=[c*x-s*y,s*x+c*y];c=Math.cos(roll);s=Math.sin(roll);[y,z]=[c*y-s*z,s*y+c*z];c=Math.cos(yaw);s=Math.sin(yaw);return[c*x+s*z,y,-s*x+c*z];}
const image=(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)});
function pixel(im,x,y,c){const i=(y*im.width+x)*4;im.data.set([c[0],c[1],c[2],255],i);}
export function renderCamera(s,width=64,height=48){
 const im=image(width,height),phi=s.orbital?s.x/R:0,dp=s.orbital?s.padX/R:0;
 const origin=s.orbital?[Math.sin(phi)*(R+s.y),Math.cos(phi)*(R+s.y)-R,s.z]:[s.x,s.y,s.z];
 const center=s.orbital?[Math.sin(dp)*(R+2.28),Math.cos(dp)*(R+2.28)-R,s.padZ]:[s.padX,2.28,s.padZ];
 const basis=[[1,0,0],[0,1,0],[0,0,1]].map(v=>rotate(v,dp-(s.deckRoll??0),s.deckPitch??0,0));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const ray=norm(rotate([(x+.5-width/2)/(height*.67),-1,(y+.5-height/2)/(height*.67)],s.angle+phi,s.angleZ,s.heading));
  let c=[7,14,26],distance=Infinity;const den=dot(ray,basis[1]),t=dot(center.map((v,i)=>v-origin[i]),basis[1])/den;
  if(t>0){const hit=add(origin,mul(ray,t)).map((v,i)=>v-center[i]),u=dot(hit,basis[0]),v=dot(hit,basis[2]);if(Math.abs(u)<26.8&&Math.abs(v)<41.8){distance=t;const ring=Math.abs(Math.hypot(u,v)-17)<.8,hmark=(Math.abs(Math.abs(u)-5)<.7&&Math.abs(v)<7)||(Math.abs(v)<.7&&Math.abs(u)<5);c=ring||hmark?[244,231,183]:[33,48,52];if(Math.abs(u)>25||Math.abs(v)>40)c=[221,181,94];}}
  let water=Infinity;if(s.orbital){const o=add(origin,[0,R,0]),b=dot(o,ray),d=b*b-dot(o,o)+R*R;if(d>=0&&-b-Math.sqrt(d)>0)water=-b-Math.sqrt(d);}else if(ray[1]<0)water=-origin[1]/ray[1];
  if(water<distance){distance=water;const q=add(origin,mul(ray,water)),wave=Math.sin(q[0]*.19+s.t*.2)*Math.cos(q[2]*.17)*5;c=[15+wave,51+wave,68+wave];}
  if(!Number.isFinite(distance)){const sky=s.orbital?Math.exp(-Math.max(0,s.y-8)/600):1;c=[8+70*sky,14+116*sky,27+135*sky];}
  const light=s.night?.19:1,fog=s.storm&&Number.isFinite(distance)?clamp(distance/600,0,.65):0;
  pixel(im,x,y,c.map(v=>v*light*(1-fog)+75*fog));
 }return im;
}
export function paintLandingIndicators(im,levels){
 for(let k=0;k<2;k++)for(let y=k?38:2;y<(k?46:10);y++)for(let x=4;x<60;x++){const v=16+224*clamp(levels[k]);pixel(im,x,y,[v,v,v]);}
}
export function renderScreens(s){
 const screens=[image(64,48),renderCamera(s),image(64,48)];
 // Two physically displayable light indicators show measured state, not control
 // targets: clearance 0–150 m above touchdown and vertical speed −25–+25 m/s.
 // They reach the controller only through the same screen/eye optical renderer.
 if(s.instrumentLights!==false){
  paintLandingIndicators(screens[1],[clamp((s.y-8)/150),clamp((s.vy+25)/50)]);
 }
 for(const k of [0,2])for(let y=0;y<48;y++)for(let x=0;x<64;x++){
  let c=[5,20,28];if(k===0){if(x>17&&x<46&&y>7&&y<41)c=y>40-clamp(s.fuel)*32?[160,221,187]:[31,56,64];}
  else for(let j=0;j<9;j++){const a=(j-1)*Math.PI/4,cx=32+(j?Math.cos(a)*20:0),cy=24+(j?Math.sin(a)*17:0);if(Math.hypot(x-cx,y-cy)<4)c=j===0&&s.engineFailed?[230,72,43]:s.throttle>.01&&((j===0&&s.engineHealth>0)||(s.engineBank===3&&(j===1||j===5)))?[255,220,160]:[40,63,71];}
  pixel(screens[k],x,y,c);
 }
 if(s.sensoryPresentation===FLIGHT_PANEL){
  screens[0]=renderCamera(s);
  paintFlightInstruments(screens[1],s.instrumentLights===false?null:instrumentMeasurements(s).encoded);
 }
 return screens;
}
// Each retinal pixel integrates a 4×4 grid of rays through its angular area.
// Cache only the optical geometry; every call reads the current screen pixels.
// This avoids point-sampling flicker without adding navigation observations.
let retinaMap=null;
function retinalRays(gaze){
 if(retinaMap?.gaze===gaze)return retinaMap.rays;
 const rays=new Int16Array(2*W*H*16*2).fill(-1),pitch=-1.5,up=[0,Math.cos(pitch),Math.sin(pitch)],normal=[0,-Math.sin(pitch),Math.cos(pitch)],yaw=gaze*.52;
 let index=0;
 for(const side of [-1,1]){const eye=[side*.16,2.68,.32];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){
   const local=norm([(x+(sx+.5)/4-W/2)/(H*.70),(H/2-y-(sy+.5)/4)/(H*.70),1]);
   const down=-.74,c=Math.cos(down),sn=Math.sin(down),dy=c*local[1]+sn*local[2],dz=-sn*local[1]+c*local[2];
   const ray=[Math.cos(yaw)*local[0]+Math.sin(yaw)*dz,dy,-Math.sin(yaw)*local[0]+Math.cos(yaw)*dz];
   for(let k=0;k<3;k++){const center=add([(k-1)*1.35,1.22,1.77],mul(normal,.066)),t=dot(center.map((v,i)=>v-eye[i]),normal)/dot(ray,normal);if(t<=0)continue;const p=add(eye,mul(ray,t)).map((v,i)=>v-center[i]),u=p[0],v=dot(p,up);if(Math.abs(u)<=.54&&Math.abs(v)<=.33){const ix=clamp(Math.floor((.5-u/1.08)*64),0,63),iy=clamp(Math.floor((.5+v/.66)*48),0,47);rays[index]=k;rays[index+1]=iy*64+ix;}}
   index+=2;
  }
 }
 retinaMap={gaze,rays};return rays;
}
export function renderRetinas(s,screens){
 const images=[image(W,H),image(W,H)],rays=s.eyesCovered?null:retinalRays(s.gaze??0);let index=0;
 for(const im of images)for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let r=0,g=0,b=0;
  if(rays)for(let sample=0;sample<16;sample++){const k=rays[index],j=rays[index+1]*4;index+=2;if(k<0){r+=4;g+=8;b+=12;}else{const d=screens[k].data;r+=d[j];g+=d[j+1];b+=d[j+2];}}
  pixel(im,x,y,[r/16,g/16,b/16]);
 }
 return images;
}
export function bodySignals(s){
 const m=s.motionSample??[0,0,0],r=R+s.y-8;
 // Remove gravity and local-frame centrifugal/Coriolis terms from acceleration.
 const force=s.orbital?[m[0]+s.vx*s.vy/r,m[1]+MU/r**2-s.vx*s.vx/r,m[2]]:[m[0],m[1]+9.81,m[2]];
 const axes=[[1,0,0],[0,1,0],[0,0,1]].map(v=>rotate(v,s.angle,s.angleZ,s.heading)),loads=axes.map(v=>dot(v,force)/9.81);
 if(!s.motionSample)loads.fill(0);
 return[s.throttle*2-1,s.gimbal/.22,s.gimbalZ/.22,s.rcs,s.rcsZ,s.yawJet,s.finX,s.finZ,s.selector*2-1,s.gaze,s.omega,s.omegaZ,s.omegaYaw,loads[1],loads[0],loads[2],s.done?clamp(Math.abs(m[1])/30):0,clamp(s.throttle*((s.engineHealth??1)+(s.engineBank===3?1.6:0))/2.6),0,0,0,0].map(v=>clamp(v,-3,3));
}
export function sampleEmbodied(s){
 if(s.perception?.step===s.step&&s.perception.covered===!!s.eyesCovered&&s.perception.instrumentLights===(s.instrumentLights!==false)&&s.perception.sensoryPresentation===s.sensoryPresentation)return s.perception;
 const screens=renderScreens(s),eyes=renderRetinas(s,screens),observations=new Float64Array(EMBODIED_INPUTS),means=[];
 for(let k=0;k<2;k++){let sum=0;for(let j=0;j<EYE_PIXELS;j++){const d=eyes[k].data,i=j*4,v=(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255;observations[k*EYE_PIXELS+j]=v*3;sum+=v;}means.push(sum/EYE_PIXELS);}
 const body=bodySignals(s),old=s.perception,dt=old?Math.max(0,s.t-old.time):0,odor=s.odor??={acetate:0,geosmin:0,lastRelease:-10,events:[]};
 let change=0;if(old)for(let i=0;i<EYE_PIXELS*2;i++)change+=Math.abs(observations[i]-old.observations[i])/(EYE_PIXELS*2*3);
 let trigger=null;if(s.autoOdor!==false&&s.t-odor.lastRelease>2){if(Math.hypot(...body.slice(10,13))>.7||change>.045)trigger=['geosmin','Rapid rotation or retinal change'];else if(means.reduce((a,b)=>a+b)/2>.06&&Math.hypot(...body.slice(10,13))<.12&&s.t>1)trigger=['acetate','Steady body with visible monitor light'];}
 if(s.manualOdor){trigger=[s.manualOdor,'Manual release'];delete s.manualOdor;}
 for(const key of ['acetate','geosmin'])odor[key]*=Math.exp(-dt/1.8);
 if(trigger){odor[trigger[0]]=Math.min(1,odor[trigger[0]]+.7);odor.lastRelease=s.t;odor.events.push({time:s.t,odor:trigger[0],reason:trigger[1]});odor.events=odor.events.slice(-8);}
 body[18]=body[19]=odor.acetate;body[20]=body[21]=odor.geosmin;observations.set(body,EYE_PIXELS*2);
 const display=[...means.map(v=>v*3),...body];
 s.perception={step:s.step,time:s.t,covered:!!s.eyesCovered,instrumentLights:s.instrumentLights!==false,sensoryPresentation:s.sensoryPresentation,observations:Array.from(observations),raw:[...means.map(v=>v*100),...body.map((v,i)=>i===0||i===8?(v+1)*50:i<10?v*100:v)],display,eyes,screens,retinalChange:change,odor:{acetate:odor.acetate,geosmin:odor.geosmin,events:odor.events.map(e=>({...e}))}};return s.perception;
}
export function paintImage(canvas,im){if(!im)return;canvas.width=im.width;canvas.height=im.height;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(im.data),im.width,im.height),0,0);}
