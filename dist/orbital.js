import {clamp,rng} from './engine.js?v=9.5';
// A deliberately small Newtonian world compresses the orbital period. Surface
// gravity is 9.81 m/s²; these distances are sandbox meters, not an Earth model.
export const PLANET_RADIUS=6000,PLANET_MU=9.81*PLANET_RADIUS**2;
const TAU=Math.PI*2,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const ORBIT_PHASES=['Launch','Insertion','Orbit','Deorbit burn','Atmospheric entry','Barge landing'];
export function orbitalStep(s){return s.y>258?.25:.05;}
export function orbitalDeck(s,t=s.t){const a=(s.orbitConfig.amplitude??0)*(s.variation?.deck??1);return{x:s.landingTurn*TAU*PLANET_RADIUS+a*Math.sin(t*.11+s.phase),z:a*.65*Math.cos(t*.09+s.phase),vx:a*.11*Math.cos(t*.11+s.phase),vz:-a*.65*.09*Math.sin(t*.09+s.phase),roll:s.orbitPhase>=4?.018*Math.sin(t*.7+s.phase):0,pitch:s.orbitPhase>=4?.014*Math.cos(t*.61+s.phase):0};}
export function orbitalElements(s){
 const r=PLANET_RADIUS+s.y-8,h=r*s.vx,energy=(s.vx*s.vx+s.vy*s.vy)/2-PLANET_MU/r,a=-PLANET_MU/(2*energy),e=Math.sqrt(Math.max(0,1+2*energy*h*h/(PLANET_MU*PLANET_MU)));
 return{periapsis:a*(1-e)-PLANET_RADIUS,apoapsis:energy<0?a*(1+e)-PLANET_RADIUS:Infinity,eccentricity:e};
}
export function createOrbitalFlight(seed,scenario,config){
 const random=rng(seed),s={seed,scenario,orbital:true,orbitConfig:config,t:0,step:0,x:0,y:8,z:0,vx:0,vy:0,vz:0,angle:0,angleZ:0,heading:0,omega:0,omegaZ:0,omegaYaw:0,fuel:config.fuel??1,phase:random()*TAU,padX:0,padZ:0,padVx:0,padVz:0,deckRoll:0,deckPitch:0,throttle:0,gimbal:0,gimbalZ:0,rcs:0,rcsZ:0,yawJet:0,finX:0,finZ:0,finAngles:[0,0,0,0],engineBank:1,selector:0,gaze:0,engineHealth:1,finFailed:false,engineFailed:false,seenFuel:1,seenEngine:1,fuelAge:0,engineAge:0,reward:0,done:false,landed:false,reason:'',touchdown:null,trail:[],night:false,storm:false,styleEnabled:true,styleStart:0,styleClean:true,styleTurn:false,recoveryHold:0,styleRecovered:false,styleBonus:0,orbitPhase:0,orbitStart:null,orbitTravel:0,orbitHold:0,landingTurn:0,liftedOff:false,spaceReached:false,orbitComplete:false,deorbitStarted:false,entryReached:false,maxAltitude:0,maxSpeed:0,milestones:[]};
 const p=orbitalDeck(s);s.x=p.x;s.z=p.z;return s;
}
function milestone(s,name){if(s.milestones.some(m=>m.name===name))return;s.milestones.push({name,time:s.t,altitude:s.y-8});}
export function orbitalGuidance(s){
 const altitude=Math.max(0,s.y-8),r=PLANET_RADIUS+altitude,gravity=PLANET_MU/r**2,target=s.orbitConfig.orbitHeight??1000,circular=Math.sqrt(PLANET_MU/(PLANET_RADIUS+target)),p=orbitalDeck(s),remaining=p.x-s.x;
 let radialTarget,tangentTarget;
 if(s.orbitPhase<=1){radialTarget=clamp((target-altitude)*.10,-20,40);tangentTarget=circular*clamp(altitude/target,0,1);}
 else if(s.orbitPhase===2){radialTarget=clamp((target-altitude)*.07,-15,15);tangentTarget=circular;}
 else {const glideHeight=Math.max(0,remaining*.32);radialTarget=clamp((glideHeight-altitude)*.16,-32,10);tangentTarget=clamp(remaining*.11,-20,Math.min(circular,Math.sqrt(2*5*Math.max(0,remaining))));if(altitude<160||remaining<120){radialTarget=-Math.min(16,Math.sqrt(2*.55*altitude)+.2);tangentTarget=p.vx+clamp(remaining*.15,-12,18);}}
 const speed=Math.hypot(s.vx,s.vy,s.vz),drag=altitude<800?.0012*Math.exp(-altitude/150)*speed:0;
 let radialAccel=gravity-s.vx*s.vx/r+.65*(radialTarget-s.vy)+drag*s.vy,tangentAccel=.42*(tangentTarget-s.vx)+s.vy*s.vx/r+drag*s.vx;
 // In a certified stable orbit, coast. Tiny position corrections must not keep
 // switching the thrust direction between radial and tangential attitudes.
 if(s.orbitPhase===2){radialAccel=0;tangentAccel=0;}
 const crossAccel=s.orbitPhase===2?0:-.08*(s.z-p.z)-.7*(s.vz-p.vz),magnitude=Math.hypot(radialAccel,tangentAccel,crossAccel),targetAngle=magnitude>.15?Math.atan2(tangentAccel,radialAccel):Math.PI/2,targetAngleZ=Math.atan2(crossAccel,Math.max(3,Math.hypot(radialAccel,tangentAccel))),angleError=wrap(s.angle-targetAngle),angleZError=s.angleZ-targetAngleZ;
 const power=s.engineBank===3?s.engineHealth+1.6:s.engineHealth,alignment=Math.max(0,Math.cos(angleError)*Math.cos(angleZError)),throttle=clamp(magnitude*(.82+.18*s.fuel)/(24*Math.max(.1,power))*alignment**2,0,1);
 return{altitude,target,circular,remaining,radialTarget,tangentTarget,radialAccel,tangentAccel,magnitude,targetAngle,targetAngleZ,angleError,angleZError,throttle,gravity,drag};
}
export function orbitalSensors(s){
 const g=orbitalGuidance(s),p=orbitalDeck(s),style=s.styleEnabled&&s.orbitPhase===5,turnTarget=style?TAU:0;
 return[(g.target-g.altitude)/1000,(s.vx-g.tangentTarget)/100,(s.vy-g.radialTarget)/40,g.angleError,s.omega,g.altitude/1000,s.seenFuel-.5,Math.atanh(clamp(g.throttle*2-1,-.99999,.99999))/3,(s.z-p.z)/55,(s.vz-p.vz)/10,g.angleZError,s.omegaZ,g.gravity/10,(s.heading-s.styleStart-turnTarget)/Math.PI,s.omegaYaw,s.seenEngine-1,s.fuelAge/12,s.engineAge/12,s.orbitPhase<=1?-1:s.orbitPhase===2?0:1].map(v=>clamp(v,-3,3));
}
export function advanceOrbital(s,a){
 if(s.done)return s;const dt=orbitalStep(s),servo=(v,target,rate)=>v+clamp(target-v,-rate*dt*(s.variation?.servo??1),rate*dt*(s.variation?.servo??1));
 s.throttle=s.fuel>0?servo(s.throttle,clamp((a[0]+1)/2,0,1),3):0;s.gimbal=servo(s.gimbal,clamp(a[1]??0,-1,1)*.22,1.5);s.gimbalZ=servo(s.gimbalZ,clamp(a[3]??0,-1,1)*.22,1.5);
 for(const [key,index,rate] of [['rcs',2,7],['rcsZ',4,7],['yawJet',5,7],['finX',6,3],['finZ',7,3],['gaze',9,3]])s[key]=servo(s[key],clamp(a[index]??0,-1,1),rate);
 s.selector=servo(s.selector,(a[8]??-1)>.35?1:0,2.5);if(s.selector>.9)s.engineBank=3;else if(s.selector<.1)s.engineBank=1;
 s.fuelAge+=dt;s.engineAge+=dt;if(s.gaze<-.25){s.seenFuel=s.fuel;s.fuelAge=0;}if(s.gaze>.25){s.seenEngine=s.engineHealth;s.engineAge=0;}
 const power=s.engineBank===3?s.engineHealth+1.6:s.engineHealth,alt=Math.max(0,s.y-8),r=PLANET_RADIUS+alt,accel=s.throttle*24*power*(s.variation?.thrust??1)/((.82+.18*s.fuel)*(s.variation?.mass??1)),speed=Math.hypot(s.vx,s.vy,s.vz),drag=alt<800?.0012*Math.exp(-alt/150)*speed:0;
 const pitch=s.angle+s.gimbal,roll=s.angleZ+s.gimbalZ,radialThrust=Math.cos(pitch)*Math.cos(roll)*accel,tangentThrust=Math.sin(pitch)*Math.cos(roll)*accel,crossThrust=Math.sin(roll)*accel;
 const wind=(s.orbitConfig.wind??0)*(s.variation?.wind??1)*Math.exp(-alt/500),windX=wind*Math.sin(s.t*.71+s.phase)+(s.gust??0),windZ=wind*Math.cos(s.t*.61+s.phase)+(s.gustZ??0);
 s.vy+=(s.vx*s.vx/r-PLANET_MU/r**2+radialThrust-drag*s.vy)*dt;s.vx+=(-s.vy*s.vx/r+tangentThrust-drag*s.vx+windX)*dt;s.vz+=(crossThrust-drag*s.vz+windZ)*dt;
 s.omega+=(-s.gimbal*s.throttle*3.4*power+s.rcs*3.5-1.8*s.omega)*dt;s.omegaZ+=(-s.gimbalZ*s.throttle*3.4*power+s.rcsZ*3.5-1.8*s.omegaZ)*dt;s.omegaYaw+=(s.yawJet*1.6-.8*s.omegaYaw)*dt;
 s.angle+=s.omega*dt;s.angleZ+=s.omegaZ*dt;s.heading+=s.omegaYaw*dt;s.x+=s.vx/r*PLANET_RADIUS*dt;s.y+=s.vy*dt;s.z+=s.vz*dt;s.fuel=Math.max(0,s.fuel-s.throttle*power*.012*dt);s.t+=dt;s.step++;s.gust=(s.gust??0)*Math.exp(-dt*.6);s.gustZ=(s.gustZ??0)*Math.exp(-dt*.6);
 s.finAngles=[s.finX*.45,s.finZ*.45,-s.finX*.45,-s.finZ*.45];s.maxAltitude=Math.max(s.maxAltitude,s.y-8);s.maxSpeed=Math.max(s.maxSpeed,speed);
 if(!s.liftedOff&&s.y>12){s.liftedOff=true;milestone(s,'Launch');}if(!s.liftedOff){s.y=Math.max(8,s.y);s.vy=Math.max(0,s.vy);}
 if(s.y>808&&!s.spaceReached){s.spaceReached=true;milestone(s,'Space');}
 if(s.orbitPhase===0&&s.y>508)s.orbitPhase=1;
 const elements=orbitalElements(s),target=s.orbitConfig.orbitHeight??1000;
 if(s.orbitPhase<=1){const circular=elements.periapsis>800&&Math.abs(elements.apoapsis-target)<200&&Math.abs(s.vy)<5;s.orbitHold=circular?s.orbitHold+dt:0;if(s.orbitHold>=3){s.orbitPhase=2;s.orbitStart=s.x/PLANET_RADIUS;milestone(s,'Stable orbit');}}
 if(s.orbitStart!==null&&s.orbitPhase===2){if(!s.orbitComplete&&(s.y<808||elements.eccentricity>=1||elements.periapsis<0))s.orbitStart=s.x/PLANET_RADIUS;s.orbitTravel=Math.max(0,s.x/PLANET_RADIUS-s.orbitStart);if(s.orbitTravel>=TAU&&!s.orbitComplete){s.orbitComplete=true;s.landingTurn=Math.ceil((s.x/PLANET_RADIUS+.72)/TAU);milestone(s,'One full orbit');}}
 if(s.orbitPhase===2&&s.orbitComplete){const distance=s.landingTurn*TAU*PLANET_RADIUS-s.x;if(distance<4000){s.orbitPhase=3;s.deorbitStarted=true;milestone(s,'Deorbit');}}
 if(s.orbitPhase===3&&s.y<808){s.orbitPhase=4;s.entryReached=true;milestone(s,'Atmospheric entry');}
 if(s.orbitPhase===4&&s.y<308){s.orbitPhase=5;s.styleStart=s.heading;milestone(s,'Final approach');}
 const p=orbitalDeck(s);s.padX=p.x;s.padZ=p.z;s.padVx=p.vx;s.padVz=p.vz;s.deckRoll=p.roll;s.deckPitch=p.pitch;
 s.reward-=dt*(.015+.015*s.throttle*power+.008*Math.min(20,Math.abs(s.z-p.z)));
 if(s.liftedOff&&s.y<=8){const error=Math.hypot(s.x-p.x,s.z-p.z),speed=Math.abs(s.vy),lateral=Math.hypot(s.vx-p.vx,s.vz-p.vz),tilt=Math.hypot(wrap(s.angle)+p.roll,s.angleZ-p.pitch);s.done=true;s.touchdown={error,speed,lateral,tilt};s.landed=s.orbitComplete&&s.deorbitStarted&&s.entryReached&&error<(s.orbitConfig.landingRadius??11)&&speed<3.6&&lateral<3&&tilt<.2&&Math.abs(s.omegaYaw)<.3;s.reason=s.landed?'Orbit complete · barge touchdown':!s.orbitComplete?'Returned before completing an orbit':error>=11?'Missed the recovery barge':speed>=3.6?'Hard landing':tilt>=.2?'Attitude at impact':'Unsettled touchdown';s.reward+=s.landed?250+20*s.fuel:-100-Math.min(500,error*.2+speed*speed+tilt*20);if(s.landed)milestone(s,'Barge touchdown');}
 else if(s.t>650||s.y>12000||Math.abs(s.z)>1000||!Number.isFinite(s.x)){s.done=true;s.reason=s.t>650?'Orbital mission timed out':'Flight left the recovery corridor';s.reward-=500;}
 if(s.spaceReached&&!s.spaceReward){s.spaceReward=true;s.reward+=30;}if(s.orbitStart!==null&&!s.orbitReward){s.orbitReward=true;s.reward+=50;}if(s.orbitComplete&&!s.revolutionReward){s.revolutionReward=true;s.reward+=100;}
 return s;
}
