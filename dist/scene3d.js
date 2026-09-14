import {paintImage} from './perception.js?v=9.6';
import * as T from './vendor/three.module.js?v=9.6';
import {OrbitalWorld} from './orbital-world.js?v=9.6';
import {PLANET_RADIUS,orbitalGuidance} from './orbital.js?v=9.6';
import {CONTROL_LIMBS,limbTargets} from './kinematics.js?v=9.6';
import {oceanEnvironment,deckTexture,boosterTexture} from './ocean.js?v=9.6';
import {M,material,mesh,ellipsoid,createRocket,createBarge,createFly,createCockpit,moveRod} from './models3d.js?v=9.6';

function environment(renderer,cockpit){
 const scene=new T.Scene();scene.background=new T.Color(cockpit?'#647f93':'#89b4cc');
 const floor=new T.Mesh(new T.PlaneGeometry(20,20),new T.MeshBasicMaterial({color:cockpit?'#142334':'#163a4a'}));floor.rotation.x=-Math.PI/2;floor.position.y=-3;scene.add(floor);
 const panel=(color,intensity,pos,scale,rotation)=>{const m=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({color:new T.Color(color).multiplyScalar(intensity),side:T.DoubleSide}));m.position.set(...pos);m.scale.set(...scale);m.rotation.set(...rotation);scene.add(m);};
 panel('#fff0d7',5,[-3,4,2],[3,3,1],[Math.PI/2,0,.4]);panel('#d5eefa',3,[4,2,1],[2,4,1],[0,Math.PI/2,0]);panel('#f5bd8a',2,[-4,0,-1],[1,3,1],[0,Math.PI/2,0]);
 const generator=new T.PMREMGenerator(renderer),target=generator.fromScene(scene,.15,.1,30);generator.dispose();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});return target.texture;
}
function setup(canvas,cockpit=false){
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));renderer.setClearColor(cockpit?'#122434':'#668ea7');renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=cockpit?1.05:1.08;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(41,1,.1,cockpit?100:100000);scene.environment=environment(renderer,cockpit);scene.environmentIntensity=cockpit?.6:.65;
 const hemi=new T.HemisphereLight('#c5e8ff','#183341',cockpit?1.1:1.8);scene.add(hemi);
 const key=new T.DirectionalLight('#fff0da',cockpit?3.5:3.7);key.position.set(cockpit?-3:-110,cockpit?6:120,cockpit?5:80);scene.add(key);scene.add(key.target);key.castShadow=true;key.shadow.mapSize.set(cockpit?1024:1024,cockpit?1024:1024);const d=cockpit?4.8:60;Object.assign(key.shadow.camera,{left:-d,right:d,top:d,bottom:-d,near:.1,far:cockpit?25:450});key.shadow.bias=-.00012;key.shadow.normalBias=cockpit?.008:.045;key.shadow.radius=2;
 const rim=new T.DirectionalLight(cockpit?'#84cddd':'#acdbe8',cockpit?2.0:1.0);rim.position.set(cockpit?4:50,cockpit?2:60,cockpit?-4:-100);scene.add(rim);
 return{renderer,scene,camera,key,hemi,rim,quality:'high'};
}
function fit(view){const w=view.canvas.clientWidth,h=view.canvas.clientHeight;if(!w||!h)return false;if(view.w!==w||view.h!==h){view.renderer.setSize(w,h,false);view.camera.aspect=w/h;view.camera.updateProjectionMatrix();view.w=w;view.h=h;}return true;}
function quality(view,value){view.quality=value;view.renderer.setPixelRatio(Math.min(devicePixelRatio||1,value==='low'?1:value==='balanced'?1.25:1.6));view.renderer.shadowMap.enabled=value!=='low';view.w=0;}
const plumeGeometry=new T.ConeGeometry(.5,1,24,1,true);
function plumeMaterial(){return new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,uniforms:{clock:{value:0},power:{value:0}},vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`uniform float clock,power;varying vec2 uv0;void main(){float p=uv0.y;float bands=.7+.3*sin(p*75.-clock*22.);float fade=pow(p,.28)*smoothstep(0.,.18,p);vec3 c=mix(vec3(1.,.21,.025),vec3(.78,.87,1.),pow(p,2.5));float edge=pow(max(0.,sin(uv0.x*3.14159)),.5);gl_FragColor=vec4(c*(.85+.45*bands),fade*(.24+.55*power)*edge);}`});}
export class FlightScene3D{
 constructor(canvas){
  this.canvas=canvas;Object.assign(this,setup(canvas));this.view='chase';this.orbit=.57;this.elevation=.16;this.zoom=1;this.lastStep=-1;this.cameraReset=true;
  this.surfaceFog=new T.Fog('#84a7b9',650,6000);this.scene.fog=this.surfaceFog;this.environment=oceanEnvironment(this.scene);
  this.ship=createBarge(deckTexture());this.scene.add(this.ship);const rocket=createRocket(boosterTexture());this.rocket=rocket.root;this.pod=rocket.pod;this.fins=rocket.fins;this.legs=rocket.legs;this.engines=rocket.engines;this.scene.add(this.rocket);
  this.plumeMat=plumeMaterial();this.flames=[];this.cores=[];for(const engine of this.engines){const f=mesh(engine,plumeGeometry,this.plumeMat,[0,-3,0]);f.rotation.z=Math.PI;f.castShadow=f.receiveShadow=false;this.flames.push(f);const core=mesh(engine,new T.ConeGeometry(.29,1,12),new T.MeshBasicMaterial({color:'#fff1bf',transparent:true,opacity:.88,depthWrite:false}),[0,-1.9,0]);core.rotation.z=Math.PI;core.castShadow=false;this.cores.push(core);}
  this.engineLight=new T.PointLight('#ffb965',0,90,2);this.engineLight.position.set(0,1.4,0);this.rocket.add(this.engineLight);
  this.entryGlow=mesh(this.rocket,new T.SphereGeometry(1,24,16),new T.MeshBasicMaterial({color:'#ff6d2c',transparent:true,opacity:0,side:T.BackSide,blending:T.AdditiveBlending,depthWrite:false}),[0,4,0],[2.3,5,2.3]);this.entryGlow.castShadow=false;
  const jetMat=new T.MeshBasicMaterial({color:'#9fdceb',transparent:true,opacity:.55,depthWrite:false,blending:T.AdditiveBlending});this.jets=[];for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const j=mesh(this.rocket,new T.ConeGeometry(.16,2,8),jetMat,[Math.cos(angle)*2.8,44,Math.sin(angle)*2.8]);j.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(Math.cos(angle),0,Math.sin(angle)));j.castShadow=false;this.jets.push(j);}
  this.sparks=new T.Points(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(270),3)),new T.PointsMaterial({color:'#ffbe7a',size:1.2,transparent:true,depthWrite:false}));this.sparks.visible=false;this.scene.add(this.sparks);this.crashStarted=null;this.crashSeed=null;
  this.path=new T.Line(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(5400),3)),new T.LineBasicMaterial({color:'#aadadf',transparent:true,opacity:.38}));this.path.geometry.setDrawRange(0,0);this.scene.add(this.path);
  this.target=new T.Vector3();this.desiredCamera=new T.Vector3();this.look=new T.Vector3();this.shadowTarget=new T.Vector3();this.shadowOffset=new T.Vector3(-110,120,80);
  let drag=null;canvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!drag)return;this.orbit-=(e.clientX-drag[0])*.006;this.elevation=Math.max(-.05,Math.min(1.1,this.elevation+(e.clientY-drag[1])*.003));drag=[e.clientX,e.clientY];});for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,()=>drag=null);canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.55,Math.min(2.2,this.zoom*Math.exp(e.deltaY*.001)));},{passive:false});
 }
 setQuality(value){quality(this,value);}
 draw(s,time){
  if(!fit(this))return;const height=Math.max(0,s.y-8),phi=s.orbital?s.x/PLANET_RADIUS:0,x=s.orbital?Math.sin(phi)*(PLANET_RADIUS+height):s.x,y=s.orbital?Math.cos(phi)*(PLANET_RADIUS+height)-PLANET_RADIUS:height,z=s.z??0,heading=s.heading??0;
  const deckPhi=s.orbital?s.padX/PLANET_RADIUS:0;this.ship.position.set(s.orbital?Math.sin(deckPhi)*PLANET_RADIUS:s.padX,s.orbital?Math.cos(deckPhi)*PLANET_RADIUS-PLANET_RADIUS:0,s.padZ??0);this.ship.rotation.set(s.deckPitch??0,0,(s.deckRoll??0)-deckPhi);this.rocket.position.set(x,y+.06,z);this.rocket.rotation.set(s.angleZ??0,heading,-s.angle-phi,'YXZ');
  this.plumeMat.uniforms.clock.value=time/1000;this.plumeMat.uniforms.power.value=s.throttle;const bank=s.engineBank??1;
  for(let i=0;i<9;i++){const on=!s.done&&s.throttle>.012&&((i===0&&s.engineHealth!==0)||(bank===3&&(i===1||i===5))),len=(4+s.throttle*30)*(i===0?(s.engineHealth??1):1),f=this.flames[i],core=this.cores[i];f.visible=core.visible=on;f.scale.set(.75+s.throttle*.3,len,1);f.position.y=-1.27-len/2;core.scale.set(1,len*.28,1);core.position.y=-1.25-len*.14;this.engines[i].rotation.set(s.gimbalZ??0,0,-s.gimbal);}
  this.engineLight.intensity=s.done?0:210*s.throttle*((s.engineHealth??1)+(bank===3?1.6:0));this.fins.forEach((f,i)=>f.rotation.z=s.finAngles?.[i]??0);
  const deployment=s.orbital&&s.orbitPhase<3?Math.max(0,Math.min(1,(18-s.t)/10)):Math.max(0,Math.min(1,(190-height)/110));this.legs.forEach(l=>l.rotation.z=(1-deployment)*-.44);
  this.jets.forEach((j,i)=>{const rate=i%2?s.rcsZ:s.rcs;j.visible=!s.done&&Math.abs(rate)>.18&&(i<2?rate>0:rate<0);j.scale.y=.5+Math.abs(rate)*1.3;});
  this.entryGlow.material.opacity=s.orbital&&s.orbitPhase===4?Math.min(.17,Math.hypot(s.vx,s.vy)/1500):0;
  if(this.crashSeed!==s.seed){this.crashSeed=s.seed;this.crashStarted=null;this.sparks.visible=false;this.lastStep=-1;this.cameraReset=true;}
  if(s.done&&!s.landed){this.crashStarted??=time;const dt=(time-this.crashStarted)/1000,points=this.sparks.geometry.attributes.position;for(let i=0;i<90;i++){const a=i*2.39996,v=5+(i%13)*1.7;points.setXYZ(i,x+Math.cos(a)*v*dt,Math.max(1,y+12+Math.sin(i*1.37)*v*dt-5*dt*dt),z+Math.sin(a)*v*dt);}points.needsUpdate=true;this.sparks.visible=dt<2.6;this.sparks.material.opacity=Math.max(0,1-dt/2.6);}this.rocket.visible=!(s.done&&!s.landed);
  this.target.set(0,25,0).applyEuler(this.rocket.rotation).add(this.rocket.position);this.look.copy(this.target);
  const d=(this.view==='wide'?Math.max(150,height*.9):90)*this.zoom;
  if(this.view==='deck'&&height<400){this.desiredCamera.set(this.ship.position.x+47,this.ship.position.y+7,this.ship.position.z+61);this.look.copy(this.target);}
  else if(this.view==='pod'){this.desiredCamera.set(12,50,16).applyEuler(this.rocket.rotation).add(this.rocket.position);this.look.set(0,47,0).applyEuler(this.rocket.rotation).add(this.rocket.position);}
  else{this.desiredCamera.set(this.target.x+Math.sin(this.orbit)*d,this.target.y+d*this.elevation,this.target.z+Math.cos(this.orbit)*d);if(this.view==='wide'){this.desiredCamera.y=y+d*.48;this.look.y=y*.5+22;}}
  const map=s.orbital&&height>350&&(this.view==='wide'||s.orbitPhase===2);
  if(s.orbital){this.orbitWorld??=new OrbitalWorld(this.scene);this.orbitWorld.update(s,map);if(map){const distance=PLANET_RADIUS*2.65*Math.max(1,1/this.camera.aspect)*this.zoom;this.desiredCamera.set(Math.sin(this.orbit-.57)*distance*.25,PLANET_RADIUS*.16,distance);this.look.set(0,-PLANET_RADIUS*.80,0);}}else this.orbitWorld?.hide();
  // Follow the interpolated physical position exactly. Smooth only camera offsets.
  this.camera.position.copy(this.desiredCamera);this.camera.lookAt(this.look);this.cameraReset=false;
  this.shadowTarget.copy(this.target);if(height<100)this.shadowTarget.y=Math.max(20,y+15);this.key.target.position.copy(this.shadowTarget);this.key.position.copy(this.shadowTarget).add(this.shadowOffset);this.key.intensity=s.night?.7:s.storm?2.1:3.7;this.hemi.intensity=s.night?.5:1.5;
  this.environment.update(s,this.camera);if(s.orbital){this.environment.water.visible=height<400&&Math.abs(Math.sin(phi))<.2;this.environment.sky.visible=height<750&&!map;this.scene.fog=height>500?null:this.surfaceFog;this.hemi.intensity=height>500?.7:1.5;this.renderer.setClearColor(height>500?'#020a15':'#60889e');this.renderer.toneMappingExposure=height>500?1.0:1.08;}else{this.environment.water.visible=this.environment.sky.visible=true;this.scene.fog=this.surfaceFog;this.renderer.toneMappingExposure=s.night?1.0:1.08;}
  if(s.step!==this.lastStep&&s.step%4===0){this.lastStep=s.step;const trail=(s.trail??[]).slice(-1800),p=this.path.geometry.attributes.position;for(let i=0;i<trail.length;i++){const q=trail[i],a=q[0]/PLANET_RADIUS;p.setXYZ(i,s.orbital?Math.sin(a)*(PLANET_RADIUS+q[1]-8):q[0],s.orbital?Math.cos(a)*(PLANET_RADIUS+q[1]-8)-PLANET_RADIUS:q[1]-7.5,q[2]??0);}p.needsUpdate=true;this.path.geometry.setDrawRange(0,trail.length);this.path.geometry.computeBoundingSphere();}this.path.visible=!map;
  this.renderer.render(this.scene,this.camera);
 }
}
export class Cockpit3D{
 constructor(canvas){
  this.canvas=canvas;Object.assign(this,setup(canvas,true));Object.assign(this,createCockpit(this.scene));const fly=createFly(this.scene);this.fly=fly.root;this.head=fly.head;this.headSkin=fly.headSkin;this.eyes=fly.eyes;this.antennae=fly.antennae;this.mouth=fly.mouth;this.wings=fly.wings;this.limbs=fly.limbs;
  this.eyeView=false;this.expanded=false;this.boopUntil=0;this.expression='focused';this.history=[];this.lastStep=-1;this.lastSeed=null;this.yaw=.25;this.elevation=0;this.zoom=1;this.cutaway=true;
  const orange=new T.PointLight('#ffb76f',12,12,2);orange.position.set(-2,3,1);this.scene.add(orange);const consoleLight=new T.PointLight('#7bbec9',2,5,2);consoleLight.position.set(0,1.7,1.8);this.scene.add(consoleLight);
  const ray=new T.Raycaster();let drag=null,travel=0;canvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];travel=0;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!drag||this.eyeView)return;const dx=e.clientX-drag[0],dy=e.clientY-drag[1];travel+=Math.abs(dx)+Math.abs(dy);this.yaw=Math.max(-.95,Math.min(.95,this.yaw+dx*.004));this.elevation=Math.max(-.3,Math.min(.65,this.elevation+dy*.004));drag=[e.clientX,e.clientY];});canvas.addEventListener('pointerup',e=>{if(travel<6){const rect=canvas.getBoundingClientRect();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),this.camera);const hit=ray.intersectObjects(this.limbs.flatMap(l=>[l.upper,l.lower,l.tarsus,l.foot])).find(h=>h.object.userData.limb!==undefined);if(hit)canvas.dispatchEvent(new CustomEvent('follow-limb',{detail:hit.object.userData.limb}));}drag=null;});canvas.addEventListener('pointercancel',()=>drag=null);canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.72,Math.min(1.5,this.zoom*Math.exp(e.deltaY*.001)));},{passive:false});
 }
 setQuality(value){quality(this,value);}
 draw(s,time,mode){
  if(!fit(this))return;const highlighted=mode==='human'?[]:CONTROL_LIMBS[this.traceControl??0].limbs;
  for(let i=0;i<this.limbs.length;i++)for(const part of [this.limbs[i].upper,this.limbs[i].lower,this.limbs[i].tarsus,this.limbs[i].foot]){const on=highlighted.includes(i);part.material.emissive.set(on?'#f9b967':'#000000');part.material.emissiveIntensity=on?.22:0;part.material.color.set(on?'#f5b869':'#a67d52');}
  this.headSkin.material.emissive.set(this.traceControl===9&&mode!=='human'?'#eeb065':'#000000');this.headSkin.material.emissiveIntensity=.18;
  const danger=Math.min(1,Math.max(Math.abs(s.orbital?orbitalGuidance(s).angleError:s.angle)*2,Math.abs(s.angleZ??0)*2,(Math.abs(s.vy)-Math.sqrt(Math.max(0,s.y-8)*4)-3)/12));const mood=s.done?(s.landed?'victory':'stunned'):danger>.65?'panic':s.y<45?'focused':'confident';this.expression=mood;
  const look=s.gaze??0;this.head.rotation.y=look*.52;this.head.rotation.x=mood==='victory'?-.06-Math.sin(time*.005)*.06:look>.4?.09:-.04;
  this.eyes.forEach(e=>e.scale.setScalar(mood==='panic'?1.06:1));this.antennae.forEach((a,i)=>a.rotation.z=(i?1:-1)*(mood==='panic'?-.20:mood==='stunned'?.55:.10+Math.sin(time*.002)*.035));this.wings.forEach((w,i)=>w.rotation.z=(i?1:-1)*(mood==='victory'?.09+Math.sin(time*.035)*.08:.01+Math.sin(time*.002)*.01));
  const hands=limbTargets(s);this.throttle.position.set(...hands[0]);moveRod(this.throttleStem,[-1.6,1.58,hands[0][2]],hands[0],.034);moveRod(this.stick,[.7,1.68,1.55],hands[1],.045);this.stickBall.position.set(...hands[1]);moveRod(this.finStick,[1.6,1.68,1.4],hands[3],.035);this.finKnob.position.set(...hands[3]);this.selector.position.set(...hands[2]);this.pedals.forEach((p,i)=>{p.rotation.y=(s.yawJet??0)*.25;p.position.x=hands[4+i][0];p.position.z=hands[4+i][2];});
  this.limbs.forEach((l,i)=>{let end=hands[i];if(mood==='victory'&&i<2)end=[l.side*.95,3.2+Math.sin(time*.006)*.1,.7];const elbow=[l.side*(l.level===2?.83:1.04),l.start[1]-.28,end[2]-.50],wrist=[end[0],end[1]+.06,end[2]-.15];moveRod(l.upper,l.start,elbow,.055);moveRod(l.lower,elbow,wrist,.035);moveRod(l.tarsus,wrist,end,.023);l.joint.position.set(...elbow);l.foot.position.set(...end);l.foot.rotation.y=i>=4?(s.yawJet??0)*.25:0;for(let j=0;j<2;j++){const dx=j?.038:-.038;moveRod(l.claws[j],[end[0]+dx,end[1],end[2]+.06],[end[0]+dx,end[1]-.03,end[2]+.13],.009);}});
  if(time-(this.lastScreenTime??-1000)>100||this.lastSeed!==s.seed){this.updateScreens(s);this.lastScreenTime=time;}
  if(this.eyeView){this.camera.fov=2*Math.atan(1/1.4)*180/Math.PI;this.camera.position.set(0,2.68,.32);this.camera.lookAt(Math.sin(look*.52)*1.68,1.15,.32+Math.cos(look*.52)*1.68);this.head.visible=false;this.shell.visible=true;}
  else{this.camera.fov=Math.max(40,2*Math.atan(Math.tan(22*Math.PI/180)/this.camera.aspect)*180/Math.PI);const d=6.4*this.zoom;this.camera.position.set(Math.sin(this.yaw)*d,3.65+this.elevation*3,Math.cos(this.yaw)*d);this.camera.lookAt(0,1.75,.35);this.head.visible=true;this.shell.visible=true;}
  this.camera.updateProjectionMatrix();this.renderer.render(this.scene,this.camera);
  if(this.lastSeed!==s.seed){this.history=[];this.lastSeed=s.seed;this.lastStep=-1;}if(s.step!==this.lastStep){this.history.push([s.t,s.throttle,s.gimbal/.22,s.rcs]);if(this.history.length>180)this.history.shift();this.lastStep=s.step;}
 }
 // GPU texture storage has fixed dimensions. Release it when the display changes size.
 updateScreens(s){for(let i=0;i<3;i++){const {canvas,texture}=this.screens[i],g=canvas.getContext('2d'),image=s.perception?.screens[i],width=image?.width??768,height=image?.height??448;if(canvas.width!==width||canvas.height!==height){texture.dispose();canvas.width=width;canvas.height=height;}texture.rotation=s.perception?Math.PI:this.eyeView?Math.PI:0;if(image){paintImage(canvas,image);texture.needsUpdate=true;continue;}g.setTransform(2,0,0,2,0,0);g.fillStyle='#051b28';g.fillRect(0,0,384,224);g.font='22px monospace';g.fillStyle='#95cbd8';g.textAlign='center';g.fillText(['PROPELLANT','FLIGHT / RADAR','ENGINE BANK'][i],192,32);
 if(i===0){g.font='68px monospace';g.fillStyle=s.fuel<.3?'#ff955e':'#c4ede3';g.fillText(`${Math.round(s.fuel*100)}%`,192,126);g.fillStyle='#294354';g.fillRect(34,158,316,17);g.fillStyle='#9fe0c7';g.fillRect(34,158,316*s.fuel,17);g.font='20px monospace';g.fillStyle='#8cabbc';g.fillText(`THRUST ${Math.round(s.throttle*100)}%`,192,210);}
 else if(i===1){g.save();g.beginPath();g.rect(25,46,334,124);g.clip();g.translate(192,105);g.rotate(-s.angle);g.fillStyle='#386781';g.fillRect(-240,-160,480,160+(s.angleZ??0)*120);g.fillStyle='#946a43';g.fillRect(-240,(s.angleZ??0)*120,480,160);g.strokeStyle='#f6edc5';g.lineWidth=4;g.beginPath();g.moveTo(-35,0);g.lineTo(35,0);g.stroke();g.restore();g.font='26px monospace';g.fillStyle='#d9e4e5';g.fillText(`${Math.max(0,s.y-8).toFixed(0)} m  ${s.vy.toFixed(1)} m/s`,192,210);}
 else{for(let j=0;j<9;j++){const a=(j-1)*Math.PI/4,x=192+(j?Math.cos(a)*67:0),y=116+(j?Math.sin(a)*55:0),on=!s.done&&s.throttle>.01&&((j===0&&s.engineHealth!==0)||(s.engineBank===3&&(j===1||j===5)));g.fillStyle=j===0&&s.engineFailed?'#e36247':on?'#ffd599':'#294556';g.beginPath();g.arc(x,y,15,0,Math.PI*2);g.fill();}g.font='21px monospace';g.fillStyle='#d2e4e8';g.fillText(s.engineFailed?'CENTER THRUST FAULT':`${s.engineBank===3?'THREE':'ONE'} ENGINE SELECTED`,192,210);}texture.needsUpdate=true;}}

  drawTrace(canvas){
    const pixel=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;if(canvas.width!==Math.round(w*pixel)||canvas.height!==Math.round(h*pixel)){canvas.width=Math.round(w*pixel);canvas.height=Math.round(h*pixel);}const g=canvas.getContext('2d');g.setTransform(pixel,0,0,pixel,0,0);g.clearRect(0,0,w,h);
    const names=['THRUST','GIMBAL','RCS'],colors=['#f4a25d','#83dac8','#a897e6'];
    for(let k=0;k<3;k++){const y=14+k*(h/3);g.fillStyle='#899eb1';g.font='10px IBM Plex Mono,monospace';g.fillText(names[k],1,y+3);g.strokeStyle='#304456';g.lineWidth=.7;g.beginPath();g.moveTo(60,y);g.lineTo(w,y);g.stroke();if(this.history.length>1){g.strokeStyle=colors[k];g.lineWidth=1.2;g.beginPath();this.history.forEach((r,i)=>{const x=62+i/(this.history.length-1)*(w-65),v=k===0?r[1]*2-1:r[k+1],yy=y-v*9;i?g.lineTo(x,yy):g.moveTo(x,yy);});g.stroke();}}
  }
}
