// Stylized six-degree-of-freedom booster recovery. Not a flight-qualified Falcon model.
import {clamp,rng} from './engine.js';
export {clamp,rng};
export const DT=.05,INPUTS=18,OUTPUTS=10,PARAMS=202;
export const SCENARIOS=[
 {name:'01 / Landing school',subtitle:'Calm air · stationary deck',height:95,spread:7,amplitude:0,wind:0,night:false},
 {name:'02 / Atlantic return',subtitle:'Two lateral axes · moving recovery ship',height:165,spread:28,amplitude:12,wind:.25,night:false},
 {name:'03 / Fast approach',subtitle:'Higher entry · faster descent',height:260,spread:40,amplitude:17,wind:.6,night:false},
 {name:'04 / Rough seas',subtitle:'Crosswinds · rolling deck',height:230,spread:43,amplitude:24,wind:1.2,night:false},
 {name:'05 / Night shift',subtitle:'Low visibility · instrument checks',height:270,spread:45,amplitude:27,wind:1.5,night:true},
 {name:'06 / Fin trouble',subtitle:'One grid fin jams during approach',height:300,spread:43,amplitude:23,wind:1.6,night:true,failure:'fin'},
 {name:'07 / Engine trouble',subtitle:'Center engine loses thrust · choose a bank',height:310,spread:50,amplitude:25,wind:1.7,night:true,failure:'engine'},
 {name:'08 / Absolutely nominal',subtitle:'Storm · faults · very little margin',height:380,spread:60,amplitude:30,wind:2.2,night:true,failure:'both'},
];
export function deck(s,t=s.t){const c=SCENARIOS[s.scenario],a=c.amplitude;return{x:a*Math.sin(t*.11+s.phase),z:a*.65*Math.cos(t*.09+s.phase),vx:a*.11*Math.cos(t*.11+s.phase),vz:-a*.65*.09*Math.sin(t*.09+s.phase),roll:s.scenario>=3?.028*Math.sin(t*.7+s.phase):0,pitch:s.scenario>=3?.022*Math.cos(t*.61+s.phase):0};}
export function createFlight(seed=1,scenario=1){const r=rng(seed),c=SCENARIOS[scenario],s={seed,scenario,t:0,step:0,x:(r()-.5)*2*c.spread,z:(r()-.5)*2*c.spread,y:c.height+r()*25,vx:scenario?(r()-.5)*3:0,vz:scenario?(r()-.5)*3:0,vy:-8-r()*5-(scenario>=2?8:0),angle:scenario?(r()-.5)*.16:0,angleZ:scenario?(r()-.5)*.16:0,heading:scenario?(r()-.5)*.18:0,omega:0,omegaZ:0,omegaYaw:0,fuel:1,phase:r()*Math.PI*2,padX:0,padZ:0,padVx:0,padVz:0,throttle:0,gimbal:0,gimbalZ:0,rcs:0,rcsZ:0,yawJet:0,finX:0,finZ:0,finAngles:[0,0,0,0],engineBank:1,selector:0,gaze:0,engineHealth:1,finFailed:false,engineFailed:false,seenFuel:1,seenEngine:1,fuelAge:0,engineAge:0,reward:0,done:false,landed:false,reason:'',touchdown:null,trail:[],styleEnabled:true,styleStart:null,styleClean:true,styleTurn:false,recoveryHold:0,styleRecovered:false,styleBonus:0};s.styleStart=s.heading;const d=deck(s);s.padX=d.x;s.padZ=d.z;return s;}
export function descentCue(s){return -Math.min(s.scenario>=2?18:12,Math.sqrt(2*1.8*Math.max(0,s.y-8))+.5);}
export function sensors(s){const p=deck(s),alt=Math.max(0,s.y-8),descent=descentCue(s);return[(s.x-p.x)/55,(s.vx-p.vx)/10,(s.vy-descent)/12,Math.sin(s.angle)*2,s.omega,alt/160,s.seenFuel-.5,p.vx/5,(s.z-p.z)/55,(s.vz-p.vz)/10,Math.sin(s.angleZ)*2,s.omegaZ,p.vz/5,Math.sin(s.heading)*2,s.omegaYaw,s.seenEngine-1,s.fuelAge/12,s.engineAge/12].map(v=>clamp(v,-3,3));}
export function prepareCircuit(data){const connections=[];for(let dst=0;dst<96;dst++)for(let src=0;src<96;src++)if(data.matrix[dst][src])connections.push([src,dst,data.matrix[dst][src],src%12]);return{...data,n:96,connections,enc:Float64Array.from(data.encoder.flat()),dec:Float64Array.from(data.decoder.flat())};}
export function newWeights(seed=74){const r=rng(seed),w=Array.from({length:PARAMS},()=>r.normal()*.012);w[8*19+18]=-1;return w;}
export function createBrain(circuit,weights,feedback=null){const c=circuit.n?circuit:prepareCircuit(circuit);return{c,feedback,weights:Float64Array.from(weights),activity:new Float64Array(96),base:new Float64Array(96),next:new Float64Array(96),features:new Float64Array(INPUTS),action:new Float64Array(OUTPUTS),gains:Float64Array.from({length:12},(_,i)=>Math.exp(clamp(weights[190+i]??0,-1.1,1.1)))};}
export function think(b,obs){const {c,base,next,activity:a,features:f,weights:w,gains}=b;for(let j=0;j<96;j++){let v=0;for(let k=0;k<INPUTS;k++)v+=c.enc[j*INPUTS+k]*obs[k];base[j]=Math.tanh(v);next[j]=.65*base[j];}for(let e=0;e<c.connections.length;e++){const[src,dst,weight,group]=c.connections[e];next[dst]+=weight*gains[group]*base[src];}for(let j=0;j<96;j++)a[j]=Math.tanh(next[j]+.12*(b.feedback?.[j]??0));for(let k=0;k<INPUTS;k++){let v=0;for(let j=0;j<96;j++)v+=c.dec[k*96+j]*a[j];f[k]=v;}for(let k=0;k<OUTPUTS;k++){let v=w[k*19+18];for(let j=0;j<INPUTS;j++)v+=w[k*19+j]*f[j];b.action[k]=Math.tanh(v);}return b.action;}
const servo=(value,target,rate)=>value+clamp(target-value,-rate*DT,rate*DT);
// Shared by the actuator model and the decision inspector, before fuel interlock.
export function actionTargets(a){return [clamp((a[0]+1)*.5,0,1),clamp(a[1]??0,-1,1)*.22,clamp(a[2]??0,-1,1),clamp(a[3]??0,-1,1)*.22,clamp(a[4]??0,-1,1),clamp(a[5]??0,-1,1),clamp(a[6]??0,-1,1),clamp(a[7]??0,-1,1),(a[8]??-1)>.35?1:0,clamp(a[9]??0,-1,1)];}
export function advance(s,a){if(s.done)return s;const c=SCENARIOS[s.scenario];
 // These bounded displacements are the controls' physical states. Limbs reach
 // them through inverse kinematics; actions cannot jump a lever instantaneously.
 const targets=actionTargets(a);
 s.throttle=s.fuel>0?servo(s.throttle,targets[0],3):0;
 s.gimbal=servo(s.gimbal,targets[1],1.5);s.rcs=servo(s.rcs,targets[2],7);
 s.gimbalZ=servo(s.gimbalZ,targets[3],1.5);s.rcsZ=servo(s.rcsZ,targets[4],7);s.yawJet=servo(s.yawJet,targets[5],7);
 s.finX=servo(s.finX,targets[6],3);s.finZ=servo(s.finZ,targets[7],3);
 s.selector=servo(s.selector,targets[8],2.5);if(s.selector>.9)s.engineBank=3;else if(s.selector<.1)s.engineBank=1;
 s.gaze=servo(s.gaze,targets[9],3);s.fuelAge+=DT;s.engineAge+=DT;
 // Gaze samples numerical instrument readings. Outside flight cues stay available;
 // this is instrument-assisted control, not learned raw-pixel vision.
 if(s.gaze<-.25){s.seenFuel=s.fuel;s.fuelAge=0;}if(s.gaze>.25){s.seenEngine=s.engineHealth;s.engineAge=0;}
 const fault=s.t>5;if(fault&&(c.failure==='fin'||c.failure==='both'))s.finFailed=true;if(fault&&(c.failure==='engine'||c.failure==='both')){s.engineFailed=true;s.engineHealth=s.scenario===7?0:.48;}
 s.finAngles=[s.finX*.45,s.finZ*.45,-s.finX*.45,-s.finZ*.45];if(s.finFailed)s.finAngles[0]=.32;
 const windX=c.wind*(Math.sin(s.t*.71+s.phase)+.45*Math.sin(s.t*2.4))+(s.gust??0),windZ=c.wind*(Math.cos(s.t*.61+s.phase)+.3*Math.sin(s.t*1.8))+(s.gustZ??0);s.gust=(s.gust??0)*Math.exp(-DT*.6);s.gustZ=(s.gustZ??0)*Math.exp(-DT*.6);
 const power=(s.engineBank===3?s.engineHealth+1.6:s.engineHealth),accel=s.throttle*24*power/(.82+.18*s.fuel),tx=s.angle+s.gimbal,tz=s.angleZ+s.gimbalZ,air=Math.min(1.6,s.vy*s.vy/250);
 const bx=Math.sin(tx),bz=Math.cos(tx)*Math.sin(tz),ch=Math.cos(s.heading),sh=Math.sin(s.heading);s.vx+=((ch*bx+sh*bz)*accel+windX-.012*s.vx)*DT;s.vz+=((-sh*bx+ch*bz)*accel+windZ-.012*s.vz)*DT;s.vy+=(Math.cos(tx)*Math.cos(tz)*accel-9.81-.006*s.vy)*DT;
 const finX=(s.finAngles[0]-s.finAngles[2])/.9,finZ=(s.finAngles[1]-s.finAngles[3])/.9;
 s.omega+=(-s.gimbal*s.throttle*3.4*power+s.rcs*2.5+finX*.6*air-.45*s.omega)*DT;s.omegaZ+=(-s.gimbalZ*s.throttle*3.4*power+s.rcsZ*2.5+finZ*.6*air-.45*s.omegaZ)*DT;s.omegaYaw+=(s.yawJet*1.6-.4*s.omegaYaw)*DT;
 s.angle+=s.omega*DT;s.angleZ+=s.omegaZ*DT;s.heading+=s.omegaYaw*DT;s.x+=s.vx*DT;s.z+=s.vz*DT;s.y+=s.vy*DT;s.fuel=Math.max(0,s.fuel-s.throttle*power*.016*DT);s.t+=DT;s.step++;
 const p=deck(s);s.padX=p.x;s.padZ=p.z;s.padVx=p.vx;s.padVz=p.vz;s.deckRoll=p.roll;s.deckPitch=p.pitch;
 updateStyle(s);
 const o=sensors(s);s.reward-=DT*(.12+.8*(o[0]**2+o[8]**2)+.25*(o[1]**2+o[9]**2)+2.5*o[2]**2+1.7*(o[3]**2+o[10]**2)+.18*(o[4]**2+o[11]**2)+(s.y<35?.12:.008)*o[14]**2+.015*s.throttle*power+.012*(Math.min(2,s.fuelAge/10)+Math.min(2,s.engineAge/10)));
 if(s.y<=8){const error=Math.hypot(s.x-p.x,s.z-p.z),speed=Math.abs(s.vy),lateral=Math.hypot(s.vx-p.vx,s.vz-p.vz),tilt=Math.hypot(s.angle+p.roll,s.angleZ-p.pitch);s.landed=error<11&&speed<3.6&&lateral<3&&tilt<.2&&Math.abs(s.omegaYaw)<.3;s.done=true;s.touchdown={error,speed,lateral,tilt};s.reason=s.landed?'Touchdown':error>=11?'Missed the ship':tilt>=.2?'Attitude at impact':speed>=3.6?'Hard landing':lateral>=3?'Lateral impact':'Unsettled rotation';s.styleBonus=s.landed&&s.styleEnabled&&s.styleRecovered?25:0;s.reward+=s.landed?100+3*s.fuel+s.styleBonus:-30-Math.min(450,error*.5+speed*speed*1.2+lateral*lateral*.5+tilt*20);}
 else if(Math.abs(s.x)>300||Math.abs(s.z)>300||s.y>650||Math.hypot(s.angle,s.angleZ)>2.6){s.done=true;s.reason='Flight terminated';s.reward-=1000;}else if(s.t>=65){s.done=true;s.reason='Approach timed out';s.reward-=22+Math.max(0,s.y-8)*2;}
 return s;
}
export function fly(circuit,weights,seed,scenario=1,feedback=null){const s=createFlight(seed,scenario),b=createBrain(circuit,weights,feedback);let a=new Float64Array(10);while(!s.done){if(s.step%3===0)a=think(b,sensors(s));advance(s,a);}return s;}
export function evaluate(circuit,weights,seeds,scenario=1,feedback=null){let score=0,landings=0;const flights=[];for(const seed of seeds){const s=fly(circuit,weights,seed,scenario,feedback);score+=s.reward;landings+=Number(s.landed);flights.push({seed,score:s.reward,landed:s.landed,reason:s.reason,touchdown:s.touchdown});}return{score:score/seeds.length,landings,episodes:seeds.length,flights};}
export class Trainer{
 constructor(circuit,checkpoint={}){this.c=circuit.n?circuit:prepareCircuit(circuit);this.weights=Float64Array.from(checkpoint.weights??newWeights());this.generation=checkpoint.generation??0;this.episodes=checkpoint.episodes??0;this.history=checkpoint.history??[];this.scenario=checkpoint.scenario??1;this.random=rng(19403+this.generation*7919);this.sigma=.07;this.rate=.035;}
 trainGeneration(directions=12,batch=3){const r=this.random,seeds=Array.from({length:batch},()=>Math.floor(r()*1e8)),results=[];
 for(let d=0;d<directions;d++){const noise=Float64Array.from({length:PARAMS},(_,i)=>r.normal()*(i>=190?.25:i>=152&&i<171?8:1)),plus=Float64Array.from(this.weights,(w,i)=>w+noise[i]*this.sigma),minus=Float64Array.from(this.weights,(w,i)=>w-noise[i]*this.sigma);results.push({noise,p:evaluate(this.c,plus,seeds,this.scenario,this.feedback).score,m:evaluate(this.c,minus,seeds,this.scenario,this.feedback).score});}
 results.sort((a,b)=>Math.max(b.p,b.m)-Math.max(a.p,a.m));const elite=results.slice(0,Math.max(4,Math.floor(directions/2))),scores=elite.flatMap(r=>[r.p,r.m]),mean=scores.reduce((s,v)=>s+v,0)/scores.length,std=Math.max(.1,Math.sqrt(scores.reduce((s,v)=>s+(v-mean)**2,0)/scores.length)),candidate=Float64Array.from(this.weights);
 for(let i=0;i<PARAMS;i++){let v=0;for(const row of elite)v+=(row.p-row.m)*row.noise[i];candidate[i]=clamp(candidate[i]+this.rate*v/(elite.length*std),i>=190?-1.1:-8,i>=190?1.1:8);}
 const old=evaluate(this.c,this.weights,seeds,this.scenario,this.feedback),next=evaluate(this.c,candidate,seeds,this.scenario,this.feedback),accepted=next.score>=old.score;if(accepted)this.weights=candidate;this.generation++;this.episodes+=(directions*2+2)*batch;const best=accepted?next:old,entry={generation:this.generation,episodes:this.episodes,score:best.score,landings:best.landings,batch,scenario:this.scenario};this.history.push(entry);if(this.history.length>400)this.history.shift();return{...entry,accepted};}
 checkpoint(){return{version:3,circuit:'malecns-96-falcon-3d-v1',weights:Array.from(this.weights),generation:this.generation,episodes:this.episodes,scenario:this.scenario,history:this.history};}
}

// Body-frame lateral cues let the same landing task be learned at any heading.
export function fullSensors(s){
 const o=sensors(s),p=deck(s),c=Math.cos(s.heading),h=Math.sin(s.heading);
 const rotate=(x,z)=>[c*x-h*z,h*x+c*z];
 [o[0],o[8]]=rotate((s.x-p.x)/55,(s.z-p.z)/55);
 [o[1],o[9]]=rotate((s.vx-p.vx)/10,(s.vz-p.vz)/10);
 [o[7],o[12]]=rotate(p.vx/5,p.vz/5);
 o[13]=(s.heading-s.styleStart-(s.styleEnabled?2*Math.PI:0))/Math.PI;
 o.push(s.styleEnabled?1:0);return o.map(v=>clamp(v,-3,3));
}
export function updateStyle(s){
 const turn=Math.abs(s.heading-s.styleStart);
 if(!s.styleTurn&&(s.y<30||Math.hypot(s.angle,s.angleZ)>.4||Math.abs(s.omegaYaw)>2.8))s.styleClean=false;
 if(turn>=2*Math.PI-.2)s.styleTurn=true;
 const p=deck(s),settled=s.styleTurn&&s.styleClean&&s.y>12&&Math.abs(s.omegaYaw)<.2&&Math.hypot(s.angle,s.angleZ)<.16&&Math.hypot(s.omega,s.omegaZ)<.2&&Math.hypot(s.vx-p.vx,s.vz-p.vz)<3;
 s.recoveryHold=settled?s.recoveryHold+DT:0;if(s.recoveryHold>=.6)s.styleRecovered=true;
}
