import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {loadFullNetwork} from './full-network-node.mjs';
import {createFlight,fullSensors,sensors,deck,descentCue,rng,clamp} from '../dist/engine3d.js';
import {orbitalGuidance,orbitalSensors,PLANET_RADIUS} from '../dist/orbital.js';
import {SENSOR_SCHEMA,NETWORK_INPUTS} from '../dist/signals.js';
const family=process.argv[2]??'landing',count=Number(process.argv[3]??(family==='landing'?4500:4200)),baseline='a46769fdf9189f47baa65ca5a0a210efc9ff0972';
const previous=path=>execFileSync('git',['show',baseline+':'+path],{maxBuffer:20*1024*1024}).toString();
const Legacy=(await import('data:text/javascript;base64,'+Buffer.from(previous('dist/full-network.js')).toString('base64'))).FullNetwork;
const network=loadFullNetwork(),old=new Legacy(network),stride=network.motorIndices.length+1,r=rng(family==='landing'?812670:811774);
const names=family==='landing'?['full-pilot','full-specialist','full-expert']:['full-orbital'];const teachers=names.map(n=>JSON.parse(previous('dist/assets/'+n+'.json')));
const outputs=names.length*10,x=new Float64Array(count*stride),y=new Float64Array(count*outputs),zero=new Float64Array(stride*10);
function legacySensors(s){if(s.orbital)return orbitalSensors(s);const o=sensors(s),p=deck(s),c=Math.cos(s.heading),h=Math.sin(s.heading),rotate=(x,z)=>[c*x-h*z,h*x+c*z];[o[0],o[8]]=rotate((s.x-p.x)/55,(s.z-p.z)/55);[o[1],o[9]]=rotate((s.vx-p.vx)/10,(s.vz-p.vz)/10);[o[7],o[12]]=rotate(p.vx/5,p.vz/5);o[13]=(s.heading-s.styleStart-(s.styleEnabled?2*Math.PI:0))/Math.PI;o.push(s.styleEnabled?1:0);return o.map(v=>clamp(v,-3,3));}
function feedback(s,step){
 s.throttle=r();s.gimbal=clamp(r.normal()*.08,-.22,.22);s.gimbalZ=clamp(r.normal()*.07,-.22,.22);s.rcs=clamp(r.normal()*.4,-1,1);s.rcsZ=clamp(r.normal()*.3,-1,1);s.yawJet=clamp(r.normal()*.45,-1,1);s.finX=clamp(r.normal()*.4,-1,1);s.finZ=clamp(r.normal()*.35,-1,1);s.selector=s.engineBank===3?1:0;s.gaze=r()*2-1;s.finAngles=[s.finFailed?.32:s.finX*.45,s.finZ*.45,-s.finX*.45,-s.finZ*.45];
 s.previousCommands=[clamp(s.throttle*2-1+r.normal()*.12,-1,1),clamp(s.gimbal/.22+r.normal()*.12,-1,1),s.rcs,clamp(s.gimbalZ/.22+r.normal()*.12,-1,1),s.rcsZ,s.yawJet,s.finX,s.finZ,s.selector*2-1,s.gaze];
 s.motionSample=[r.normal()*4,s.throttle*24*(s.engineHealth+(s.engineBank===3?1.6:0))/(.82+.18*s.fuel)-9.81+r.normal()*2,r.normal()*3];
}
function sample(i){
 const orbital=family==='orbital',scenario=orbital?24+i%3:i%24,s=createFlight(1+Math.floor(r()*1e8),scenario);s.t=r()*45;s.phase=r()*Math.PI*2;s.fuel=.15+r()*.85;s.seenFuel=clamp(s.fuel+r.normal()*.06,0,1);s.fuelAge=r()*5;s.engineAge=r()*5;s.styleEnabled=i%5!==0;s.omega=r.normal()*.40;s.omegaZ=r.normal()*.3;s.omegaYaw=r.normal()*.45;s.gaze=r()*2-1;
 if(!orbital){s.y=8+(i%3===0?r()*70:r()*480);s.heading=s.styleStart+(s.styleEnabled?r()*Math.PI*2:0)+r.normal()*.12;s.omegaYaw=i%4?Math.min(2.4,r()*2.1):r.normal()*.2;const p=deck(s);s.x=p.x+r.normal()*35;s.z=p.z+r.normal()*30;s.vx=p.vx+r.normal()*5.8;s.vz=p.vz+r.normal()*5;s.vy=descentCue(s)+r.normal()*7;s.angle=r.normal()*(i%9?.19:.55);s.angleZ=r.normal()*.16;s.engineHealth=i%3===0?1:i%3===1?.48:0;s.seenEngine=s.engineHealth;s.engineBank=s.engineHealth===1?1:3;s.finFailed=i%9===0;}
 else{
  const phase=i%6,target=s.orbitConfig.orbitHeight??1000;s.orbitPhase=phase;s.engineBank=3;s.engineHealth=s.seenEngine=1;s.landingTurn=phase>=3?1:0;
  if(phase<=1){s.y=8+r()*target;s.vx=Math.sqrt(9.81*PLANET_RADIUS*PLANET_RADIUS/(PLANET_RADIUS+target))*Math.min(1,(s.y-8)/target)+r.normal()*12;s.vy=phase===0?25+r()*18:r.normal()*12;s.x=r()*5000;}
  else if(phase===2){s.y=8+target+r.normal()*60;s.vx=Math.sqrt(9.81*PLANET_RADIUS*PLANET_RADIUS/(PLANET_RADIUS+target))+r.normal()*8;s.vy=r.normal()*4;s.x=r()*Math.PI*2*PLANET_RADIUS;}
  else{const remaining=phase===3?900+r()*3100:phase===4?300+r()*1800:r()*420;s.x=2*Math.PI*PLANET_RADIUS-remaining;s.y=8+(phase===3?650+r()*600:phase===4?300+r()*470:5+r()*295);s.vx=Math.min(225,remaining*.11)+r.normal()*(phase===5?3:9);s.vy=phase===5?-Math.sqrt((s.y-8)*1.1)+r.normal()*4:-25+r.normal()*10;}
  const p=deck(s);s.z=p.z+r.normal()*(phase===5?14:22);s.vz=p.vz+r.normal()*3;s.angle=s.angleZ=0;const g=orbitalGuidance(s);s.angle=g.targetAngle+r.normal()*(i%13?.20:.7);s.angleZ=g.targetAngleZ+r.normal()*.13;s.heading=s.styleStart+(phase===5&&s.styleEnabled?r()*Math.PI*2:0);s.omegaYaw=phase===5?r()*1.8:r.normal()*.15;
 }
 feedback(s,i);return s;
}
const started=Date.now();for(let i=0;i<count;i++){
 if(i%23===0){network.reset();old.reset();}const s=sample(i);old.decide(legacySensors(s),zero);network.decide(fullSensors(s),zero);
 for(let j=0;j<stride-1;j++)x[i*stride+j]=network.activity[network.motorIndices[j]];x[i*stride+stride-1]=1;
 for(let k=0;k<teachers.length;k++)for(let c=0;c<10;c++){let value=teachers[k].weights[c*stride+stride-1];for(let j=0;j<stride-1;j++)value+=teachers[k].weights[c*stride+j]*old.activity[old.motorIndices[j]];y[i*outputs+k*10+c]=clamp(value,-6,6);}
 if(i%250===0)console.log(JSON.stringify({family,samples:i,total:count,seconds:Math.round((Date.now()-started)/1000)}));
}
const dir='/tmp/fly-v8/'+family;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/features.bin',Buffer.from(x.buffer));fs.writeFileSync(dir+'/targets.bin',Buffer.from(y.buffer));fs.writeFileSync(dir+'/meta.json',JSON.stringify({samples:count,stride,outputs,names,family,baseline,sensorSchema:SENSOR_SCHEMA,inputs:NETWORK_INPUTS,sensory:network.sensoryCount,seed:family==='landing'?812670:811774,method:'Complete-graph policy distillation into a consistent 46-channel sensor schema'}));console.log(JSON.stringify({family,complete:true,seconds:Math.round((Date.now()-started)/1000)}));
