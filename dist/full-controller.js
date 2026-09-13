import {createFlight,fullSensors,advance,rng} from './engine3d.js?v=8.4';
export const CONTROLLER_ID='malecns-full-rate-v2',READOUT_SIZE=21300;
export function validCheckpoint(c){return c?.version===5&&c.circuit===CONTROLLER_ID&&c.sensorSchema==='flight-senses-46-v1'&&c.weights?.length===READOUT_SIZE&&c.weights.every(Number.isFinite)&&(c.activationGain===undefined||(Number.isFinite(c.activationGain)&&c.activationGain>=1&&c.activationGain<=1.05))&&Number.isFinite(c.generation)&&Number.isFinite(c.episodes);}
export function freshCheckpoint(){const r=rng(74);return{version:5,circuit:CONTROLLER_ID,sensorSchema:'flight-senses-46-v1',inputs:46,activationGain:1,weights:Array.from({length:READOUT_SIZE},(_,i)=>i===9*2130-1?-1:r.normal()*.02),generation:0,episodes:0,history:[],scenario:1};}
export function* rollout(network,weights,seed,scenario,style=true,variability=0,activationGain=1){
 const s=createFlight(seed,scenario,variability);s.styleEnabled=style;s.activationGain=activationGain;network.setActivationGain(activationGain);network.reset();
 while(!s.done){const action=network.decide(fullSensors(s),weights);for(let j=0;j<3&&!s.done;j++)advance(s,action);yield s;}
 return s;
}
export function flightResult(s){return{seed:s.seed,scenario:s.scenario,activationGain:s.activationGain??1,score:s.reward,landed:s.landed,styleBonus:s.styleBonus,styleRecovered:s.styleRecovered,turnDegrees:(s.heading-s.styleStart)*180/Math.PI,reason:s.reason,variation:s.variation??null,touchdown:s.touchdown,time:s.t,...(s.orbital?{orbitComplete:s.orbitComplete,orbits:s.orbitTravel/(Math.PI*2),maxAltitude:s.maxAltitude,milestones:s.milestones}:{} )};}
const better=(a,b)=>a.landings>b.landings||(a.landings===b.landings&&a.score>b.score);
export class FullTrainer{
 constructor(network,checkpoint){this.network=network;this.data={...checkpoint,weights:[...checkpoint.weights],history:[...checkpoint.history]};this.scenario=checkpoint.scenario??1;this.style=true;this.variability=.4;this.profiles=[this.scenario];this.running=true;this.random=rng(19403+checkpoint.generation*7919);}
 async evaluate(weights,cases,onProgress,pause){
  const flights=[];
  for(const {seed,scenario,variability=0} of cases){let last;for(const s of rollout(this.network,weights,seed,scenario,this.style,variability,this.data.activationGain??1)){if(!this.running)return null;last=s;onProgress?.({completed:this.data.episodes,flightTime:s.t,scenario});await pause();}this.data.episodes++;flights.push(flightResult(last));}
  return{score:flights.reduce((v,s)=>v+s.score,0)/flights.length,landings:flights.filter(s=>s.landed).length,styles:flights.filter(s=>s.styleBonus>0).length,flights};
 }
 async generation(onProgress,pause=()=>new Promise(r=>setTimeout(r,0))){
  const r=this.random,count=this.profiles.length>1?4:3,cases=Array.from({length:count},(_,i)=>({seed:Math.floor(r()*1e8),scenario:this.profiles[(this.data.generation*count+i)%this.profiles.length],variability:i===0?0:this.variability})),base=this.data.weights;
  // Correlated gain changes explore useful control directions while small
  // independent perturbations keep every readout coefficient trainable.
  const stride=base.length/10,gains=Array.from({length:10},()=>r.normal()*.03);
  const noise=Float64Array.from(base,(v,i)=>v*gains[Math.floor(i/stride)]+r.normal()*.003),plus=base.map((v,i)=>v+noise[i]),minus=base.map((v,i)=>v-noise[i]);
  const old=await this.evaluate(base,cases,onProgress,pause);if(!old)return null;
  let best=old,weights=base;for(const candidate of [plus,minus]){const result=await this.evaluate(candidate,cases,onProgress,pause);if(!result)return null;if(better(result,best)){best=result;weights=candidate;}}
  const accepted=weights!==base;this.data.weights=weights;delete this.data.evaluation;this.data.generation++;this.data.scenario=this.scenario;this.data.curriculum=[...this.profiles];
  const entry={generation:this.data.generation,episodes:this.data.episodes,scenario:this.scenario,score:best.score,landings:best.landings,styles:best.styles,batch:cases.length,profiles:cases.map(c=>c.scenario),variability:this.variability,activationGain:this.data.activationGain??1,perturbation:'head gain 0.03 + coefficient noise 0.003',accepted};this.data.history.push(entry);this.data.history=this.data.history.slice(-400);return entry;
 }
 checkpoint(){return this.data;}
}
